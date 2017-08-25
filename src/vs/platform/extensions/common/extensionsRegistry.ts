/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import Severity from 'vs/base/common/severity';
import { IMessage, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

const hasOwnProperty = Object.hasOwnProperty;
const schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);

export class ExtensionMessageCollector {

	private readonly _messageHandler: (msg: IMessage) => void;
	private readonly _extension: IExtensionDescription;
	private readonly _extensionPointId: string;

	constructor(
		messageHandler: (msg: IMessage) => void,
		extension: IExtensionDescription,
		extensionPointId: string
	) {
		this._messageHandler = messageHandler;
		this._extension = extension;
		this._extensionPointId = extensionPointId;
	}

	private _msg(type: Severity, message: string): void {
		this._messageHandler({
			type: type,
			message: message,
			source: this._extension.extensionFolderPath,
			extensionId: this._extension.id,
			extensionPointId: this._extensionPointId
		});
	}

	public error(message: string): void {
		this._msg(Severity.Error, message);
	}

	public warn(message: string): void {
		this._msg(Severity.Warning, message);
	}

	public info(message: string): void {
		this._msg(Severity.Info, message);
	}
}

export interface IExtensionPointUser<T> {
	description: IExtensionDescription;
	value: T;
	collector: ExtensionMessageCollector;
}

export interface IExtensionPointHandler<T> {
	(extensions: IExtensionPointUser<T>[]): void;
}

export interface IExtensionPoint<T> {
	name: string;
	setHandler(handler: IExtensionPointHandler<T>): void;
}

export class ExtensionPoint<T> implements IExtensionPoint<T> {

	public readonly name: string;
	private _handler: IExtensionPointHandler<T>;
	private _users: IExtensionPointUser<T>[];
	private _done: boolean;

	constructor(name: string) {
		this.name = name;
		this._handler = null;
		this._users = null;
		this._done = false;
	}

	setHandler(handler: IExtensionPointHandler<T>): void {
		if (this._handler !== null || this._done) {
			throw new Error('Handler already set!');
		}
		this._handler = handler;
		this._handle();
	}

	acceptUsers(users: IExtensionPointUser<T>[]): void {
		if (this._users !== null || this._done) {
			throw new Error('Users already set!');
		}
		this._users = users;
		this._handle();
	}

	private _handle(): void {
		if (this._handler === null || this._users === null) {
			return;
		}
		this._done = true;

		let handler = this._handler;
		this._handler = null;

		let users = this._users;
		this._users = null;

		try {
			handler(users);
		} catch (err) {
			onUnexpectedError(err);
		}
	}
}

