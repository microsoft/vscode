/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { workspace, languages, ExtensionContext, extensions, Uri, LanguageConfiguration, TextDocument, FoldingRangeList, FoldingRange, Disposable } from 'vscode';
import { LanguageClient, LanguageClientOptions, RequestType, ServerOptions, TransportKind, NotificationType, DidChangeConfigurationNotification } from 'vscode-languageclient';
import TelemetryReporter from 'vscode-extension-telemetry';

import { FoldingRangesRequest } from './protocol/foldingProvider.proposed';

import { hash } from './utils/hash';

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

namespace SchemaContentChangeNotification {
	export const type: NotificationType<string, any> = new NotificationType('json/schemaContent');
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
		proxy?: string;
		proxyStrictSSL?: boolean;
	};
}

interface JSONSchemaSettings {
	fileMatch?: string[];
	url?: string;
	schema?: any;
}

let telemetryReporter: TelemetryReporter | undefined;

let foldingProviderRegistration: Disposable | undefined = void 0;
const foldingSetting = 'json.experimental.syntaxFolding';

export function activate(context: ExtensionContext) {

	let toDispose = context.subscriptions;

	let packageInfo = getPackageInfo(context);
	telemetryReporter = packageInfo && new TelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'jsonServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6046'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	let documentSelector = ['json', 'jsonc'];

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
	client.registerProposedFeatures();

	let disposable = client.start();
	toDispose.push(disposable);
	client.onReady().then(() => {
		disposable = client.onTelemetry(e => {
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

		let handleContentChange = (uri: Uri) => {
			if (uri.scheme === 'vscode' && uri.authority === 'schemas') {
				client.sendNotification(SchemaContentChangeNotification.type, uri.toString());
			}
		};
		toDispose.push(workspace.onDidChangeTextDocument(e => handleContentChange(e.document.uri)));
		toDispose.push(workspace.onDidCloseTextDocument(d => handleContentChange(d.uri)));

		client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociation(context));

		initFoldingProvider();
		toDispose.push(workspace.onDidChangeConfiguration(c => {
			if (c.affectsConfiguration(foldingSetting)) {
				initFoldingProvider();
			}
		}));
		toDispose.push({ dispose: () => foldingProviderRegistration && foldingProviderRegistration.dispose() });
	});

	let languageConfiguration: LanguageConfiguration = {
		wordPattern: /("(?:[^\\\"]*(?:\\.)?)*"?)|[^\s{}\[\],:]+/,
		indentationRules: {
			increaseIndentPattern: /^.*(\{[^}]*|\[[^\]]*)$/,
			decreaseIndentPattern: /^\s*[}\]],?\s*$/
		}
	};
	languages.setLanguageConfiguration('json', languageConfiguration);
	languages.setLanguageConfiguration('jsonc', languageConfiguration);

	function initFoldingProvider() {
		let enable = workspace.getConfiguration().get(foldingSetting);
		if (enable) {
			if (!foldingProviderRegistration) {
				foldingProviderRegistration = languages.registerFoldingProvider(documentSelector, {
					provideFoldingRanges(document: TextDocument) {
						return client.sendRequest(FoldingRangesRequest.type, { textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document) }).then(res => {
							if (res && Array.isArray(res.ranges)) {
								return new FoldingRangeList(res.ranges.map(r => new FoldingRange(r.startLine, r.endLine, r.type)));
							}
							return null;
						});
					}
				});
			}
		} else {
			if (foldingProviderRegistration) {
				foldingProviderRegistration.dispose();
				foldingProviderRegistration = void 0;
			}
		}
	}
}

export function deactivate(): Promise<any> {
	return telemetryReporter ? telemetryReporter.dispose() : Promise.resolve(null);
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

	let settings: Settings = {
		http: {
			proxy: httpSettings.get('proxy'),
			proxyStrictSSL: httpSettings.get('proxyStrictSSL')
		},
		json: {
			format: workspace.getConfiguration('json').get('format'),
			schemas: [],
		}
	};
	let schemaSettingsById: { [schemaId: string]: JSONSchemaSettings } = Object.create(null);
	let collectSchemaSettings = (schemaSettings: JSONSchemaSettings[], rootPath?: string, fileMatchPrefix?: string) => {
		for (let setting of schemaSettings) {
			let url = getSchemaId(setting, rootPath);
			if (!url) {
				continue;
			}
			let schemaSetting = schemaSettingsById[url];
			if (!schemaSetting) {
				schemaSetting = schemaSettingsById[url] = { url, fileMatch: [] };
				settings.json!.schemas!.push(schemaSetting);
			}
			let fileMatches = setting.fileMatch;
			if (Array.isArray(fileMatches)) {
				if (fileMatchPrefix) {
					fileMatches = fileMatches.map(m => fileMatchPrefix + m);
				}
				schemaSetting.fileMatch!.push(...fileMatches);
			}
			if (setting.schema) {
				schemaSetting.schema = setting.schema;
			}
		}
	};

	// merge global and folder settings. Qualify all file matches with the folder path.
	let globalSettings = workspace.getConfiguration('json', null).get<JSONSchemaSettings[]>('schemas');
	if (Array.isArray(globalSettings)) {
		collectSchemaSettings(globalSettings, workspace.rootPath);
	}
	let folders = workspace.workspaceFolders;
	if (folders) {
		for (let folder of folders) {
			let folderUri = folder.uri;
			let schemaConfigInfo = workspace.getConfiguration('json', folderUri).inspect<JSONSchemaSettings[]>('schemas');
			let folderSchemas = schemaConfigInfo!.workspaceFolderValue;
			if (Array.isArray(folderSchemas)) {
				let folderPath = folderUri.toString();
				if (folderPath[folderPath.length - 1] !== '/') {
					folderPath = folderPath + '/';
				}
				collectSchemaSettings(folderSchemas, folderUri.fsPath, folderPath + '*');
			}
		}
	}
	return settings;
}

function getSchemaId(schema: JSONSchemaSettings, rootPath?: string) {
	let url = schema.url;
	if (!url) {
		if (schema.schema) {
			url = schema.schema.id || `vscode://schemas/custom/${encodeURIComponent(hash(schema.schema).toString(16))}`;
		}
	} else if (rootPath && (url[0] === '.' || url[0] === '/')) {
		url = Uri.file(path.normalize(path.join(rootPath, url))).toString();
	}
	return url;
}

function getPackageInfo(context: ExtensionContext): IPackageInfo | undefined {
	let extensionPackage = require(context.asAbsolutePath('./package.json'));
	if (extensionPackage) {
		return {
			name: extensionPackage.name,
			version: extensionPackage.version,
			aiKey: extensionPackage.aiKey
		};
	}
	return void 0;
}
