/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import {workspace, languages, ExtensionContext, extensions, Uri} from 'vscode';
import {LanguageClient, LanguageClientOptions, RequestType, ServerOptions, TransportKind, NotificationType} from 'vscode-languageclient';
import TelemetryReporter from 'vscode-extension-telemetry';

namespace TelemetryNotification {
	export const type: NotificationType<{ key: string, data: any }> = { get method() { return 'telemetry'; } };
}

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any> = { get method() { return 'vscode/content'; } };
}

export interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations> = { get method() { return 'json/schemaAssociations'; } };
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export function activate(context: ExtensionContext) {

	let packageInfo = getPackageInfo(context);
	let telemetryReporter: TelemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

	// Resolve language ids to pass around as initialization data
	languages.getLanguages().then(languageIds => {

		// The server is implemented in node
		let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
		// The debug options for the server
		let debugOptions = { execArgv: ['--nolazy', '--debug=6004'] };

		// If the extension is launch in debug mode the debug server options are use
		// Otherwise the run options are used
		let serverOptions: ServerOptions = {
			run: { module: serverModule, transport: TransportKind.ipc },
			debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
		};

		// Options to control the language client
		let clientOptions: LanguageClientOptions = {
			// Register the server for json documents
			documentSelector: ['json'],
			synchronize: {
				// Synchronize the setting section 'json' to the server
				configurationSection: ['json.schemas', 'http.proxy', 'http.proxyStrictSSL'],
				fileEvents: workspace.createFileSystemWatcher('**/.json')
			},
			initializationOptions: {
				languageIds
			}
		};

		// Create the language client and start the client.
		let client = new LanguageClient('JSON Server', serverOptions, clientOptions);
		client.onNotification(TelemetryNotification.type, e => {
			if (telemetryReporter) {
				telemetryReporter.sendTelemetryEvent(e.key, e.data);
			}
		});

		// handle content request
		client.onRequest(VSCodeContentRequest.type, (uriPath: string) => {
			let uri = Uri.parse(uriPath);
			return workspace.openTextDocument(uri).then(doc => {
				return doc.getText();
			}, error => {
				return Promise.reject(error);
			});
		});

		let disposable = client.start();

		client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociation(context));

		// Push the disposable to the context's subscriptions so that the
		// client can be deactivated on extension deactivation
		context.subscriptions.push(disposable);

		languages.setLanguageConfiguration('json', {
			wordPattern: /(-?\d*\.\d\w*)|([^\[\{\]\}\:\"\,\s]+)/g,
			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
					{ open: '`', close: '`', notIn: ['string', 'comment'] }
				]
			}
		});
	});
}

function getSchemaAssociation(context: ExtensionContext) : ISchemaAssociations {
	let associations : ISchemaAssociations = {};
	extensions.all.forEach(extension => {
		let packageJSON = extension.packageJSON;
		if (packageJSON && packageJSON.contributes && packageJSON.contributes.jsonValidation) {
			let jsonValidation = packageJSON.contributes.jsonValidation;
			if (Array.isArray(jsonValidation)) {
				jsonValidation.forEach(jv => {
					let {fileMatch, url} = jv;
					if (fileMatch && url) {
						if (url[0] === '.' && url[1] === '/') {
							url = Uri.file(path.join(extension.extensionPath, url)).toString();
						}
						if (fileMatch[0] === '%') {
							fileMatch = fileMatch.replace(/%APP_SETTINGS_HOME%/, '/User');
						} else if (fileMatch.charAt(0) !== '/' && !fileMatch.match(/\w+:\/\//)) {
							fileMatch = '/' + fileMatch;
						}
						let association = associations[fileMatch];
						if (!association) {
							association = [];
							associations[fileMatch] = association;
						}
						association.push(url);
					}
				});
			}
		}
	});
	return associations;
}

function getPackageInfo(context: ExtensionContext): IPackageInfo {
	let extensionPackage = require(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return null;
}