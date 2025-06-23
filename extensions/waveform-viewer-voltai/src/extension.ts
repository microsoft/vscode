// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { WaveformEditorProvider } from './waveformEditor';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "waveform-viewer-voltai" is now active!');

	// Register our custom editor provider
	context.subscriptions.push(WaveformEditorProvider.register(context));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('waveform-viewer-voltai.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from WaveForm viewer!');
	});

	// Register command to open waveform viewer
	const openWaveformDisposable = vscode.commands.registerCommand('waveform-viewer-voltai.openWaveform', () => {
		// Create and show a new webview panel
		const panel = vscode.window.createWebviewPanel(
			'waveformViewer', // Identifies the type of the webview. Used internally
			'Waveform Viewer', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in.
			{
				enableScripts: true
			}
		);

		panel.webview.html = getWebviewContent();
	});

	context.subscriptions.push(disposable, openWaveformDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function getWebviewContent() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Waveform Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .toolbar {
            margin-bottom: 20px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            margin-right: 10px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #waveform-display {
            border: 1px solid var(--vscode-panel-border);
            min-height: 400px;
            padding: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>Waveform Viewer</h1>
    <div class="toolbar">
        <button onclick="zoomIn()">Zoom In</button>
        <button onclick="zoomOut()">Zoom Out</button>
        <button onclick="fitToWindow()">Fit to Window</button>
    </div>
    <div id="waveform-display">
        <p>No waveform data loaded</p>
        <p>Select a .vcd, .ghw, or .fst file to view waveforms</p>
    </div>

    <script>
        function zoomIn() {
            console.log('Zoom In clicked');
        }

        function zoomOut() {
            console.log('Zoom Out clicked');
        }

        function fitToWindow() {
            console.log('Fit to Window clicked');
        }
    </script>
</body>
</html>`;
}
