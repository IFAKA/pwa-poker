# Table Stakes (pwa-poker)

An offline-installable poker table companion for groups playing with a physical deck: it acts as the bank and action guide.

Live: https://pwa-poker.vercel.app

## Features

- Tracks players, stacks, blinds, dealer position, whose turn it is, bets, folds, streets and the pot.
- Action guide for the current player (fold, call, raise to, all in) with total-bet previews.
- Winner selection and pot payout, next-hand start, and game-complete state.
- Setup screen for small and big blinds, player editing and sitting out, light/dark mode, and table reset.
- Hand history screen.
- Separate full-screen routes: Hand, Players, History, Setup.
- Works offline once installed (service worker); state is saved locally in the browser.
- By design it does not shuffle or deal cards: the physical deck is the source of truth.

## Run locally

```bash
npm install
npm run dev     # development server
npm run build   # production build
npm start       # serve the build
npm run lint
```

## Tech

Next.js (App Router), React, TypeScript, Tailwind CSS v4, shadcn/ui-style components, lucide-react icons, PWA manifest and service worker.

## Support

If this project is useful to you, you can support my work:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zfaka)
