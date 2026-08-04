# LP Counter 🎴

A simple, mobile-friendly Life Points tracker for two-player card games like Yu-Gi-Oh!

No installation required — just open `index.html` in a browser. 🌐

## Experimental New UI

A redesigned, feature-rich interface is available at [`/newui`](./newui/). The original interface remains unchanged at the project root while the new experience is refined.

## Features

- **Life Points tracker** — both players start at 8000 LP
- **Built-in calculator** — tap a player's area to open a numpad and apply damage or healing; supports halving LP in one tap
- **Undo** — revert the last LP change
- **Match timer** — start/pause a timer to track duel time
- **3D dice roller** — tap the dice button to roll an animated six-sided die
- **Reset options** — reset only LP, or reset the full match (LP + timer)
- **Sound effect** — plays on LP changes
- **Custom settings** — enable or disable sounds and animated LP backgrounds, and choose who the calculator faces in portrait mode
- **Cookie preferences** — optionally remember settings on the current device; rejecting cookies keeps preferences only for the current session

## Usage

1. Open `index.html` in any modern browser (works on mobile too).
2. Tap a player's panel to open the calculator.
3. Type a value, then press `−` to deal damage or `+` to heal. Use `÷2` to halve LP instantly.
4. Use the bottom bar for dice, undo, and reset actions.
5. Tap the timer at the top to start/pause the match clock.
6. Open **Impostazioni** from the bottom bar to customize sounds, LP animations, and calculator orientation.

## Keyboard shortcuts

When the calculator is open:

| Key | Action |
|-----|--------|
| `0–9` | Input digits |
| `Backspace` | Delete last digit |
| `Enter` or `-` | Apply as damage |
| `+` | Apply as healing |
| `Escape` | Close calculator |

## Files

| File | Description |
|------|-------------|
| `index.html` | Main app structure |
| `styles.css` | Styles and animations |
| `script.js` | App logic |
| `favicon.ico` | App icon |
| `lifedrop_sound.mp3` | Sound effect for LP changes |
