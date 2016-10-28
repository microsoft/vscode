/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';

export interface IExtensionDescription {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly publisher: string;
	readonly isBuiltin: boolean;
	readonly extensionFolderPath: string;
	readonly extensionDependencies?: string[];
	readonly activationEvents?: string[];
	readonly engines: {
		vscode: string;
	};
	readonly main?: string;
	readonly contributes?: { [point: string]: any; };
}

export const IExtensionService = createDecorator<IExtensionService>('extensionService');

export interface IMessage {
	type: Severity;
	message: string;
	source: string;
}

export interface IExtensionsStatus {
	messages: IMessage[];
}

export class ExtensionPointContribution<T> {
	readonly description: IExtensionDescription;
	readonly value: T;

	constructor(description: IExtensionDescription, value: T) {
		this.description = description;
		this.value = value;
	}
}

export interface IExtensionService {
	_serviceBrand: any;

	/**
	 * Send an activation event and activate interested extensions.
	 */
	activateByEvent(activationEvent: string): TPromise<void>;

	/**
	 * Block on this signal any interactions with extensions.
	 */
	onReady(): TPromise<boolean>;

	/**
	 * Read all contributions to an extension point.
	 */
	readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]>;

	/**
	 * Get information about extensions status.
	 */
	getExtensionsStatus(): { [id: string]: IExtensionsStatus };
}

export const IExtensionsRuntimeService = createDecorator<IExtensionsRuntimeService>('extensionsRuntimeService');

export interface IExtensionsRuntimeService {
	_serviceBrand: any;

	/**
	 * Scans and returns only enabled extensions.
	 * **NOTE**: This call returns different results based on `setEnablement` calls!
	 */
	getExtensions(): TPromise<IExtensionDescription[]>;

	/**
	 * Returns `true` if given extension is disabled, otherwise `false`.
	 */
	isDisabled(identifier: string): boolean;

	/**
	 * Returns `true` if given extension is disabled always, otherwise `false`.
	 */
	isDisabledAlways(identifier: string): boolean;

	/**
	 * Returns `true` if given extension can be enabled by calling `setEnablement`, otherwise false`.
	 */
	canEnable(identifier: string): boolean;

	/**
	 * Enable or disable the given extension.
	 * if `workspace` is `true` then enablement is done for workspace, otherwise globally.
	 *
	 * Returns a promise that resolves to boolean value.
	 * if resolves to `true` then requires restart for the change to take effect.
	 *
	 * Throws error if enablement is requested for workspace and there is no workspace
	 */
	setEnablement(identifier: string, enable: boolean, workspace?: boolean): TPromise<boolean>;
}
