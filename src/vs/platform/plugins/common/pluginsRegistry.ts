/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import * as paths from 'vs/base/common/paths';
import Severity from 'vs/base/common/severity';
import {Extensions, IJSONContributionRegistry} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {Registry} from 'vs/platform/platform';
import {IActivationEventListener, IMessage, IPluginDescription, IPointListener} from 'vs/platform/plugins/common/plugins';

export interface IMessageCollector {
	error(message: any): void;
	warn(message: any): void;
	info(message: any): void;
}

export interface IPluginsMessageCollector {
	error(source: string, message: any): void;
	warn(source: string, message: any): void;
	info(source: string, message: any): void;
	scopeTo(source: string): IMessageCollector;
}

class ScopedMessageCollector implements IMessageCollector {
	private _scope: string;
	private _actual: IPluginsMessageCollector;

	constructor(scope: string, actual: IPluginsMessageCollector) {
		this._scope = scope;
		this._actual = actual;
	}

	public error(message: any): void {
		this._actual.error(this._scope, message);
	}

	public warn(message: any): void {
		this._actual.warn(this._scope, message);
	}

	public info(message: any): void {
		this._actual.info(this._scope, message);
	}
}

export interface IMessageHandler {
	(severity: Severity, source: string, message: string): void;
}

class PluginsMessageForwarder implements IPluginsMessageCollector {

	private _handler: IMessageHandler;

	constructor(handler: IMessageHandler) {
		this._handler = handler;
	}

	private _pushMessage(type: Severity, source: string, message: any): void {
		this._handler(
			type,
			source,
			this._ensureString(message)
		);
	}

	private _ensureString(e: any): string {
		if (e && e.message && e.stack) {
			return e.message + '\n\n' + e.stack;
		}
		return String(e);
	}

	public error(source: string, message: any): void {
		this._pushMessage(Severity.Error, source, message);
	}

	public warn(source: string, message: any): void {
		this._pushMessage(Severity.Warning, source, message);
	}

	public info(source: string, message: any): void {
		this._pushMessage(Severity.Info, source, message);
	}

	public scopeTo(source: string): IMessageCollector {
		return new ScopedMessageCollector(source, this);
	}
}

export class PluginsMessageCollector implements IPluginsMessageCollector {

	private _messages: IMessage[];

	constructor() {
		this._messages = [];
	}

	public getMessages(): IMessage[] {
		return this._messages;
	}

	private _pushMessage(type: Severity, source: string, message: any): void {
		this._messages.push({
			type: type,
			message: this._ensureString(message),
			source: source
		});
	}

	private _ensureString(e: any): string {
		if (e && e.message && e.stack) {
			return e.message + '\n\n' + e.stack;
		}
		return String(e);
	}

	public error(source: string, message: any): void {
		this._pushMessage(Severity.Error, source, message);
	}

	public warn(source: string, message: any): void {
		this._pushMessage(Severity.Warning, source, message);
	}

	public info(source: string, message: any): void {
		this._pushMessage(Severity.Info, source, message);
	}

	public scopeTo(source: string): IMessageCollector {
		return new ScopedMessageCollector(source, this);
	}
}

