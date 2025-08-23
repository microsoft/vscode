// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { LanguageClientOptions } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/browser';
import { LanguageClientMiddlewareBase } from '../activation/languageClientMiddlewareBase';
import { LanguageServerType } from '../activation/types';
import { AppinsightsKey, PYLANCE_EXTENSION_ID } from '../common/constants';
import { EventName } from '../telemetry/constants';
import { createStatusItem } from './intellisenseStatus';
import { PylanceApi } from '../activation/node/pylanceApi';
import { buildApi, IBrowserExtensionApi } from './api';

interface BrowserConfig {
    distUrl: string; // URL to Pylance's dist folder.
}

let languageClient: LanguageClient | undefined;
let pylanceApi: PylanceApi | undefined;

export function activate(context: vscode.ExtensionContext): Promise<IBrowserExtensionApi> {
    const reporter = getTelemetryReporter();

    const activationPromise = Promise.resolve(buildApi(reporter));
    const pylanceExtension = vscode.extensions.getExtension<PylanceApi>(PYLANCE_EXTENSION_ID);
    if (pylanceExtension) {
        // Make sure we run pylance once we activated core extension.
        activationPromise.then(() => runPylance(context, pylanceExtension));
        return activationPromise;
    }

    const changeDisposable = vscode.extensions.onDidChange(async () => {
        const newPylanceExtension = vscode.extensions.getExtension<PylanceApi>(PYLANCE_EXTENSION_ID);
        if (newPylanceExtension) {
            changeDisposable.dispose();
            await runPylance(context, newPylanceExtension);
        }
    });

    return activationPromise;
}

export async function deactivate(): Promise<void> {
    if (pylanceApi) {
        const api = pylanceApi;
        pylanceApi = undefined;
        await api.client!.stop();
    }

    if (languageClient) {
        const client = languageClient;
        languageClient = undefined;

        await client.stop();
        await client.dispose();
    }
}

async function runPylance(
    context: vscode.ExtensionContext,
    pylanceExtension: vscode.Extension<PylanceApi>,
): Promise<void> {
    context.subscriptions.push(createStatusItem());

    pylanceExtension = await getActivatedExtension(pylanceExtension);
    const api = pylanceExtension.exports;
    if (api.client && api.client.isEnabled()) {
        pylanceApi = api;
        await api.client.start();
        return;
    }

    const { extensionUri, packageJSON } = pylanceExtension;
    const distUrl = vscode.Uri.joinPath(extensionUri, 'dist');

    try {
        const worker = new Worker(vscode.Uri.joinPath(distUrl, 'browser.server.bundle.js').toString());

        // Pass the configuration as the first message to the worker so it can
        // have info like the URL of the dist folder early enough.
        //
        // This is the same method used by the TS worker:
        // https://github.com/microsoft/vscode/blob/90aa979bb75a795fd8c33d38aee263ea655270d0/extensions/typescript-language-features/src/tsServer/serverProcess.browser.ts#L55
        const config: BrowserConfig = { distUrl: distUrl.toString() };
        worker.postMessage(config);

        const middleware = new LanguageClientMiddlewareBase(
            undefined,
            LanguageServerType.Node,
            sendTelemetryEventBrowser,
            packageJSON.version,
        );
        middleware.connect();

        const clientOptions: LanguageClientOptions = {
            // Register the server for python source files.
            documentSelector: [
                {
                    language: 'python',
                },
            ],
            synchronize: {
                // Synchronize the setting section to the server.
                configurationSection: ['python', 'jupyter.runStartupCommands'],
            },
            middleware,
        };

        const client = new LanguageClient('python', 'Python Language Server', worker, clientOptions);
        languageClient = client;

        context.subscriptions.push(
            vscode.commands.registerCommand('python.viewLanguageServerOutput', () => client.outputChannel.show()),
        );

        client.onTelemetry(
            (telemetryEvent: {
                EventName: EventName;
                Properties: { method: string };
                Measurements: number | Record<string, number> | undefined;
                Exception: Error | undefined;
            }) => {
                const eventName = telemetryEvent.EventName || EventName.LANGUAGE_SERVER_TELEMETRY;
                const formattedProperties = {
                    ...telemetryEvent.Properties,
                    // Replace all slashes in the method name so it doesn't get scrubbed by @vscode/extension-telemetry.
                    method: telemetryEvent.Properties.method?.replace(/\//g, '.'),
                };
                sendTelemetryEventBrowser(
                    eventName,
                    telemetryEvent.Measurements,
                    formattedProperties,
                    telemetryEvent.Exception,
                );
            },
        );

        await client.start();
    } catch (e) {
        console.log(e); // necessary to use console.log for browser
    }
}

// Duplicate code from telemetry/index.ts to avoid pulling in winston,
// which doesn't support the browser.

let telemetryReporter: TelemetryReporter | undefined;
function getTelemetryReporter() {
    if (telemetryReporter) {
        return telemetryReporter;
    }

    // eslint-disable-next-line global-require
    const Reporter = require('@vscode/extension-telemetry').default as typeof TelemetryReporter;
    telemetryReporter = new Reporter(AppinsightsKey, [
        {
            lookup: /(errorName|errorMessage|errorStack)/g,
        },
    ]);

    return telemetryReporter;
}

function sendTelemetryEventBrowser(
    eventName: EventName,
    measuresOrDurationMs?: Record<string, number> | number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties?: any,
    ex?: Error,
): void {
    const reporter = getTelemetryReporter();
    const measures =
        typeof measuresOrDurationMs === 'number'
            ? { duration: measuresOrDurationMs }
            : measuresOrDurationMs || undefined;
    const customProperties: Record<string, string> = {};
    const eventNameSent = eventName as string;

    if (properties) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = properties as any;
        Object.getOwnPropertyNames(data).forEach((prop) => {
            if (data[prop] === undefined || data[prop] === null) {
                return;
            }
            try {
                // If there are any errors in serializing one property, ignore that and move on.
                // Else nothing will be sent.
                switch (typeof data[prop]) {
                    case 'string':
                        customProperties[prop] = data[prop];
                        break;
                    case 'object':
                        customProperties[prop] = 'object';
                        break;
                    default:
                        customProperties[prop] = data[prop].toString();
                        break;
                }
            } catch (exception) {
                console.error(`Failed to serialize ${prop} for ${eventName}`, exception); // necessary to use console.log for browser
            }
        });
    }

    // Add shared properties to telemetry props (we may overwrite existing ones).
    // Removed in the browser; there's no setSharedProperty.
    // Object.assign(customProperties, sharedProperties);

    if (ex) {
        const errorProps = {
            errorName: ex.name,
            errorStack: ex.stack ?? '',
        };
        Object.assign(customProperties, errorProps);

        reporter.sendTelemetryErrorEvent(eventNameSent, customProperties, measures);
    } else {
        reporter.sendTelemetryEvent(eventNameSent, customProperties, measures);
    }
}

async function getActivatedExtension<T>(extension: vscode.Extension<T>): Promise<vscode.Extension<T>> {
    if (!extension.isActive) {
        await extension.activate();
    }

    return extension;
}
