/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const fs = require('fs'); l

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.createSFDXProject', async function () {
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter the name of the SFDX project',
            ignoreFocusOut: true,
            placeHolder: 'my-sfdx-project'
        });

        if (!projectName) {
            vscode.window.showErrorMessage('Project name is required');
            return;
        }

        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select folder to create project in'
        });

        if (!folderUri || folderUri.length === 0) {
            vscode.window.showErrorMessage('You must select a folder to create the project in');
            return;
        }

        const projectPath = path.join(folderUri[0].fsPath, projectName);

        try {
            const result = cp.spawnSync('sfdx', ['force:project:create', '-n', projectName], {
                cwd: folderUri[0].fsPath,
                stdio: 'inherit',
                shell: true,
                windowsHide: true
            });

            if (result.error) {
                throw result.error;
            }

            // Create .aipexium folder
            const aipexiumPath = path.join(projectPath, '.aipexium');
            if (!fs.existsSync(aipexiumPath)) {
                fs.mkdirSync(aipexiumPath);
            }

            // Get config data from current project
            let configData = '{}'; // Default empty config

            // Try to read config.json from current workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const currentProjectPath = workspaceFolders[0].uri.fsPath;
                const currentConfigPath = path.join(currentProjectPath, '.aipexium', 'config.json');

                if (fs.existsSync(currentConfigPath)) {
                    try {
                        configData = fs.readFileSync(currentConfigPath, 'utf8');
                        // Validate JSON
                        JSON.parse(configData);
                        vscode.window.showInformationMessage('Config imported from current project');
                    } catch (readError) {
                        vscode.window.showWarningMessage('Failed to read current project config, using default: ' + readError.message);
                        configData = '{}';
                    }
                } else {
                    vscode.window.showInformationMessage('No config found in current project, creating with default settings');
                }
            }

            // Create config.json file in new project with imported data
            const configFilePath = path.join(aipexiumPath, 'config.json');
            fs.writeFileSync(configFilePath, configData, { encoding: 'utf8' });

            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath));
        } catch (err) {
            vscode.window.showErrorMessage('Failed to create SFDX project: ' + err.message);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
