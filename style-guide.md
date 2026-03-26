# AI Copilot – UI Style Guide

This document defines the visual design language for the Gmail AI Copilot
extension. Every UI component injected into Gmail must feel **native** — as if
it were built by the Gmail team. Refer to this guide for all future UI work.

---

## 1. Design Principles

| Principle | Meaning |
|---|---|
| **Blend, don't brand** | The panel should feel like a native Gmail sidebar (like Keep or Calendar), not a third-party widget. |
| **Quiet chrome, loud content** | Structural UI (borders, headers, labels) should recede; the AI-generated content should be the focus. |
| **Consistent rounding** | Use the same border-radius scale everywhere — never mix sharp and round corners. |
| **Light touch** | Prefer elevation (shadow) over borders. When borders are needed, keep them faint. |
| **Accessible contrast** | All text must meet WCAG AA (4.5:1 for body, 3:1 for large text). |

---

## 2. Color Palette

### Core

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#202124` | Headings, body text |
| `--text-secondary` | `#5f6368` | Labels, meta, timestamps |
| `--text-tertiary` | `#80868b` | Hints, placeholders, disabled |
| `--surface` | `#ffffff` | Cards, panel background |
| `--surface-dim` | `#f8f9fa` | Panel body background, alternate rows |
| `--border` | `#dadce0` | Card borders, dividers |
| `--border-light` | `#e8eaed` | Subtle separators inside cards |

### Accent (Google Blue family)

| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#1a73e8` | Primary buttons, links, active states |
| `--accent-hover` | `#1765cc` | Button hover |
| `--accent-surface` | `#e8f0fe` | Selected / highlighted card backgrounds |
| `--accent-text` | `#174ea6` | Accent text on light backgrounds |

### Semantic

| Token | Hex | Usage |
|---|---|---|
| `--success` | `#188038` | Success states, "low" priority |
| `--success-surface` | `#e6f4ea` | Success background |
| `--warning` | `#e37400` | Medium priority, caution |
| `--warning-surface` | `#fef7e0` | Warning background |
| `--error` | `#d93025` | Errors, "high" priority |
| `--error-surface` | `#fce8e6` | Error background |

---

## 3. Typography

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| Panel header title | Google Sans / system | 14px | 500 | `--text-primary` |
| Section heading | Google Sans / system | 14px | 500 | `--text-primary` |
| Card label | System sans | 11px | 500 | `--text-secondary` |
| Body text | System sans | 13px | 400 | `--text-primary` |
| Small / meta | System sans | 12px | 400 | `--text-secondary` |
| Button label | System sans | 13px | 500 | varies |

