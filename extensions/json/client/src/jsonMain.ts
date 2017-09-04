/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { workspace, languages, ExtensionContext, extensions, Uri, TextDocument, ColorRange, Color } from 'vscode';
import { LanguageClient, LanguageClientOptions, RequestType, ServerOptions, TransportKind, NotificationType, DidChangeConfigurationNotification } from 'vscode-languageclient';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConfigurationFeature } from 'vscode-languageclient/lib/proposed';

import { DocumentColorRequest } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';


import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

export interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations, any> = new NotificationType('json/schemaAssociations');
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

interface Settings {
	json?: {
		schemas?: JSONSchemaSettings[];
		format?: { enable: boolean; };
	};
	http?: {
		proxy: string;
		proxyStrictSSL: boolean;
	};
}

interface JSONSettings {
	schemas: JSONSchemaSettings[];
}

interface JSONSchemaSettings {
	fileMatch?: string[];
	url?: string;
	schema?: any;
}

const ColorFormat_HEX = {
	opaque: '"#{red:X}{green:X}{blue:X}"',
	transparent: '"#{red:X}{green:X}{blue:X}{alpha:X}"'
};

export function activate(context: ExtensionContext) {

	let packageInfo = getPackageInfo(context);
	let telemetryReporter: TelemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
	context.subscriptions.push(telemetryReporter);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'jsonServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6004'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	let documentSelector = ['json'];

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for json documents
		documentSelector,
		synchronize: {
			// Synchronize the setting section 'json' to the server
			configurationSection: ['json', 'http'],
			fileEvents: workspace.createFileSystemWatcher('**/*.json')
		},
		middleware: {
			workspace: {
				didChangeConfiguration: () => client.sendNotification(DidChangeConfigurationNotification.type, { settings: getSettings() })
			}
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('json', localize('jsonserver.name', 'JSON Language Server'), serverOptions, clientOptions);
	client.registerFeature(new ConfigurationFeature(client));

	let disposable = client.start();
	client.onReady().then(() => {
		client.onTelemetry(e => {
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

		client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociation(context));

		// register color provider
		context.subscriptions.push(languages.registerColorProvider(documentSelector, {
			provideDocumentColors(document: TextDocument): Thenable<ColorRange[]> {
				let params = client.code2ProtocolConverter.asDocumentSymbolParams(document);
				return client.sendRequest(DocumentColorRequest.type, params).then(symbols => {
					return symbols.map(symbol => {
						let range = client.protocol2CodeConverter.asRange(symbol.range);
						let color = new Color(symbol.color.red * 255, symbol.color.green * 255, symbol.color.blue * 255, symbol.color.alpha);
						return new ColorRange(range, color, [ColorFormat_HEX]);
					});
				});
			}
		}));
	});

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	languages.setLanguageConfiguration('json', {
		wordPattern: /("(?:[^\\\"]*(?:\\.)?)*"?)|[^\s{}\[\],:]+/,
		indentationRules: {
			increaseIndentPattern: /^.*(\{[^}]*|\[[^\]]*)$/,
			decreaseIndentPattern: /^\s*[}\]],?\s*$/
		}
	});
}

function getSchemaAssociation(context: ExtensionContext): ISchemaAssociations {
	let associations: ISchemaAssociations = {};
	extensions.all.forEach(extension => {
		let packageJSON = extension.packageJSON;
		if (packageJSON && packageJSON.contributes && packageJSON.contributes.jsonValidation) {
			let jsonValidation = packageJSON.contributes.jsonValidation;
			if (Array.isArray(jsonValidation)) {
				jsonValidation.forEach(jv => {
					let { fileMatch, url } = jv;
					if (fileMatch && url) {
						if (url[0] === '.' && url[1] === '/') {
							url = Uri.file(path.join(extension.extensionPath, url)).toString();
						}
						if (fileMatch[0] === '%') {
							fileMatch = fileMatch.replace(/%APP_SETTINGS_HOME%/, '/User');
							fileMatch = fileMatch.replace(/%APP_WORKSPACES_HOME%/, '/Workspaces');
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

function getSettings(): Settings {
	let httpSettings = workspace.getConfiguration('http');
	let jsonSettings = workspace.getConfiguration('json');

	let schemas = [];

	let settings: Settings = {
		http: {
			proxy: httpSettings.get('proxy'),
			proxyStrictSSL: httpSettings.get('proxyStrictSSL')
		},
		json: {
			format: jsonSettings.get('format'),
			schemas: schemas,
		}
	};
	let settingsSchemas = jsonSettings.get('schemas');
	if (Array.isArray(settingsSchemas)) {
		schemas.push(...settingsSchemas);
	}

	let folders = workspace.workspaceFolders;
	if (folders) {
		folders.forEach(folder => {
			let jsonConfig = workspace.getConfiguration('json', folder.uri);
			let schemaConfigInfo = jsonConfig.inspect<JSONSchemaSettings[]>('schemas');
			let folderSchemas = schemaConfigInfo.workspaceFolderValue;
			if (Array.isArray(folderSchemas)) {
				folderSchemas.forEach(schema => {
					let url = schema.url;
					if (!url && schema.schema) {
						url = schema.schema.id;
					}
					if (url && url[0] === '.') {
						url = Uri.file(path.normalize(path.join(folder.uri.fsPath, url))).toString();
					}
					let fileMatch = schema.fileMatch;
					if (fileMatch) {
						fileMatch = fileMatch.map(m => folder.uri.toString() + '*' + m);
					}
					schemas.push({ url, fileMatch, schema: schema.schema });
				});
			};
		});
	}
	return settings;
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