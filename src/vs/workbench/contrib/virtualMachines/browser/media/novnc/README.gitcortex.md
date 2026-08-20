# Vendored noVNC (subset)

This directory contains a subset of [noVNC](https://github.com/novnc/noVNC) 1.6.0
(`core/` and `vendor/pako/`), used to display the graphical console of GitCortex
virtual machines inside a workbench webview.

- noVNC core library: MPL-2.0 (see `LICENSE.txt`).
- `vendor/pako`: MIT (see `vendor/pako/LICENSE`).
- Authors: see `AUTHORS`.

Only the ES module files required to run `core/rfb.js` are vendored. The files
are unmodified; MPL-2.0 file-level copyleft therefore has no impact on the
surrounding MIT-licensed GitCortex code.
