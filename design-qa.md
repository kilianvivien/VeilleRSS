# Mobile Carte design QA

- Source visual truth: `/Users/kilianvivien/Desktop/Simulator Screenshot - iPhone 17 - 2026-08-22 at 22.33.11.png`
- Implementation screenshot: `/Users/kilianvivien/Documents/Concept AppliRevue/VeilleRSS/implementation-mobile-carte.jpg`
- Expanded-details screenshot: `/Users/kilianvivien/Documents/Concept AppliRevue/VeilleRSS/implementation-mobile-carte-expanded.jpg`
- Combined comparison: `/Users/kilianvivien/Documents/Concept AppliRevue/VeilleRSS/design-qa-comparison.jpg`
- Viewport: 402 × 874 CSS px
- Density normalization: the 1206 × 2622 source capture was normalized from 3× to 402 × 874; the browser implementation capture is 402 × 874 at 1×.
- State: light theme, 24-hour window, eight related topics, first topic selected, compact detail summary open.

## Full-view comparison evidence

The normalized side-by-side comparison shows that the implementation preserves the original header, topic ring, center topic, node interactions, inspector, and primary action. On mobile, the redundant source pills and overlaid legend no longer compete with or clip the topic nodes. The inspector uses a compact three-column summary and leaves enough vertical room for the full graph.

## Focused region evidence

A separate focused crop was not needed: at 402 × 874, the header controls, every topic label/count, the three summary metrics, disclosure, and primary action are readable in the full-view comparison. The expanded-details screenshot additionally confirms that the sparkline remains available inside the disclosure without covering the primary action.

## Required fidelity surfaces

- Fonts and typography: unchanged application type, weights, hierarchy, and truncation rules; all mobile labels remain readable.
- Spacing and layout rhythm: improved. Topic nodes have clear separation, the graph no longer shares space with source badges or the legend, and the compact inspector preserves graph height.
- Colors and visual tokens: unchanged application accent, surfaces, borders, semantic green, and shadows.
- Image quality and asset fidelity: no raster assets are used in this UI; the existing Lucide icons and canvas relationship lines remain sharp.
- Copy and content: existing French labels and actions are preserved. “Diversité des sources” is shortened to “Sources” only in the compact mobile summary; the full trend/source/article content remains available under “Voir le détail de la tendance”.

## Comparison history

1. Source finding — P2: source pills were clipped against the graph edges and overlapped topic nodes; the legend covered the bottom branch when the inspector opened.
2. Fix: hide the redundant source pills, their connector extensions, and the legend below 640 px; keep all three on larger layouts.
3. Source finding — P2: the always-expanded inspector consumed too much vertical space and visibly cut the trend section.
4. Fix: use a compact mobile metric grid and a disclosure for the complete sparkline, source list, and recent-article content.
5. Post-fix evidence: `implementation-mobile-carte.jpg` shows all eight topics and persistent controls without horizontal overflow or overlap. `implementation-mobile-carte-expanded.jpg` shows the disclosure open with the sparkline visible and the primary action unobscured.

## Verification

- Primary interactions tested: open Carte, selected-topic summary, expand full trend details.
- Horizontal overflow: none.
- Browser console errors: none.
- Residual limitation: the in-app browser uses a clean local data fixture for the populated visual state; article counts differ from the source capture, but layout density and interaction state match.

final result: passed
