# DuplexKit Mobile Demo

Minimal Tauri + React client for validating the existing DuplexKit backend from a phone.

This is only a backend effect demo. It intentionally does not include a real map SDK, navigation SDK, account system, signing flow, or production mobile architecture.

## What It Proves

- Phone/WebView can connect directly to `ws://<mac-ip>:<port>/api/realtime`.
- Microphone input is sent continuously while the voice button is on.
- Upstream audio format is 24kHz mono `pcm_s16le`, raw PCM, no WAV header.
- Downstream audio format is 24kHz mono `pcm_f32le`, raw PCM, played in arrival order.
- `transcript`, `assistant_text`, and `message_end` can drive a mobile text UI.
- Five backend tool requests update a square-map UI and return `tool_result`.

## Run Locally

From this folder:

```sh
npm install
npm run dev
```

For phone-side diagnostics:

```sh
npm run dev:debug
```

You can also append `?debug=1` to the phone URL. Debug mode shows a local log panel and sends `client_debug` messages over the realtime WebSocket. The backend prints them as `[client_debug] ...` and appends them to `logs/client-debug/YYYY-MM-DD.jsonl`; they are not sent to the realtime model.

From the repository root, start the backend:

```sh
npm run dev
```

Open the demo and enter your Mac LAN IP plus the backend port, usually:

```text
10.x.x.x
5177
```

Then connect and press the voice button. The button starts continuous streaming; pressing it again stops microphone streaming but keeps the WebSocket connection open.

The demo does not require `/api/health` or `/api/tools` HTTP calls at startup, because a Tauri/WebView origin can otherwise run into browser CORS checks. The WebSocket protocol and tool names stay exactly the same as `docs/integration/frontend-protocol.md`.

## Microphone Caveat

If the phone browser says `getUserMedia not found`, the likely cause is browser security policy, not the backend. The Web microphone API is only exposed in secure contexts. A LAN URL such as `http://10.x.x.x:1420` may hide `navigator.mediaDevices` on mobile browsers.

For quick diagnosis, use:

```text
http://<mac-ip>:1420/?debug=1
```

If debug shows `secure=false` and `media=false`, use a Tauri/WebView build, HTTPS local tunnel/certificate, or Android `adb reverse` with a localhost-style origin for the mobile client.

## Phone Testing

Use the Mac LAN IP, not `localhost`, when the phone and Mac are on the same network.

Android can also use port reverse if `adb` is available:

```sh
adb reverse tcp:5177 tcp:5177
```

With `adb reverse`, the app may connect to `127.0.0.1:5177` from the Android device. Without it, use the Mac `10.x.x.x` address.

iOS testing requires Xcode/Tauri mobile setup and a signing profile. This demo keeps the Tauri shell minimal; the useful verification path is the React/WebView client and backend protocol.

The Tauri config includes an iOS microphone usage description. After `tauri android init`, confirm the generated Android manifest includes microphone permission before real device testing:

```xml
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

`MODIFY_AUDIO_SETTINGS` is included because Tauri/Wry's Android WebView media permission handler requests it together with `RECORD_AUDIO` for audio capture.

## Tauri Commands

The project includes a Tauri v2 shell so mobile developers can migrate or run it in their workflow:

```sh
npm run tauri dev
npm run tauri android dev
npm run tauri ios dev
```

Those commands require the normal Tauri mobile toolchain: Rust, platform SDKs, and device signing/provisioning. They are not required for backend protocol validation.

## Tool Demo Behavior

The square-map UI handles only these backend-driven tools:

- `map.open`: show the square.
- `map.close`: hide the square.
- `map.set_origin`: mark the top-left point as the origin.
- `map.set_destination`: mark the bottom-right point as the destination.
- `navigation.start`: highlight the square and route line.

Each tool request is acknowledged with `tool_result`, so the backend can speak the result through the realtime model.
