/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator, refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtension, ExtensionType, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IExtensionManagementService, IGalleryExtension, IExtensionIdentifier, ILocalExtension, InstallOptions, InstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionResult, Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { FileAccess } from 'vs/base/common/network';

export interface IExtensionManagementServer {
	readonly id: string;
	readonly label: string;
	readonly extensionManagementService: IExtensionManagementService;
}

export const enum ExtensionInstallLocation {
	Local = 1,
	Remote,
	Web
}

export const IExtensionManagementServerService = createDecorator<IExtensionManagementServerService>('extensionManagementServerService');
export interface IExtensionManagementServerService {
	readonly _serviceBrand: undefined;
	readonly localExtensionManagementServer: IExtensionManagementServer | null;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null;
	readonly webExtensionManagementServer: IExtensionManagementServer | null;
	getExtensionManagementServer(extension: IExtension): IExtensionManagementServer | null;
	getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null;
}

export const DefaultIconPath = FileAccess.asBrowserUri('./media/defaultIcon.png', require).toString(true);

export type InstallExtensionOnServerEvent = InstallExtensionEvent & { server: IExtensionManagementServer };
export type UninstallExtensionOnServerEvent = IExtensionIdentifier & { server: IExtensionManagementServer };
export type DidUninstallExtensionOnServerEvent = DidUninstallExtensionEvent & { server: IExtensionManagementServer };

export const IWorkbenchExtensionManagementService = refineServiceDecorator<IExtensionManagementService, IWorkbenchExtensionManagementService>(IExtensionManagementService);
export interface IWorkbenchExtensionManagementService extends IExtensionManagementService {
	readonly _serviceBrand: undefined;

	onInstallExtension: Event<InstallExtensionOnServerEvent>;
	onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;
	onUninstallExtension: Event<UninstallExtensionOnServerEvent>;
	onDidUninstallExtension: Event<DidUninstallExtensionOnServerEvent>;

	installWebExtension(location: URI): Promise<ILocalExtension>;
	installExtensions(extensions: IGalleryExtension[], installOptions?: InstallOptions): Promise<ILocalExtension[]>;
	updateFromGallery(gallery: IGalleryExtension, extension: ILocalExtension, installOptions?: InstallOptions): Promise<ILocalExtension>;
	getExtensionManagementServerToInstall(manifest: IExtensionManifest): IExtensionManagementServer | null;
}

export const enum EnablementState {
	DisabledByTrustRequirement,
	DisabledByExtensionKind,
	DisabledByEnvironment,
	EnabledByEnvironment,
	DisabledByVirtualWorkspace,
	DisabledByExtensionDependency,
	DisabledGlobally,
	DisabledWorkspace,
	EnabledGlobally,
	EnabledWorkspace
}

export const IWorkbenchExtensionEnablementService = createDecorator<IWorkbenchExtensionEnablementService>('extensionEnablementService');

export interface IWorkbenchExtensionEnablementService {
	readonly _serviceBrand: undefined;

	/**
	 * Event to listen on for extension enablement changes
	 */
	readonly onEnablementChanged: Event<readonly IExtension[]>;

	/**
	 * Returns the enablement state for the given extension
	 */
	getEnablementState(extension: IExtension): EnablementState;

	/**
	 * Returns the enablement states for the given extensions
	 * @param extensions list of extensions
	 * @param workspaceTypeOverrides Workspace type overrides
	 */
	getEnablementStates(extensions: IExtension[], workspaceTypeOverrides?: { trusted?: boolean }): EnablementState[];

	/**
	 * Returns the enablement states for the dependencies of the given extension
	 */
	getDependenciesEnablementStates(extension: IExtension): [IExtension, EnablementState][];

	/**
	 * Returns `true` if the enablement can be changed.
	 */
	canChangeEnablement(extension: IExtension): boolean;

	/**
	 * Returns `true` if the enablement can be changed.
	 */
	canChangeWorkspaceEnablement(extension: IExtension): boolean;

	/**
	 * Returns `true` if the given extension is enabled.
	 */
	isEnabled(extension: IExtension): boolean;

	/**
	 * Returns `true` if the given enablement state is enabled enablement state.
	 */
	isEnabledEnablementState(enablementState: EnablementState): boolean;

	/**
	 * Returns `true` if the given extension identifier is disabled globally.
	 * Extensions can be disabled globally or in workspace or both.
	 * If an extension is disabled in both then enablement state shows only workspace.
	 * This will
	 */
	isDisabledGlobally(extension: IExtension): boolean;

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

	/**
	 * Updates the enablement state of the extensions when workspace trust changes.
	 */
	updateExtensionsEnablementsWhenWorkspaceTrustChanges(): Promise<void>;
}

export interface IScannedExtension extends IExtension {
	readonly metadata?: Metadata;
}

export const IWebExtensionsScannerService = createDecorator<IWebExtensionsScannerService>('IWebExtensionsScannerService');
export interface IWebExtensionsScannerService {
	readonly _serviceBrand: undefined;

	scanSystemExtensions(): Promise<IExtension[]>;
	scanUserExtensions(donotIgnoreInvalidExtensions?: boolean): Promise<IScannedExtension[]>;
	scanExtensionsUnderDevelopment(): Promise<IExtension[]>;
	scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType): Promise<IExtension | null>;

	addExtension(location: URI, metadata?: Metadata): Promise<IExtension>;
	addExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: Metadata): Promise<IExtension>;
	removeExtension(identifier: IExtensionIdentifier, version?: string): Promise<void>;

	scanExtensionManifest(extensionLocation: URI): Promise<IExtensionManifest | null>;
}
