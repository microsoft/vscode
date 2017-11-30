/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';
import Event from 'vs/base/common/event';

export interface IExtensionDescription {
	readonly id: string;
	readonly name: string;
	readonly uuid?: string;
	readonly displayName?: string;
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
	readonly keywords?: string[];
	enableProposedApi?: boolean;
}

export const IExtensionService = createDecorator<IExtensionService>('extensionService');

export interface IMessage {
	type: Severity;
	message: string;
	source: string;
	extensionId: string;
	extensionPointId: string;
}

export interface IExtensionsStatus {
	messages: IMessage[];
}

export class ActivationTimes {
	public readonly startup: boolean;
	public readonly codeLoadingTime: number;
	public readonly activateCallTime: number;
	public readonly activateResolvedTime: number;

	constructor(startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number) {
		this.startup = startup;
		this.codeLoadingTime = codeLoadingTime;
		this.activateCallTime = activateCallTime;
		this.activateResolvedTime = activateResolvedTime;
	}
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
	 * An event emitted when extensions are registered after their extension points got handled.
	 *
	 * This event will also fire on startup to signal the installed extensions.
	 *
	 * @returns the extensions that got registered
	 */
	onDidRegisterExtensions: Event<IExtensionDescription[]>;

	/**
	 * Send an activation event and activate interested extensions.
	 */
	activateByEvent(activationEvent: string): TPromise<void>;

	/**
	 * An promise that resolves when the installed extensions are registered after
	 * their extension points got handled.
	 */
	whenInstalledExtensionsRegistered(): TPromise<boolean>;

	/**
	 * Return all registered extensions
	 */
	getExtensions(): TPromise<IExtensionDescription[]>;

	/**
	 * Read all contributions to an extension point.
	 */
	readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]>;

	/**
	 * Get information about extensions status.
	 */
	getExtensionsStatus(): { [id: string]: IExtensionsStatus };

	/**
	 * Get information about extension activation times.
	 */
	getExtensionsActivationTimes(): { [id: string]: ActivationTimes; };

	/**
	 * Restarts the extension host.
	 */
	restartExtensionHost(): void;

	/**
	 * Starts the extension host.
	 */
	startExtensionHost(): void;

	/**
	 * Stops the extension host.
	 */
	stopExtensionHost(): void;
}
