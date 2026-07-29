# Prospect Intelligence Cockpit — design contract

## Concept review set

| Concept                  | Path                                               | Review focus                                          |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| Primary desktop cockpit  | `docs/design/concepts/desktop-work-now.svg`        | Work Now hierarchy, dense queue, Today rail           |
| Desktop prospect detail  | `docs/design/concepts/desktop-prospect-detail.svg` | evidence states, scoring explanation, outreach review |
| Light Research workspace | `docs/design/concepts/desktop-light-research.svg`  | blocking question and visible unresolved state        |
| Mobile Work Now          | `docs/design/concepts/mobile-work-now.svg`         | queue-first sibling layout and bottom controls        |
| Mobile prospect detail   | `docs/design/concepts/mobile-prospect-detail.svg`  | evidence/outreach detail without desktop sidebars     |
| Offline dashboard        | `docs/design/concepts/offline-dashboard.svg`       | execution cards, tabs, local progress treatment       |

All sample names and organizations are fictional. Concepts use representative visible copy solely to approve hierarchy and tone.

## Design intent

The direction is **quiet command center**: warm canvas, ink-forward hierarchy, crisp white work surfaces, restrained D2L-informed cyan, and decisive evergreen for Work Now. The queue is dense and operational rather than a grid of equal cards. Amber always means unresolved work; coral means conflict or blocked evidence, never decoration.

## Tokens

| Token      | Value     | Use                                     |
| ---------- | --------- | --------------------------------------- |
| `canvas`   | `#F4F3EF` | application background                  |
| `surface`  | `#FFFFFF` | primary work surfaces                   |
| `ink`      | `#17242C` | core text and icon strokes              |
| `muted`    | `#68757C` | secondary metadata                      |
| `line`     | `#DCE2E2` | boundaries and row separators           |
| `brand`    | `#00A6A6` | selection, links, direct actions        |
| `work-now` | `#166B55` | authoritative ready state               |
| `research` | `#B56B13` | unresolved question and research action |
| `conflict` | `#B84D44` | conflict and blocking warning           |
| `unknown`  | `#6C648B` | explicit unknown or assumption          |

Typography uses `Inter, ui-sans-serif, system-ui` for interface text and `Source Serif 4, Georgia, serif` only for short decision rationales and opening facts. Default body size is 14px desktop and 15px mobile. Numeric data uses tabular figures.

Spacing follows a 4px base. Desktop density favors 8–12px row padding; cards use 16–20px. Corners are 6px for controls, 10px for surfaces, and fully rounded only for compact status markers. Shadows are limited to elevated drawers, sheets, and selected detail surfaces.

## Desktop container model

- The application uses the full viewport with a 72px command header.
- The execution summary is a single horizontal strip, not five equal cards.
- The primary cockpit uses a 12-column grid: queue 5 columns, prospect cockpit 5 columns, Today rail 2 columns.
- The queue remains the strongest visual mass and uses sticky column labels.
- Prospect detail scrolls independently only above 1180px. At narrower widths, Today collapses into a drawer before either core column becomes unusable.
- No more than three visualization instances appear on the initial screen: status funnel, progress line, and compact evidence health.

## Mobile sibling behavior

- Work Now opens directly to a one-column ranked queue; desktop sidebars are not stacked above it.
- Search and freshness stay in the compact header. Filters open a bottom sheet.
- Prospect selection uses push navigation and preserves queue scroll position.
- Evidence, reasoning, and outreach are segmented sections with a sticky action dock.
- Secondary detail appears in a focus-trapped bottom sheet; closing it restores focus to its trigger.
- Minimum interactive target is 44px, important values never require hover, and swipe is never the only path.

## Evidence grammar

- **Verified:** green left rule + check icon + source/date on the same surface.
- **Public research:** cyan left rule + globe/source icon.
- **Inference:** dashed violet rule + “Inference” label and confidence.
- **Unknown:** muted violet question treatment and smallest next check.
- **Conflict:** coral split-source treatment with both claims visible.
- Color is always redundant with text and iconography.

## Visible-copy contract

Approved labels are intended to remain stable: `Work Now`, `Light Research`, `Suppress`, `Next Actions`, `Why today`, `Recommended action`, `Why this score?`, `Verified facts`, `Public research`, `Inference`, `Unknowns`, `Conflicts`, `Customer story`, `Needs review`, `Fact-check targets`, `Changed since last draft`, `Sent`, `Connected`, `Needs Research`, and `Skip`.

Tone rules: direct, seller-centered, short, and factual. Never use “AI-powered,” “magic,” “hot lead,” “intent surge,” or invented urgency. Empty state copy states what is absent and the smallest safe next action.

## Motion and accessibility

- Focus rings are 2px `brand` with 2px offset.
- All status meaning has text/icon redundancy and meets WCAG AA contrast targets.
- Reduced motion removes translation and progress animation.
- Toasts use a polite live region; failures remain visible until dismissed.
- Tables, tabs, drawers, copy actions, and status controls have complete keyboard paths.

## Approval record

Approved by Pat on July 29, 2026. The complete six-concept set and this contract are the implementation baseline; material visual changes require a documented design-contract update.