export function isValidPluginDescription(extensionFolderPath: string, pluginDescription: IPluginDescription, notices: string[]): boolean {
	if (!pluginDescription) {
		notices.push(nls.localize('pluginDescription.empty', "Got empty extension description"));
		return false;
	}
	if (typeof pluginDescription.publisher !== 'string') {
		notices.push(nls.localize('pluginDescription.publisher', "property `{0}` is mandatory and must be of type `string`", 'publisher'));
		return false;
	}
	if (typeof pluginDescription.name !== 'string') {
		notices.push(nls.localize('pluginDescription.name', "property `{0}` is mandatory and must be of type `string`", 'name'));
		return false;
	}
	if (typeof pluginDescription.version !== 'string') {
		notices.push(nls.localize('pluginDescription.version', "property `{0}` is mandatory and must be of type `string`", 'version'));
		return false;
	}
	if (!pluginDescription.engines) {
		notices.push(nls.localize('pluginDescription.engines', "property `{0}` is mandatory and must be of type `object`", 'engines'));
		return false;
	}
	if (typeof pluginDescription.engines.vscode !== 'string') {
		notices.push(nls.localize('pluginDescription.engines.vscode', "property `{0}` is mandatory and must be of type `string`", 'engines.vscode'));
		return false;
	}
	if (typeof pluginDescription.extensionDependencies !== 'undefined') {
		if (!_isStringArray(pluginDescription.extensionDependencies)) {
			notices.push(nls.localize('pluginDescription.extensionDependencies', "property `{0}` can be omitted or must be of type `string[]`", 'extensionDependencies'));
			return false;
		}
	}
	if (typeof pluginDescription.activationEvents !== 'undefined') {
		if (!_isStringArray(pluginDescription.activationEvents)) {
			notices.push(nls.localize('pluginDescription.activationEvents1', "property `{0}` can be omitted or must be of type `string[]`", 'activationEvents'));
			return false;
		}
		if (typeof pluginDescription.main === 'undefined') {
			notices.push(nls.localize('pluginDescription.activationEvents2', "properties `{0}` and `{1}` must both be specified or must both be omitted", 'activationEvents', 'main'));
			return false;
		}
	}
	if (typeof pluginDescription.main !== 'undefined') {
		if (typeof pluginDescription.main !== 'string') {
			notices.push(nls.localize('pluginDescription.main1', "property `{0}` can be omitted or must be of type `string`", 'main'));
			return false;
		} else {
			let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, pluginDescription.main));

			if (normalizedAbsolutePath.indexOf(extensionFolderPath)) {
				notices.push(nls.localize('pluginDescription.main2', "Expected `main` ({0}) to be included inside extension's folder ({1}). This might make the extension non-portable.", normalizedAbsolutePath, extensionFolderPath));
				// not a failure case
			}
		}
		if (typeof pluginDescription.activationEvents === 'undefined') {
			notices.push(nls.localize('pluginDescription.main3', "properties `{0}` and `{1}` must both be specified or must both be omitted", 'activationEvents', 'main'));
			return false;
		}
	}
	return true;
}

interface IPluginDescriptionMap {
	[pluginId: string]: IPluginDescription;
}
const hasOwnProperty = Object.hasOwnProperty;
let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);

export interface IExtensionPointUser<T> {
	description: IPluginDescription;
	value: T;
	collector: IMessageCollector;
}

export interface IExtensionPointHandler<T> {
	(extensions: IExtensionPointUser<T>[]): void;
}

export interface IExtensionPoint<T> {
	name: string;
	setHandler(handler: IExtensionPointHandler<T>): void;
}

export interface IPluginsRegistry {
	registerPlugins(pluginDescriptions: IPluginDescription[]): void;

	getPluginDescriptionsForActivationEvent(activationEvent: string): IPluginDescription[];
	getAllPluginDescriptions(): IPluginDescription[];
	getPluginDescription(pluginId: string): IPluginDescription;

	registerOneTimeActivationEventListener(activationEvent: string, listener: IActivationEventListener): void;
	triggerActivationEventListeners(activationEvent: string): void;

	registerExtensionPoint<T>(extensionPoint: string, jsonSchema: IJSONSchema): IExtensionPoint<T>;
	handleExtensionPoints(messageHandler: IMessageHandler): void;
}

class ExtensionPoint<T> implements IExtensionPoint<T> {

	public name: string;
	private _registry: PluginsRegistryImpl;
	private _handler: IExtensionPointHandler<T>;
	private _collector: IPluginsMessageCollector;

	constructor(name: string, registry: PluginsRegistryImpl) {
		this.name = name;
		this._registry = registry;
		this._handler = null;
		this._collector = null;
	}

	setHandler(handler: IExtensionPointHandler<T>): void {
		if (this._handler) {
			throw new Error('Handler already set!');
		}
		this._handler = handler;
		this._handle();
	}

	handle(collector: IPluginsMessageCollector): void {
		this._collector = collector;
		this._handle();
	}

