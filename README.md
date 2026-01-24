# Unofficial Fender FUSE Replacement

This project is an unofficial web-based replacement for the discontinued Fender FUSE application. It allows you to control your Fender Mustang amplifier directly from your browser via USB.

## Features

- **Restore Lost Functionality**: Since Fender [discontinued](https://support.fender.com/en-us/knowledgebase/article/KA-01924) FUSE, this tool provides a way to manage your presets and settings again.
- **Web-Based**: No installation required. Runs entirely in browsers with WebHID support (Chrome, Edge, Opera).
- **Deep Editing**: Access "hidden" amp models and effect parameters that are not accessible via the physical knobs.
- **Signal Chain Management**: Visually configure your effects loop and signal path.

## Getting Started

1.  Connect your Fender Mustang amp to your computer via USB.
2.  Open this application in a supported browser.
3.  Click "Connect" to start editing.

## Technical Details

This application communicates with the amplifier using the USB HID protocol.

For a deep dive into the protocol implementation, including packet structures, command codes, and model identifiers, please see the [Protocol Documentation](PROTOCOL.md).

## Disclaimer

This is a hobby project and is not affiliated with, endorsed by, or connected to Fender Musical Instruments Corporation.
