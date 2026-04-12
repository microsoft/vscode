"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isImplicitProjectConfigFile = isImplicitProjectConfigFile;
exports.inferredProjectCompilerOptions = inferredProjectCompilerOptions;
exports.openOrCreateConfig = openOrCreateConfig;
exports.openProjectConfigOrPromptToCreate = openProjectConfigOrPromptToCreate;
exports.openProjectConfigForFile = openProjectConfigForFile;
const vscode = __importStar(require("vscode"));
const api_1 = require("./tsServer/api");
const cancellation_1 = require("./utils/cancellation");
function isImplicitProjectConfigFile(configFileName) {
    return configFileName.startsWith('/dev/null/');
}
function inferredProjectCompilerOptions(version, projectType, serviceConfig) {
    const projectConfig = {
        module: (version.gte(api_1.API.v540) ? 'Preserve' : 'ESNext'),
        moduleResolution: (version.gte(api_1.API.v540) ? 'Bundler' : 'Node'),
        target: 'ES2022',
        jsx: 'react-jsx',
    };
    if (version.gte(api_1.API.v500)) {
        projectConfig.allowImportingTsExtensions = true;
    }
    if (serviceConfig.implicitProjectConfiguration.checkJs) {
        projectConfig.checkJs = true;
        if (projectType === 0 /* ProjectType.TypeScript */) {
            projectConfig.allowJs = true;
        }
    }
    if (serviceConfig.implicitProjectConfiguration.experimentalDecorators) {
        projectConfig.experimentalDecorators = true;
    }
    if (serviceConfig.implicitProjectConfiguration.strictNullChecks) {
        projectConfig.strictNullChecks = true;
    }
    if (serviceConfig.implicitProjectConfiguration.strictFunctionTypes) {
        projectConfig.strictFunctionTypes = true;
    }
    if (serviceConfig.implicitProjectConfiguration.strict) {
        projectConfig.strict = true;
    }
    if (serviceConfig.implicitProjectConfiguration.module) {
        projectConfig.module = serviceConfig.implicitProjectConfiguration.module;
    }
    if (serviceConfig.implicitProjectConfiguration.target) {
        projectConfig.target = serviceConfig.implicitProjectConfiguration.target;
    }
    if (projectType === 0 /* ProjectType.TypeScript */) {
        projectConfig.sourceMap = true;
    }
    return projectConfig;
}
function inferredProjectConfigSnippet(version, projectType, config) {
    const baseConfig = inferredProjectCompilerOptions(version, projectType, config);
    if (projectType === 0 /* ProjectType.TypeScript */) {
        delete baseConfig.allowImportingTsExtensions;
    }
    const compilerOptions = Object.keys(baseConfig).map(key => `"${key}": ${JSON.stringify(baseConfig[key])}`);
    return new vscode.SnippetString(`{
	"compilerOptions": {
		${compilerOptions.join(',\n\t\t')}$0
	},
	"exclude": [
		"node_modules",
		"**/node_modules/*"
	]
}`);
}
async function openOrCreateConfig(version, projectType, rootPath, configuration) {
    const configFile = vscode.Uri.joinPath(rootPath, projectType === 0 /* ProjectType.TypeScript */ ? 'tsconfig.json' : 'jsconfig.json');
    const col = vscode.window.activeTextEditor?.viewColumn;
    try {
        const doc = await vscode.workspace.openTextDocument(configFile);
        return vscode.window.showTextDocument(doc, col);
    }
    catch {
        const doc = await vscode.workspace.openTextDocument(configFile.with({ scheme: 'untitled' }));
        const editor = await vscode.window.showTextDocument(doc, col);
        if (editor.document.getText().length === 0) {
            await editor.insertSnippet(inferredProjectConfigSnippet(version, projectType, configuration));
        }
        return editor;
    }
}
async function openProjectConfigOrPromptToCreate(projectType, client, rootPath, configFilePath) {
    if (!isImplicitProjectConfigFile(configFilePath)) {
        const doc = await vscode.workspace.openTextDocument(client.toResource(configFilePath));
        vscode.window.showTextDocument(doc, vscode.window.activeTextEditor?.viewColumn);
        return;
    }
    const CreateConfigItem = {
        title: projectType === 0 /* ProjectType.TypeScript */
            ? vscode.l10n.t("Configure tsconfig.json")
            : vscode.l10n.t("Configure jsconfig.json"),
    };
    const selected = await vscode.window.showInformationMessage((projectType === 0 /* ProjectType.TypeScript */
        ? vscode.l10n.t("File is not part of a TypeScript project. View the [tsconfig.json documentation]({0}) to learn more.", 'https://go.microsoft.com/fwlink/?linkid=841896')
        : vscode.l10n.t("File is not part of a JavaScript project. View the [jsconfig.json documentation]({0}) to learn more.", 'https://go.microsoft.com/fwlink/?linkid=759670')), CreateConfigItem);
    switch (selected) {
        case CreateConfigItem:
            openOrCreateConfig(client.apiVersion, projectType, rootPath, client.configuration);
            return;
    }
}
async function openProjectConfigForFile(projectType, client, resource) {
    const rootPath = client.getWorkspaceRootForResource(resource);
    if (!rootPath) {
        vscode.window.showInformationMessage(vscode.l10n.t("Please open a folder in VS Code to use a TypeScript or JavaScript project"));
        return;
    }
    const file = client.toTsFilePath(resource);
    // TSServer errors when 'projectInfo' is invoked on a non js/ts file
    if (!file || !client.toTsFilePath(resource)) {
        vscode.window.showWarningMessage(vscode.l10n.t("Could not determine TypeScript or JavaScript project. Unsupported file type"));
        return;
    }
    let res;
    try {
        res = await client.execute('projectInfo', { file, needFileNameList: false }, cancellation_1.nulToken);
    }
    catch {
        // noop
    }
    if (res?.type !== 'response' || !res.body) {
        vscode.window.showWarningMessage(vscode.l10n.t("Could not determine TypeScript or JavaScript project"));
        return;
    }
    return openProjectConfigOrPromptToCreate(projectType, client, rootPath, res.body.configFileName);
}
//# sourceMappingURL=tsconfig.js.map