	private _handle(): void {
		if (!this._handler || !this._collector) {
			return;
		}

		this._registry.registerPointListener(this.name, (descriptions: IPluginDescription[]) => {
			let users = descriptions.map((desc) => {
				return {
					description: desc,
					value: desc.contributes[this.name],
					collector: this._collector.scopeTo(desc.extensionFolderPath)
				};
			});
			this._handler(users);
		});
	}
}



const schemaId = 'vscode://schemas/vscode-extensions';
const schema: IJSONSchema = {
	default: {
		'name': '{{name}}',
		'description': '{{description}}',
		'author': '{{author}}',
		'version': '{{1.0.0}}',
		'main': '{{pathToMain}}',
		'dependencies': {}
	},
	properties: {
		// engines: {
		// 	required: [ 'vscode' ],
		// 	properties: {
		// 		'vscode': {
		// 			type: 'string',
		// 			description: nls.localize('vscode.extension.engines.vscode', 'Specifies that this package only runs inside VSCode of the given version.'),
		// 		}
		// 	}
		// },
		displayName: {
			description: nls.localize('vscode.extension.displayName', 'The display name for the extension used in the VS Code gallery.'),
			type: 'string'
		},
		categories: {
			description: nls.localize('vscode.extension.categories', 'The categories used by the VS Code gallery to categorize the extension.'),
			type: 'array',
			items: {
				type: 'string',
				enum: ['Languages', 'Snippets', 'Linters', 'Themes', 'Debuggers', 'Other']
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
		publisher: {
			description: nls.localize('vscode.extension.publisher', 'The publisher of the VS Code extension.'),
			type: 'string'
		},
		activationEvents: {
			description: nls.localize('vscode.extension.activationEvents', 'Activation events for the VS Code extension.'),
			type: 'array',
			items: {
				type: 'string'
			}
		},
		extensionDependencies: {
			description: nls.localize('vscode.extension.extensionDependencies', 'Dependencies to other extensions. The id of an extension is always ${publisher}.${name}. For example: vscode.csharp.'),
			type: 'array',
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
		contributes: {
			description: nls.localize('vscode.extension.contributes', 'All contributions of the VS Code extension represented by this package.'),
			type: 'object',
			properties: {
				// extensions will fill in
			},
			default: {}
		},
		isAMD: {
			description: nls.localize('vscode.extension.isAMD', 'Indicated whether VS Code should load your code as AMD or CommonJS. Default: false.'),
			type: 'boolean'
		}
	}
};

interface IPointListenerEntry {
	extensionPoint: string;
	listener: IPointListener;
}

class PluginsRegistryImpl implements IPluginsRegistry {

	private _pluginsMap: IPluginDescriptionMap;
	private _pluginsArr: IPluginDescription[];
	private _activationMap: { [activationEvent: string]: IPluginDescription[]; };
	private _pointListeners: IPointListenerEntry[];
	private _oneTimeActivationEventListeners: { [activationEvent: string]: IActivationEventListener[]; };
	private _extensionPoints: { [extPoint: string]: ExtensionPoint<any>; };

	constructor() {
		this._pluginsMap = {};
		this._pluginsArr = [];
		this._activationMap = {};
		this._pointListeners = [];
		this._extensionPoints = {};
		this._oneTimeActivationEventListeners = {};
	}

	public registerPointListener(point: string, handler: IPointListener): void {
		let entry = {
			extensionPoint: point,
			listener: handler
		};
		this._pointListeners.push(entry);
		this._triggerPointListener(entry, PluginsRegistryImpl._filterWithExtPoint(this.getAllPluginDescriptions(), point));
	}

	public registerExtensionPoint<T>(extensionPoint: string, jsonSchema: IJSONSchema): IExtensionPoint<T> {
		if (hasOwnProperty.call(this._extensionPoints, extensionPoint)) {
			throw new Error('Duplicate extension point: ' + extensionPoint);
		}
		let result = new ExtensionPoint<T>(extensionPoint, this);
		this._extensionPoints[extensionPoint] = result;

		schema.properties['contributes'].properties[extensionPoint] = jsonSchema;
		schemaRegistry.registerSchema(schemaId, schema);

		return result;
	}

	public handleExtensionPoints(messageHandler: IMessageHandler): void {
		let collector = new PluginsMessageForwarder(messageHandler);

		Object.keys(this._extensionPoints).forEach((extensionPointName) => {
			this._extensionPoints[extensionPointName].handle(collector);
		});
	}

	private _triggerPointListener(handler: IPointListenerEntry, desc: IPluginDescription[]): void {
		// console.log('_triggerPointListeners: ' + desc.length + ' OF ' + handler.extensionPoint);
		if (!desc || desc.length === 0) {
			return;
		}
		try {
			handler.listener(desc);
		} catch (e) {
			onUnexpectedError(e);
		}
	}

	public registerPlugins(pluginDescriptions: IPluginDescription[]): void {
		for (let i = 0, len = pluginDescriptions.length; i < len; i++) {
			let pluginDescription = pluginDescriptions[i];

			if (hasOwnProperty.call(this._pluginsMap, pluginDescription.id)) {
				// No overwriting allowed!
				console.error('Plugin `' + pluginDescription.id + '` is already registered');
				continue;
			}

			this._pluginsMap[pluginDescription.id] = pluginDescription;
			this._pluginsArr.push(pluginDescription);

			if (Array.isArray(pluginDescription.activationEvents)) {
				for (let j = 0, lenJ = pluginDescription.activationEvents.length; j < lenJ; j++) {
					let activationEvent = pluginDescription.activationEvents[j];
					this._activationMap[activationEvent] = this._activationMap[activationEvent] || [];
					this._activationMap[activationEvent].push(pluginDescription);
				}
			}
		}

		for (let i = 0, len = this._pointListeners.length; i < len; i++) {
			let listenerEntry = this._pointListeners[i];
			let descriptions = PluginsRegistryImpl._filterWithExtPoint(pluginDescriptions, listenerEntry.extensionPoint);
			this._triggerPointListener(listenerEntry, descriptions);
		}
	}

	private static _filterWithExtPoint(input: IPluginDescription[], point: string): IPluginDescription[] {
		return input.filter((desc) => {
			return (desc.contributes && hasOwnProperty.call(desc.contributes, point));
		});
	}

	public getPluginDescriptionsForActivationEvent(activationEvent: string): IPluginDescription[] {
		if (!hasOwnProperty.call(this._activationMap, activationEvent)) {
			return [];
		}
		return this._activationMap[activationEvent].slice(0);
	}

	public getAllPluginDescriptions(): IPluginDescription[] {
		return this._pluginsArr.slice(0);
	}

	public getPluginDescription(pluginId: string): IPluginDescription {
		if (!hasOwnProperty.call(this._pluginsMap, pluginId)) {
			return null;
		}
		return this._pluginsMap[pluginId];
	}

	public registerOneTimeActivationEventListener(activationEvent: string, listener: IActivationEventListener): void {
		if (!hasOwnProperty.call(this._oneTimeActivationEventListeners, activationEvent)) {
			this._oneTimeActivationEventListeners[activationEvent] = [];
		}
		this._oneTimeActivationEventListeners[activationEvent].push(listener);
	}

	public triggerActivationEventListeners(activationEvent: string): void {
		if (hasOwnProperty.call(this._oneTimeActivationEventListeners, activationEvent)) {
			let listeners = this._oneTimeActivationEventListeners[activationEvent];
			delete this._oneTimeActivationEventListeners[activationEvent];

			for (let i = 0, len = listeners.length; i < len; i++) {
				let listener = listeners[i];
				try {
					listener();
				} catch (e) {
					onUnexpectedError(e);
				}
			}
		}
	}

}

function _isStringArray(arr: string[]): boolean {
	if (!Array.isArray(arr)) {
		return false;
	}
	for (let i = 0, len = arr.length; i < len; i++) {
		if (typeof arr[i] !== 'string') {
			return false;
		}
	}
	return true;
}

const PRExtensions = {
	PluginsRegistry: 'PluginsRegistry'
};
Registry.add(PRExtensions.PluginsRegistry, new PluginsRegistryImpl());
export const PluginsRegistry: IPluginsRegistry = Registry.as(PRExtensions.PluginsRegistry);

schemaRegistry.registerSchema(schemaId, schema);
schemaRegistry.addSchemaFileAssociation('/package.json', schemaId);