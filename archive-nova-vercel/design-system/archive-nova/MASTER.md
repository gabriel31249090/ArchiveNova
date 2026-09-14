# ArchiveNova Design System v1

## North Star

ArchiveNova is an editorial, community-first archive for reading and writing. It should feel literary and human, but never nostalgic to the point of becoming difficult to use.

**Design dials**
- Design variance: **7/10** — distinctive, editorial, asymmetric when useful.
- Motion intensity: **6/10** — visible polish, never spectacle before content.
- Visual density: **4/10** — comfortable, breathable, suitable for long reading/writing sessions.

## Product principles

1. **Content before chrome.** Stories, authors, posts and editor content outrank decorative UI.
2. **Transparent discovery.** Explain recommendation reasons and never visually imply a hidden ranking.
3. **Editorial + modern.** Serif display typography may create identity; controls remain clean sans-serif.
4. **Community without competition.** Metrics inform creators without turning public profiles into leaderboards.
5. **Accessible by default.** Keyboard, focus, contrast, reduced motion and resilient text are release requirements.

## Core tokens

### Color — light
- Background: `#f5f3ef`
- Surface: `#ffffff`
- Surface secondary: `#eeeae4`
- Text: `#201b1c`
- Muted text: `#746a6c`
- Primary: `#8d1d35`
- Primary hover: `#b53250`
- Primary soft: `#f8e7eb`
- Border: `#ddd6d2`
- Success: `#2f8f5b`
- Warning: `#b57a1c`
- Danger: `#b6384e`

### Color — dark
- Background: `#131114`
- Surface: `#1c191d`
- Surface secondary: `#252126`
- Text: `#f4eef0`
- Muted text: `#b6aeb1`
- Primary: `#e45576`
- Primary hover: `#ff7694`
- Primary soft: `#351d25`
- Border: `#393238`

### Typography
- UI/body: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
- Editorial/display: `Georgia, "Times New Roman", serif`
- Body default: 15–16px
- Reading prose: 18–20px, line-height 1.75–1.95
- Microcopy: minimum 11px except decorative preview mockups
- Headings use tight tracking only at large sizes.

### Radius
- xs 8px
- sm 10px
- md 12px
- lg 16px
- xl 20px
- 2xl 24px
- pill 999px

### Spacing
Use a 4px base scale:
`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`.

### Elevation
- Card: subtle border first, shadow second.
- Floating: `0 18px 50px rgba(40,22,27,.10)`
- Overlay: `0 32px 90px rgba(0,0,0,.28)`

## Components

### Buttons
- Primary: filled burgundy/coral.
- Secondary: surface + border.
- Ghost: transparent + border or text-only.
- Minimum control height: 40px desktop, 44px touch contexts.
- Never shift layout on hover. Translate up by at most 1–2px on pointer devices only.

### Inputs
- Visible label whenever the field is non-trivial.
- Focus ring is mandatory.
- Placeholder is an example, not the label.
- Error text appears near the field and is not communicated by color alone.

### Cards
- One dominant action per card.
- Avoid nested borders unless they communicate hierarchy.
- Story cards prioritize title, author, fandom/tags, summary, then metrics.

### Tags and badges
- Must wrap safely.
- Do not clip essential labels.
- Status meaning cannot rely on color alone.

### Modals
- Trap focus when modal.
- Escape closes non-destructive dialogs.
- Destructive actions use an ArchiveNova confirmation dialog instead of `window.confirm`.

### Empty/loading/error states
Every data-driven surface must define:
- skeleton/loading
- empty
- recoverable error
- retry action when applicable.

## Icons

Use **vector SVG icons** through `components/ui/nova-icon.tsx` for structural controls and navigation.

The four-point sparkle **✦** is part of ArchiveNova's brand mark and may remain as a brand/decorative motif.

Do not use font emoji/symbols as navigation or control icons. Decorative mockups may simplify icons if they are explicitly `aria-hidden`.

## Motion

- Standard entrances: 180–320ms.
- Large landing reveals: 500–750ms.
- Exit should be equal or faster than enter.
- Animate `opacity` and `transform` preferentially.
- Avoid layout-triggering animation.
- Respect `prefers-reduced-motion: reduce`.
- Animation must never be required to reveal essential content.

## Accessibility release checks

- Visible `:focus-visible` on interactive controls.
- Text contrast target: WCAG AA.
- All icon-only controls have accessible names.
- Keyboard flows for menus, dialogs and editors.
- 200% zoom must remain usable.
- Test narrow width at 375px.
- Text/tags must survive long Portuguese and English strings.
- Reduced motion mode must remove non-essential animation.

## Responsive checkpoints

Mandatory manual/visual checks:
- 375px
- 768px
- 1024px
- 1440px

Optional wide check: 1920px.

## Page hierarchy

Page-specific files under `pages/` override this document only where explicitly stated. Otherwise MASTER is authoritative.
