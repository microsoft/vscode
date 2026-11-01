// Entry point of the webview bundle. Order matters: the VS Code environment first, then the
// preload (which puts `window.api` in place), then the app, then the VS Code style adjustments
// (after the app's styles, so they win).
import './vscode/env'
import '../preload/index'
import './main'
import './vscode/vscode.css'
