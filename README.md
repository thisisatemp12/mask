# Mask Control

A web app for controlling a Shining Mask LED mask over Bluetooth from Chrome on Android
(or Chrome on Windows). No install needed: open the page, tap Connect, pick the mask.

- **Picture:** pick a photo, drag and zoom it into place, adjust colours, and send it to a slot.
  The preview dims the corners, which have no LEDs on the oval panel.
- **Text:** scrolling text in the mask's own text mode (direction, speed, colour or rainbow,
  background), or text drawn as a still picture.
- **Draw:** pen, eraser, fill, brush sizes, colours, undo; draw first, then send.
- **Faces:** ready-made hacker-style LED faces to send as they are or edit in Draw.
- **Faces** can also be animated (blink, look around, talk, glitch, pulse): frames go into consecutive slots and loop on the mask.
- **Hypno:** spiral, rainbow spiral, red and black, rings, pinwheel and vortex eyes, with or without a mouth, uploaded as a looping animation.
- **Visor:** smooth scrolling visor patterns through the mask's text mode (chevrons, wave, LED grid, equalizer, scanner and more), or a shaped visor across the eyes animated through slots.
- **Test:** show an uploaded slot, the built-in pictures, and test patterns.

## Running locally

```sh
npm run serve      # http://localhost:8000
npm test           # protocol and AES unit tests
node tests/browser-smoke.mjs OUT_DIR   # headless Chromium run against a fake mask, with screenshots (needs Playwright and the server running)
```

Before pushing a change to the site, run `tools/bump-version.sh` so phones load the new scripts instead of cached ones.

Web Bluetooth only works on `https://` pages or `localhost`.

## Protocol

See `js/protocol.js`. Based on community reverse engineering:
[mask-go](https://github.com/GoneUp/mask-go),
[BrickCraftDream's notes](https://github.com/BrickCraftDream/Shining-Mask-stuff/blob/main/ble-protocol.md),
[Bishop Fox](https://github.com/BishopFox/shining-mask) and
[levavakian/mask](https://github.com/levavakian/mask).
