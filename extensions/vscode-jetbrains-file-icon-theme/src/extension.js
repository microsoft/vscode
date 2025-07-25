const vscode = require('vscode');
const GoTestIconsPlugin = require('./plugins/go-test-icons');

let outputChannel = vscode.window.createOutputChannel('JetBrains File Icon Theme');

function activate(context) {
    outputChannel.appendLine('Extension activated');
    
    try {
        const goTestIconsPlugin = new GoTestIconsPlugin();
        goTestIconsPlugin.activate(context);
        outputChannel.appendLine('Go Test Icons Plugin initialized successfully');
    } catch (error) {
        outputChannel.appendLine(`Error initializing Go Test Icons Plugin: ${error.message}`);
        outputChannel.appendLine(error.stack);
    }
}

function deactivate() {
    outputChannel.dispose();
}

module.exports = {
    activate,
    deactivate
}; 