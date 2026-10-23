# Mask Control

A web app for controlling a Shining Mask LED mask over Bluetooth from Chrome on Android
(or Chrome on Windows). No install needed: open the page, tap Connect, pick the mask.

This is step 1 of the plan, a connection test page: connect, set brightness, try built-in
pictures, and upload test images or a photo.

## Running locally

```sh
npm run serve      # http://localhost:8000
npm test           # protocol and AES unit tests
node tests/browser-smoke.mjs   # headless Chromium run against a fake mask (needs Playwright and the server running)
```

Web Bluetooth only works on `https://` pages or `localhost`.

## Protocol

See `js/protocol.js`. Based on community reverse engineering:
[mask-go](https://github.com/GoneUp/mask-go),
[BrickCraftDream's notes](https://github.com/BrickCraftDream/Shining-Mask-stuff/blob/main/ble-protocol.md),
[Bishop Fox](https://github.com/BishopFox/shining-mask) and
[levavakian/mask](https://github.com/levavakian/mask).
