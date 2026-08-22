/**
 * Génère les icônes PWA (PNG 192/512 + variante maskable) sans dépendance :
 * le dessin du favicon.svg (tuile dégradée + ondes RSS blanches) est
 * redessiné mathématiquement puis encodé en PNG à la main.
 *
 * Usage : node scripts/generate-pwa-icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public')

/** Espace de design : 64×64 comme favicon.svg. */
const DESIGN = 64

const GRADIENT_TOP = [0x6b, 0xa4, 0xff]
const GRADIENT_BOTTOM = [0x2f, 0x6f, 0xe4]

/** Centre commun des deux arcs RSS ; ils balaient le quadrant haut-droit. */
const ARC_CENTER = { x: 20, y: 44 }
const ARC_RADII = [13, 24]
const STROKE_HALF = 5.5 / 2
const DOT = { x: 24.5, y: 39.5, r: 4.5 }
const TILE_RADIUS = 14

/**
 * @param {number} size          côté final en pixels
 * @param {boolean} maskable     plein-cadre + glyphe réduit (zone de sûreté)
 * @param {number} supersampling facteur d'anticrénelage
 */
function renderIcon(size, { maskable = false, supersampling = 4 } = {}) {
  const total = size * supersampling
  const scale = total / DESIGN
  // En maskable, le glyphe est réduit autour du centre pour rester dans la
  // zone de sûreté (cercle inscrit ~80 %) quel que soit le masque plateforme.
  const glyphScale = maskable ? 0.62 : 1
  const glyphCenter = DESIGN / 2

  const data = new Float64Array(total * total)

  for (let py = 0; py < total; py += 1) {
    for (let px = 0; px < total; px += 1) {
      // Échantillonnage 2×2 dans le pixel pour lisser tuile et glyphes.
      let coverage = 0
      for (let sy = 0; sy < 2; sy += 1) {
        for (let sx = 0; sx < 2; sx += 1) {
          const x = (px + (sx + 0.5) / 2) / scale
          const y = (py + (sy + 0.5) / 2) / scale
          if (!insideRoundedTile(x, y)) continue
          if (!isWhiteGlyph(x, y, glyphScale, glyphCenter)) continue
          coverage += 0.25
        }
      }
      data[py * total + px] = coverage
    }
  }

  // Rééchantillonnage boîte : moyenne des blocs de supersampling² vers la
  // taille finale demandée.
  const finalData = new Float64Array(size * size)
  const block = supersampling * supersampling
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0
      for (let sy = 0; sy < supersampling; sy += 1) {
        const row = (y * supersampling + sy) * total
        for (let sx = 0; sx < supersampling; sx += 1) {
          sum += data[row + x * supersampling + sx]
        }
      }
      finalData[y * size + x] = sum / block
    }
  }

  return { data: finalData, size }
}

function insideRoundedTile(x, y) {
  const rx = TILE_RADIUS
  if (x >= rx && x <= DESIGN - rx) return true
  if (y >= rx && y <= DESIGN - rx) return true
  const cx = x < rx ? rx : DESIGN - rx
  const cy = y < rx ? rx : DESIGN - rx
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= rx * rx
}

function isWhiteGlyph(x, y, glyphScale, center) {
  // Reprojection autour du centre pour la version maskable réduite.
  const gx = center + (x - center) / glyphScale
  const gy = center + (y - center) / glyphScale

  const dxDot = gx - DOT.x
  const dyDot = gy - DOT.y
  if (dxDot * dxDot + dyDot * dyDot <= DOT.r * DOT.r) return true

  const dxArc = gx - ARC_CENTER.x
  const dyArc = gy - ARC_CENTER.y
  if (gx < ARC_CENTER.x || gy > ARC_CENTER.y) return false
  const dist = Math.hypot(dxArc, dyArc)
  return ARC_RADII.some((r) => Math.abs(dist - r) <= STROKE_HALF)
}

/* ---------- Encodage PNG (RGBA, filtre 0) ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, payload) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng({ data, size }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // filtre None
    for (let x = 0; x < size; x += 1) {
      const coverage = data[y * size + x]
      if (coverage === 0) continue
      const t = y / size
      const offset = y * (stride + 1) + 1 + x * 4
      raw[offset] = Math.round(GRADIENT_TOP[0] + (GRADIENT_BOTTOM[0] - GRADIENT_TOP[0]) * t)
      raw[offset + 1] = Math.round(GRADIENT_TOP[1] + (GRADIENT_BOTTOM[1] - GRADIENT_TOP[1]) * t)
      raw[offset + 2] = Math.round(GRADIENT_TOP[2] + (GRADIENT_BOTTOM[2] - GRADIENT_TOP[2]) * t)
      raw[offset + 3] = Math.round(coverage * 255)
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'pwa-maskable-512.png', size: 512, maskable: true },
]

for (const target of targets) {
  const png = encodePng(renderIcon(target.size, { maskable: target.maskable }))
  writeFileSync(join(OUT_DIR, target.file), png)
  console.log(`✓ public/${target.file} (${png.length} octets)`)
}
