const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class GoTestIconsPlugin {
    constructor() {
        this.disposable = null;
        this.outputChannel = vscode.window.createOutputChannel('JetBrains File Icon Theme');
    }

    activate(context) {
        this.outputChannel.appendLine('Go Test Icons Plugin activated');
        
        // Register command for updating icons
        let disposable = vscode.commands.registerCommand('jetbrains-file-icon-theme.updateGoTestIcons', () => {
            this.outputChannel.appendLine('Manual update triggered');
            this.updateGoTestIcons();
        });

        context.subscriptions.push(disposable);

        // Subscribe to configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('jetbrains-file-icon-theme.enableGoTestIcons')) {
                    this.outputChannel.appendLine('Configuration changed');
                    this.updateGoTestIcons();
                }
            })
        );

        // Subscribe to file system events
        context.subscriptions.push(
            vscode.workspace.onDidCreateFiles(e => {
                this.outputChannel.appendLine('Files created');
                this.handleFileSystemEvent(e.files);
            }),
            vscode.workspace.onDidDeleteFiles(e => {
                this.outputChannel.appendLine('Files deleted');
                this.handleFileSystemEvent(e.files);
            }),
            vscode.workspace.onDidRenameFiles(e => {
                this.outputChannel.appendLine('Files renamed');
                // Process both old and new paths
                const allFiles = [...e.files.map(f => f.oldUri), ...e.files.map(f => f.newUri)];
                this.handleFileSystemEvent(allFiles);
            })
        );

        // Initialize icons on activation
        this.updateGoTestIcons();
    }

    handleFileSystemEvent(files) {
        const config = vscode.workspace.getConfiguration('jetbrains-file-icon-theme');
        const enableGoTestIcons = config.get('enableGoTestIcons', false);
        
        if (!enableGoTestIcons) {
            return;
        }

        // Filter only Go test files
        const testFiles = files.filter(file => {
            const fileName = path.basename(file.fsPath);
            return fileName.endsWith('_test.go');
        });

        if (testFiles.length > 0) {
            this.outputChannel.appendLine(`Processing ${testFiles.length} test files from file system event`);
            testFiles.forEach(file => {
                const fileName = path.basename(file.fsPath);
                this.outputChannel.appendLine(`Processing file: ${fileName}`);
                this.addFileToIconTheme(fileName);
            });
        }
    }

    updateGoTestIcons() {
        const config = vscode.workspace.getConfiguration('jetbrains-file-icon-theme');
        const enableGoTestIcons = config.get('enableGoTestIcons', false);
        
        this.outputChannel.appendLine(`Go Test Icons enabled: ${enableGoTestIcons}`);

        // Get all files in workspace
        vscode.workspace.findFiles('**/*_test.go').then(files => {
            this.outputChannel.appendLine(`Found ${files.length} test files`);
            
            // Get theme file paths
            const themePath = path.join(vscode.extensions.getExtension('fogio.jetbrains-file-icon-theme').extensionPath, 'themes');
            const darkThemePath = path.join(themePath, 'dark-jetbrains-icon-theme.json');
            const lightThemePath = path.join(themePath, 'light-jetbrains-icon-theme.json');
            const autoThemePath = path.join(themePath, 'auto-jetbrains-icon-theme.json');

            if (enableGoTestIcons) {
                // Add icons for test files
                files.forEach(file => {
                    const fileName = path.basename(file.fsPath);
                    this.outputChannel.appendLine(`Processing file: ${fileName}`);
                    this.addFileToIconTheme(fileName);
                });
            } else {
                // Remove icons for test files
                this.removeTestIconsFromTheme(darkThemePath, 'dark');
                this.removeTestIconsFromTheme(lightThemePath, 'light');
                this.removeTestIconsFromTheme(autoThemePath, 'auto');
            }
        });
    }

    addFileToIconTheme(fileName) {
        try {
            // Get theme file paths
            const themePath = path.join(vscode.extensions.getExtension('fogio.jetbrains-file-icon-theme').extensionPath, 'themes');
            const darkThemePath = path.join(themePath, 'dark-jetbrains-icon-theme.json');
            const lightThemePath = path.join(themePath, 'light-jetbrains-icon-theme.json');
            const autoThemePath = path.join(themePath, 'auto-jetbrains-icon-theme.json');

            // Update all themes
            this.updateThemeFile(darkThemePath, fileName, 'dark');
            this.updateThemeFile(lightThemePath, fileName, 'light');
            this.updateThemeFile(autoThemePath, fileName, 'auto');

            this.outputChannel.appendLine(`Updated icons for ${fileName}`);
        } catch (error) {
            this.outputChannel.appendLine(`Error updating theme: ${error.message}`);
        }
    }

    updateThemeFile(themePath, fileName, themeType) {
        try {
            // Read theme file
            const themeContent = fs.readFileSync(themePath, 'utf8');
            let theme;
            try {
                theme = JSON.parse(themeContent);
            } catch (parseError) {
                this.outputChannel.appendLine(`Error parsing theme file ${themePath}: ${parseError.message}`);
                return;
            }
            
            // Add file to list based on theme type
            if (!theme.fileNames) {
                theme.fileNames = {};
            }

            if (themeType === 'dark') {
                theme.fileNames[fileName] = "file_go_test";
            } else if (themeType === 'light') {
                theme.fileNames[fileName] = "file_go_test_light";
            } else if (themeType === 'auto') {
                theme.fileNames[fileName] = "file_go_test";
                if (!theme.light) {
                    theme.light = {};
                }
                if (!theme.light.fileNames) {
                    theme.light.fileNames = {};
                }
                theme.light.fileNames[fileName] = "file_go_test_light";
            }

            // Save updated theme
            try {
                const updatedContent = JSON.stringify(theme, null, 4);
                fs.writeFileSync(themePath, updatedContent, 'utf8');
                this.outputChannel.appendLine(`Updated theme file: ${themePath}`);
            } catch (writeError) {
                this.outputChannel.appendLine(`Error writing theme file ${themePath}: ${writeError.message}`);
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error updating theme file ${themePath}: ${error.message}`);
        }
    }

    removeTestIconsFromTheme(themePath, themeType) {
        try {
            // Read theme file
            const themeContent = fs.readFileSync(themePath, 'utf8');
            let theme;
            try {
                theme = JSON.parse(themeContent);
            } catch (parseError) {
                this.outputChannel.appendLine(`Error parsing theme file ${themePath}: ${parseError.message}`);
                return;
            }

            // Remove test files from fileNames
            if (theme.fileNames) {
                Object.keys(theme.fileNames).forEach(fileName => {
                    if (fileName.endsWith('_test.go')) {
                        delete theme.fileNames[fileName];
                    }
                });
            }

            // For auto theme also remove from light.fileNames
            if (themeType === 'auto' && theme.light && theme.light.fileNames) {
                Object.keys(theme.light.fileNames).forEach(fileName => {
                    if (fileName.endsWith('_test.go')) {
                        delete theme.light.fileNames[fileName];
                    }
                });
            }

            // Save updated theme
            try {
                const updatedContent = JSON.stringify(theme, null, 4);
                fs.writeFileSync(themePath, updatedContent, 'utf8');
                this.outputChannel.appendLine(`Removed test icons from theme file: ${themePath}`);
            } catch (writeError) {
                this.outputChannel.appendLine(`Error writing theme file ${themePath}: ${writeError.message}`);
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error removing test icons from theme file ${themePath}: ${error.message}`);
        }
    }

    deactivate() {
        if (this.disposable) {
            this.disposable.dispose();
        }
        this.outputChannel.dispose();
    }
}

module.exports = GoTestIconsPlugin;
