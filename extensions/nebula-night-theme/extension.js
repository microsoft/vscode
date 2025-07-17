const vscode = require("vscode");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const config = vscode.workspace.getConfiguration();
	const currentTheme = config.get("workbench.colorTheme");

	if (currentTheme !== "Nebula Night") {
		config.update("workbench.colorTheme", "Nebula Night", vscode.ConfigurationTarget.Global)
			.then(() => {
				vscode.window.showInformationMessage("Nebula Night theme has been set as default!");
			})
			.catch((err) => {
				console.error("Error setting theme:", err);
			});
	}
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
};
