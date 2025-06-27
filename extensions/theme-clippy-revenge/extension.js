const vscode = require('vscode');

function activate() {
  vscode.window.showInformationMessage("It looks like you're trying to code. Would you like some unhelpful advice?");
}

function deactivate() {}

module.exports = { activate, deactivate };
