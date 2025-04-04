# datacurve-tracer README

## Overview

**datacurve-tracer** is a VS Code extension designed to monitor user behaviours and collect detailed interaction logs.

## Setting Up Logging
To set the terminal and window outputs to trace level, follow these steps:
1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS).
2. Type `Developer: Set Log Level` and select it.
3. Select `Window` from the list of services.
3. Choose `Trace` from the list of log levels.

Repeat for the Terminal Service.

## Usage
Simply use vscode as you normally would and when ready to submit your logs follow these steps:
1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS).
2. Type `Developer: Export Logs`.
3. Select Window, Terminal and datacurve-tracer.
4. Upload the resulting log file.
