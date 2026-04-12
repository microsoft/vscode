"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const ms_rest_azure_env_1 = require("@azure/ms-rest-azure-env");
const logger_1 = __importDefault(require("./logger"));
const authProvider_1 = require("./node/authProvider");
const UriEventHandler_1 = require("./UriEventHandler");
const vscode_1 = require("vscode");
const telemetryReporter_1 = require("./common/telemetryReporter");
let implementation = 'msal';
const getImplementation = () => vscode_1.workspace.getConfiguration('microsoft-authentication').get('implementation') ?? 'msal';
async function initMicrosoftSovereignCloudAuthProvider(context, uriHandler) {
    const environment = vscode_1.workspace.getConfiguration('microsoft-sovereign-cloud').get('environment');
    let authProviderName;
    if (!environment) {
        return undefined;
    }
    if (environment === 'custom') {
        const customEnv = vscode_1.workspace.getConfiguration('microsoft-sovereign-cloud').get('customEnvironment');
        if (!customEnv) {
            const res = await vscode_1.window.showErrorMessage(vscode_1.l10n.t('You must also specify a custom environment in order to use the custom environment auth provider.'), vscode_1.l10n.t('Open settings'));
            if (res) {
                await vscode_1.commands.executeCommand('workbench.action.openSettingsJson', 'microsoft-sovereign-cloud.customEnvironment');
            }
            return undefined;
        }
        try {
            ms_rest_azure_env_1.Environment.add(customEnv);
        }
        catch (e) {
            const res = await vscode_1.window.showErrorMessage(vscode_1.l10n.t('Error validating custom environment setting: {0}', e.message), vscode_1.l10n.t('Open settings'));
            if (res) {
                await vscode_1.commands.executeCommand('workbench.action.openSettings', 'microsoft-sovereign-cloud.customEnvironment');
            }
            return undefined;
        }
        authProviderName = customEnv.name;
    }
    else {
        authProviderName = environment;
    }
    const env = ms_rest_azure_env_1.Environment.get(authProviderName);
    if (!env) {
        await vscode_1.window.showErrorMessage(vscode_1.l10n.t('The environment `{0}` is not a valid environment.', authProviderName), vscode_1.l10n.t('Open settings'));
        return undefined;
    }
    const authProvider = await authProvider_1.MsalAuthProvider.create(context, new telemetryReporter_1.MicrosoftSovereignCloudAuthenticationTelemetryReporter(context.extension.packageJSON.aiKey), vscode_1.window.createOutputChannel(vscode_1.l10n.t('Microsoft Sovereign Cloud Authentication'), { log: true }), uriHandler, env);
    const disposable = vscode_1.authentication.registerAuthenticationProvider('microsoft-sovereign-cloud', authProviderName, authProvider, { supportsMultipleAccounts: true, supportsChallenges: true });
    context.subscriptions.push(disposable);
    return disposable;
}
async function activate(context) {
    const mainTelemetryReporter = new telemetryReporter_1.MicrosoftAuthenticationTelemetryReporter(context.extension.packageJSON.aiKey);
    implementation = getImplementation();
    context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration(async (e) => {
        if (!e.affectsConfiguration('microsoft-authentication')) {
            return;
        }
        if (implementation === getImplementation()) {
            return;
        }
        // Allow for the migration to be re-attempted if the user switches back to the MSAL implementation
        context.globalState.update('msalMigration', undefined);
        const reload = vscode_1.l10n.t('Reload');
        const result = await vscode_1.window.showInformationMessage('Reload required', {
            modal: true,
            detail: vscode_1.l10n.t('Microsoft Account configuration has been changed.'),
        }, reload);
        if (result === reload) {
            vscode_1.commands.executeCommand('workbench.action.reloadWindow');
        }
    }));
    switch (implementation) {
        case 'msal-no-broker':
            mainTelemetryReporter.sendActivatedWithMsalNoBrokerEvent();
            break;
        case 'msal':
        default:
            break;
    }
    const uriHandler = new UriEventHandler_1.UriEventHandler();
    context.subscriptions.push(uriHandler);
    const authProvider = await authProvider_1.MsalAuthProvider.create(context, mainTelemetryReporter, logger_1.default, uriHandler);
    context.subscriptions.push(vscode_1.authentication.registerAuthenticationProvider('microsoft', 'Microsoft', authProvider, {
        supportsMultipleAccounts: true,
        supportsChallenges: true,
        supportedAuthorizationServers: [
            vscode_1.Uri.parse('https://login.microsoftonline.com/*'),
            vscode_1.Uri.parse('https://login.microsoftonline.com/*/v2.0')
        ]
    }));
    let microsoftSovereignCloudAuthProviderDisposable = await initMicrosoftSovereignCloudAuthProvider(context, uriHandler);
    context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('microsoft-sovereign-cloud')) {
            microsoftSovereignCloudAuthProviderDisposable?.dispose();
            microsoftSovereignCloudAuthProviderDisposable = await initMicrosoftSovereignCloudAuthProvider(context, uriHandler);
        }
    }));
}
function deactivate() {
    logger_1.default.info('Microsoft Authentication is deactivating...');
}
//# sourceMappingURL=extension.js.map