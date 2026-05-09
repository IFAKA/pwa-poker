# AGENTS.md

## Project

Offline-installable poker table companion for groups using a physical deck only. The app acts as the table bank and action guide: it tracks players, blinds, dealer position, turns, bets, folds, streets, pot, payouts, and table state without dealing cards digitally.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS v4
- shadcn/ui-style local components in `components/ui`
- PWA primitives in `public/manifest.webmanifest` and `public/sw.js`

## Development

- Use `npm run dev` for local development.
- Use `npm run build` before handing off meaningful changes.
- Keep client state local and offline-first unless a backend is explicitly requested.
- Do not add digital deck shuffling or card dealing unless the product direction changes; the physical deck is the source of truth.
- Do not assume physical chips. The app owns virtual stacks and pot movement.

## UI Guidelines

- Follow Apple HIG principles: safe-area aware layout, 44px minimum touch targets, semantic color contrast, clear navigation, and bottom-reachable primary controls on mobile.
- Keep each task on its own route. The hand screen should only show the current player action, while players, setup, and history live on separate full-screen routes.
- Prefer compact operational screens over marketing pages or dashboard-style summaries.
- Use lucide icons for button affordances when an icon is appropriate.