**Font stack:**
```
'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

---

## 4. Spacing & Layout

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | 4px | Inline gaps, icon padding |
| `--space-sm` | 8px | Compact internal padding |
| `--space-md` | 12px | Card padding, section gaps |
| `--space-lg` | 16px | Panel body padding, card margins |
| `--space-xl` | 20px | Panel side padding, major sections |
| `--space-2xl` | 24px | Top-level section spacing |

---

## 5. Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Inline badges, small chips |
| `--radius-md` | 8px | Cards, buttons, inputs |
| `--radius-lg` | 12px | Modals, the panel itself |
| `--radius-full` | 100px | Pills, avatar circles |

> Gmail consistently uses 8px for cards and 20–24px for pills. Never use
> sharp 0px corners on interactive elements.

---

## 6. Elevation (Shadows)

| Level | CSS | Usage |
|---|---|---|
| 0 | none | Flat elements inside a card |
| 1 | `0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)` | Cards at rest |
| 2 | `0 1px 3px rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)` | Cards on hover, floating bar |
| 3 | `0 4px 8px rgba(60,64,67,.3), 0 8px 16px 6px rgba(60,64,67,.15)` | Panel, dialogs |

> Prefer elevation over visible borders. A card with `elevation-1` does not
> need a `1px solid` border.

---

## 7. Components

### Side Panel

- Sits flush right, full height, 420px wide.
- Background: `--surface-dim` for the body area.
- Header: white background, bottom border `--border`, no gradient.
- Close button: icon-only, round (`--radius-full`), 32×32px.

### Cards

- Background: `--surface` (white).
- Border-radius: `--radius-md` (8px).
- Shadow: elevation 1.
- Padding: 12–16px.
- Hover: elevation 2 with a subtle transition.
- No colored left-borders or gradients (reserve the left accent line for the
  TL;DR highlight only).

### Buttons

| Variant | Background | Color | Border |
|---|---|---|---|
| Primary (filled) | `--accent` | white | none |
| Secondary (outlined) | transparent | `--accent` | 1px solid `--accent` |
| Tertiary (text) | transparent | `--accent` | none |
| Ghost | transparent | `--text-secondary` | none |

All buttons: 8px radius, 13px font, 500 weight, 8px 16px padding.

### Chips

- Pill shape (`--radius-full`).
- Border: 1px solid `--border`.
- Background: `--surface`.
- On hover: background `--accent-surface`, border `--accent`, color `--accent`.
- Height: ~28px, padding: 0 12px.

### Action Items

- Each row is a card (elevation 1) with checkbox + text.
- Priority badges: pill with semantic bg + text color (e.g. red/red-surface for High).
- On checkbox check: text gets `line-through` and dims.

### Toast Notifications

- Position: fixed bottom-right.
- Border-radius: `--radius-md`.
- Shadow: elevation 2.
- Background: `--text-primary` (dark) for all types, with a left-color strip for semantic color.

### Extension Popup (Dark mode)

The popup uses a dark theme that mirrors the floating action bar's palette.

**Dark-mode tokens used by the popup:**

| Token | Hex | Usage |
|---|---|---|
| `--dm-surface-base` | `#1a1b1e` | Body / container background |
| `--dm-surface` | `#202124` | Header, cards, footer, model cells |
| `--dm-surface-raised` | `#292a2d` | Code blocks, input backgrounds |
| `--dm-text-primary` | `#e8eaed` | Headings, body text, values |
| `--dm-text-secondary` | `#9aa0a6` | Labels, subtitles, descriptions |
| `--dm-text-tertiary` | `#80868b` | Footer text |
| `--dm-text-muted` | `#bdc1c6` | Step text, toggle knob (off) |
| `--dm-border` | `#3c4043` | Dividers, card borders, grid gaps |
| `--dm-border-subtle` | `#5f6368` | Button borders, toggle track (off) |
| `--dm-accent` | `#8ab4f8` | Accent blue (star icon, toggle on, stat values, links) |
| `--dm-accent-surface` | `rgba(138,180,248,.12)` | Step number circles, hover tints |
| `--dm-success` | `#81c995` | Connected dot, connected text |
| `--dm-warning` | `#fdd663` | CORS warning dot / text |
| `--dm-error` | `#f28b82` | Disconnected dot / text, danger buttons |

**Component specs:**

- Width: 380px, background: `--dm-surface-base`.
- Header: `--dm-surface` bg, bottom border `--dm-border`, star icon (`--dm-accent`) + title (14px/500 `--dm-text-primary`) + subtitle (12px `--dm-text-secondary`).
- Cards: `--dm-surface` bg, 8px radius, dark elevation (`rgba(0,0,0,.5)`), 14–16px padding.
- Status indicator: 10px dot with 3px ring using `--dm-success`/`--dm-error`/`--dm-warning` at 20% opacity.
- Toggle: 36×20px, `--dm-border-subtle` track, `--dm-text-muted` knob; checked: `--dm-accent` track, white knob.
- Memory stats: value (20px/500 `--dm-accent`) + label (11px `--dm-text-secondary`), divided by `--dm-border`.
- Button: danger variant (`--dm-error` text, `--dm-border-subtle` border) for clearing Your Brain memory.
- Models: 2-column grid, `--dm-border` gap, `--dm-surface` cells.
- Quick start: numbered circles (`--dm-accent-surface` bg, `--dm-accent` text), step text `--dm-text-muted`.
- Footer: `--dm-surface` bg, top border `--dm-border`, 11px `--dm-text-tertiary`.

---

## 8. Iconography

- Prefer text / Unicode symbols over emojis to match Gmail's clean aesthetic.
- Use lightweight Material-style markers (bullets, dashes) for list items.
- Icons in section headers: 18–20px, `--text-secondary` color.

---

## 9. Motion

| Property | Duration | Easing |
|---|---|---|
| Panel slide-in | 250ms | `cubic-bezier(.4, 0, .2, 1)` (Material standard) |
| Card hover elevation | 150ms | ease |
| Button state change | 100ms | ease |
| Toast appear/dismiss | 200ms | ease-out / ease-in |
| Content fade-in | 200ms | ease |

---

## 10. Do's and Don'ts

| Do | Don't |
|---|---|
| Use Google Blue as the single accent color | Use purple, indigo, or multi-color gradients |
| Use elevation for depth | Use thick or colored borders for emphasis |
| Keep labels lowercase / sentence case | Use SCREAMING_UPPERCASE labels |
| Keep the header clean and light | Add flashy gradients or pulsing animations |
| Match Gmail's 8px card radius | Mix 6px, 12px, 20px radius on cards |
| Use subtle background tints for sections | Use bright/saturated section backgrounds |
