/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IExtension } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

export const IExtensionManagementServerService = createDecorator<IExtensionManagementServerService>('extensionManagementServerService');

export interface IExtensionManagementServer {
	extensionManagementService: IExtensionManagementService;
	authority: string;
	label: string;
}

export interface IExtensionManagementServerService {
	_serviceBrand: any;
	readonly localExtensionManagementServer: IExtensionManagementServer | null;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null;
	getExtensionManagementServer(location: URI): IExtensionManagementServer | null;
}

export const enum EnablementState {
	Disabled,
	WorkspaceDisabled,
	Enabled,
	WorkspaceEnabled
}

export const IExtensionEnablementService = createDecorator<IExtensionEnablementService>('extensionEnablementService');

export interface IExtensionEnablementService {
	_serviceBrand: any;

	readonly allUserExtensionsDisabled: boolean;

	/**
	 * Event to listen on for extension enablement changes
	 */
	onEnablementChanged: Event<IExtension[]>;

	/**
	 * Returns the enablement state for the given extension
	 */
	getEnablementState(extension: IExtension): EnablementState;

	/**
	 * Returns `true` if the enablement can be changed.
	 */
	canChangeEnablement(extension: IExtension): boolean;

	/**
	 * Returns `true` if the given extension identifier is enabled.
	 */
	isEnabled(extension: IExtension): boolean;

	/**
	 * Enable or disable the given extension.
	 * if `workspace` is `true` then enablement is done for workspace, otherwise globally.
	 *
	 * Returns a promise that resolves to boolean value.
	 * if resolves to `true` then requires restart for the change to take effect.
	 *
	 * Throws error if enablement is requested for workspace and there is no workspace
	 */
	setEnablement(extensions: IExtension[], state: EnablementState): Promise<boolean[]>;
}