const schemaId = 'vscode://schemas/vscode-extensions';
const schema: IJSONSchema = {
	properties: {
		engines: {
			type: 'object',

			properties: {
				'vscode': {
					type: 'string',
					description: nls.localize('vscode.extension.engines.vscode', 'For VS Code extensions, specifies the VS Code version that the extension is compatible with. Cannot be *. For example: ^0.10.5 indicates compatibility with a minimum VS Code version of 0.10.5.'),
					default: '^0.10.0',
				}
			}
		},
		publisher: {
			description: nls.localize('vscode.extension.publisher', 'The publisher of the VS Code extension.'),
			type: 'string'
		},
		displayName: {
			description: nls.localize('vscode.extension.displayName', 'The display name for the extension used in the VS Code gallery.'),
			type: 'string'
		},
		categories: {
			description: nls.localize('vscode.extension.categories', 'The categories used by the VS Code gallery to categorize the extension.'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				enum: ['Languages', 'Snippets', 'Linters', 'Themes', 'Debuggers', 'Other', 'Keymaps', 'Formatters', 'Extension Packs', 'SCM Providers', 'Azure']
			}
		},
		galleryBanner: {
			type: 'object',
			description: nls.localize('vscode.extension.galleryBanner', 'Banner used in the VS Code marketplace.'),
			properties: {
				color: {
					description: nls.localize('vscode.extension.galleryBanner.color', 'The banner color on the VS Code marketplace page header.'),
					type: 'string'
				},
				theme: {
					description: nls.localize('vscode.extension.galleryBanner.theme', 'The color theme for the font used in the banner.'),
					type: 'string',
					enum: ['dark', 'light']
				}
			}
		},
		contributes: {
			description: nls.localize('vscode.extension.contributes', 'All contributions of the VS Code extension represented by this package.'),
			type: 'object',
			properties: {
				// extensions will fill in
			},
			default: {}
		},
		preview: {
			type: 'boolean',
			description: nls.localize('vscode.extension.preview', 'Sets the extension to be flagged as a Preview in the Marketplace.'),
		},
		activationEvents: {
			description: nls.localize('vscode.extension.activationEvents', 'Activation events for the VS Code extension.'),
			type: 'array',
			items: {
				type: 'string',
				defaultSnippets: [
					{
						label: 'onLanguage',
						description: nls.localize('vscode.extension.activationEvents.onLanguage', 'An activation event emitted whenever a file that resolves to the specified language gets opened.'),
						body: 'onLanguage:${1:languageId}'
					},
					{
						label: 'onCommand',
						description: nls.localize('vscode.extension.activationEvents.onCommand', 'An activation event emitted whenever the specified command gets invoked.'),
						body: 'onCommand:${2:commandId}'
					},
					{
						label: 'onDebug',
						description: nls.localize('vscode.extension.activationEvents.onDebug', 'An activation event emitted whenever a debug session of the specified type is started.'),
						body: 'onDebug:${3:type}'
					},
					{
						label: 'workspaceContains',
						description: nls.localize('vscode.extension.activationEvents.workspaceContains', 'An activation event emitted whenever a folder is opened that contains at least a file matching the specified glob pattern.'),
						body: 'workspaceContains:${4:filePattern}'
					},
					{
						label: 'onView',
						body: 'onView:${5:viewId}',
						description: nls.localize('vscode.extension.activationEvents.onView', 'An activation event emitted whenever the specified view is expanded.'),
					},
					{
						label: '*',
						description: nls.localize('vscode.extension.activationEvents.star', 'An activation event emitted on VS Code startup. To ensure a great end user experience, please use this activation event in your extension only when no other activation events combination works in your use-case.'),
						body: '*'
					}
				],
			}
		},
		badges: {
			type: 'array',
			description: nls.localize('vscode.extension.badges', 'Array of badges to display in the sidebar of the Marketplace\'s extension page.'),
			items: {
				type: 'object',
				required: ['url', 'href', 'description'],
				properties: {
					url: {
						type: 'string',
						description: nls.localize('vscode.extension.badges.url', 'Badge image URL.')
					},
					href: {
						type: 'string',
						description: nls.localize('vscode.extension.badges.href', 'Badge link.')
					},
					description: {
						type: 'string',
						description: nls.localize('vscode.extension.badges.description', 'Badge description.')
					}
				}
			}
		},
		extensionDependencies: {
			description: nls.localize('vscode.extension.extensionDependencies', 'Dependencies to other extensions. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp.'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string'
			}
		},
		scripts: {
			type: 'object',
			properties: {
				'vscode:prepublish': {
					description: nls.localize('vscode.extension.scripts.prepublish', 'Script executed before the package is published as a VS Code extension.'),
					type: 'string'
				}
			}
		},
		icon: {
			type: 'string',
			description: nls.localize('vscode.extension.icon', 'The path to a 128x128 pixel icon.')
		}
	}
};

export class ExtensionsRegistryImpl {

	private _extensionPoints: { [extPoint: string]: ExtensionPoint<any>; };

	constructor() {
		this._extensionPoints = {};
	}

	public registerExtensionPoint<T>(extensionPoint: string, deps: IExtensionPoint<any>[], jsonSchema: IJSONSchema): IExtensionPoint<T> {
		if (hasOwnProperty.call(this._extensionPoints, extensionPoint)) {
			throw new Error('Duplicate extension point: ' + extensionPoint);
		}
		let result = new ExtensionPoint<T>(extensionPoint);
		this._extensionPoints[extensionPoint] = result;

		schema.properties['contributes'].properties[extensionPoint] = jsonSchema;
		schemaRegistry.registerSchema(schemaId, schema);

		return result;
	}

	public getExtensionPoints(): ExtensionPoint<any>[] {
		return Object.keys(this._extensionPoints).map(point => this._extensionPoints[point]);
	}
}

const PRExtensions = {
	ExtensionsRegistry: 'ExtensionsRegistry'
};
Registry.add(PRExtensions.ExtensionsRegistry, new ExtensionsRegistryImpl());
export const ExtensionsRegistry: ExtensionsRegistryImpl = Registry.as(PRExtensions.ExtensionsRegistry);

schemaRegistry.registerSchema(schemaId, schema);
