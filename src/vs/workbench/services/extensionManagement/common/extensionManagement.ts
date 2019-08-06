/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IExtension } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkspace, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

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
	DisabledByExtensionKind,
	DisabledByEnvironemt,
	DisabledGlobally,
	DisabledWorkspace,
	EnabledGlobally,
	EnabledWorkspace
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

export interface IExtensionsConfigContent {
	recommendations: string[];
	unwantedRecommendations: string[];
}

export type RecommendationChangeNotification = {
	extensionId: string,
	isRecommended: boolean
};

export type DynamicRecommendation = 'dynamic';
export type ExecutableRecommendation = 'executable';
export type CachedRecommendation = 'cached';
export type ApplicationRecommendation = 'application';
export type ExtensionRecommendationSource = IWorkspace | IWorkspaceFolder | URI | DynamicRecommendation | ExecutableRecommendation | CachedRecommendation | ApplicationRecommendation;

export interface IExtensionRecommendation {
	extensionId: string;
	sources: ExtensionRecommendationSource[];
}

export const IExtensionTipsService = createDecorator<IExtensionTipsService>('extensionTipsService');

export interface IExtensionTipsService {
	_serviceBrand: any;
	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason, reasonText: string }; };
	getFileBasedRecommendations(): IExtensionRecommendation[];
	getOtherRecommendations(): Promise<IExtensionRecommendation[]>;
	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]>;
	getKeymapRecommendations(): IExtensionRecommendation[];
	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void;
	getAllIgnoredRecommendations(): { global: string[], workspace: string[] };
	onRecommendationChange: Event<RecommendationChangeNotification>;
}

export const enum ExtensionRecommendationReason {
	Workspace,
	File,
	Executable,
	DynamicWorkspace,
	Experimental
}
