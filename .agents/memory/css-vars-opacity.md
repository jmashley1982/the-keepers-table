---
name: CSS variable opacity with Tailwind v3
description: @apply cannot use /opacity modifiers on CSS-variable-based colors in Tailwind v3
---

## Rule
Never use `@apply bg-<css-var-color>/opacity` or `border-<css-var-color>/opacity` inside `@layer components`. Use `color-mix()` in plain CSS instead.

**Why:** Tailwind v3 opacity modifiers (e.g. `bg-gm-secret/30`) require the color to be defined as a Tailwind color with RGB channels, not as a CSS `var()`. When used inside `@apply`, PostCSS throws: "The `border-gm-secret/30` class does not exist."

## How to apply
```css
/* WRONG — breaks in @apply */
.gm-secret { @apply border border-gm-secret/30 bg-gm-secret/5; }

/* RIGHT — use color-mix() in plain CSS */
.gm-secret {
  @apply rounded-card;
  border: 1px solid color-mix(in srgb, var(--color-gm-secret) 30%, transparent);
  background-color: color-mix(in srgb, var(--color-gm-secret) 5%, transparent);
}
```
This works because `color-mix()` is a native CSS function that operates on the resolved value at render time.
