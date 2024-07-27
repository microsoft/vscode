/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { IQueryOptions, ILocalExtension, IGalleryExtension, IExtensionIdentifier, InstallOptions, IExtensionInfo, IExtensionQueryOptions, IDeprecationInfo, InstallExtensionResult } from 'vs/platform/extensionManagement/common/extensionManagement';
import { EnablementState, IExtensionManagementServer, IResourceExtension } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionManifest, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { IView, IViewPaneContainer } from 'vs/workbench/common/views';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionsStatus } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionEditorOptions } from 'vs/workbench/contrib/extensions/common/extensionsInput';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ProgressLocation } from 'vs/platform/progress/common/progress';

export const VIEWLET_ID = 'workbench.view.extensions';

export interface IExtensionsViewPaneContainer extends IViewPaneContainer {
	readonly searchValue: string | undefined;
	search(text: string): void;
	refresh(): Promise<void>;
}

export interface IWorkspaceRecommendedExtensionsView extends IView {
	installWorkspaceRecommendations(): Promise<void>;
}

export const enum ExtensionState {
	Installing,
	Installed,
	Uninstalling,
	Uninstalled
}

export const enum ExtensionRuntimeActionType {
	ReloadWindow = 'reloadWindow',
	RestartExtensions = 'restartExtensions',
	DownloadUpdate = 'downloadUpdate',
	ApplyUpdate = 'applyUpdate',
	QuitAndInstall = 'quitAndInstall',
}

export type ExtensionRuntimeState = { action: ExtensionRuntimeActionType; reason: string };

export interface IExtension {
	readonly type: ExtensionType;
	readonly isBuiltin: boolean;
	readonly isWorkspaceScoped: boolean;
	readonly state: ExtensionState;
	readonly name: string;
	readonly displayName: string;
	readonly identifier: IExtensionIdentifier;
	readonly publisher: string;
	readonly publisherDisplayName: string;
	readonly publisherUrl?: URI;
	readonly publisherDomain?: { link: string; verified: boolean };
	readonly publisherSponsorLink?: URI;
	readonly pinned: boolean;
	readonly version: string;
	readonly latestVersion: string;
	readonly preRelease: boolean;
	readonly isPreReleaseVersion: boolean;
	readonly hasPreReleaseVersion: boolean;
	readonly hasReleaseVersion: boolean;
	readonly description: string;
	readonly url?: string;
	readonly repository?: string;
	readonly supportUrl?: string;
	readonly iconUrl: string;
	readonly iconUrlFallback: string;
	readonly licenseUrl?: string;
	readonly installCount?: number;
	readonly rating?: number;
	readonly ratingCount?: number;
	readonly outdated: boolean;
	readonly outdatedTargetPlatform: boolean;
	readonly runtimeState: ExtensionRuntimeState | undefined;
	readonly enablementState: EnablementState;
	readonly tags: readonly string[];
	readonly categories: readonly string[];
	readonly dependencies: string[];
	readonly extensionPack: string[];
	readonly telemetryData: any;
	readonly preview: boolean;
	getManifest(token: CancellationToken): Promise<IExtensionManifest | null>;
	hasReadme(): boolean;
	getReadme(token: CancellationToken): Promise<string>;
	hasChangelog(): boolean;
	getChangelog(token: CancellationToken): Promise<string>;
	readonly server?: IExtensionManagementServer;
	readonly local?: ILocalExtension;
	gallery?: IGalleryExtension;
	readonly resourceExtension?: IResourceExtension;
	readonly isMalicious: boolean;
	readonly deprecationInfo?: IDeprecationInfo;
}

export const IExtensionsWorkbenchService = createDecorator<IExtensionsWorkbenchService>('extensionsWorkbenchService');

export interface InstallExtensionOptions extends InstallOptions {
	version?: string;
	justification?: string | { reason: string; action: string };
	enable?: boolean;
}

export interface IExtensionsWorkbenchService {
	readonly _serviceBrand: undefined;
	readonly onChange: Event<IExtension | undefined>;
	readonly onReset: Event<void>;
	readonly preferPreReleases: boolean;
	readonly local: IExtension[];
	readonly installed: IExtension[];
	readonly outdated: IExtension[];
	readonly whenInitialized: Promise<void>;
	queryLocal(server?: IExtensionManagementServer): Promise<IExtension[]>;
	queryGallery(token: CancellationToken): Promise<IPager<IExtension>>;
	queryGallery(options: IQueryOptions, token: CancellationToken): Promise<IPager<IExtension>>;
	getExtensions(extensionInfos: IExtensionInfo[], token: CancellationToken): Promise<IExtension[]>;
	getExtensions(extensionInfos: IExtensionInfo[], options: IExtensionQueryOptions, token: CancellationToken): Promise<IExtension[]>;
	getResourceExtensions(locations: URI[], isWorkspaceScoped: boolean): Promise<IExtension[]>;
	canInstall(extension: IExtension): Promise<boolean>;
	install(id: string, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation): Promise<IExtension>;
	install(vsix: URI, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation): Promise<IExtension>;
	install(extension: IExtension, installOptions?: InstallExtensionOptions, progressLocation?: ProgressLocation): Promise<IExtension>;
	installInServer(extension: IExtension, server: IExtensionManagementServer): Promise<void>;
	uninstall(extension: IExtension): Promise<void>;
	reinstall(extension: IExtension): Promise<IExtension>;
	togglePreRelease(extension: IExtension): Promise<void>;
	canSetLanguage(extension: IExtension): boolean;
	setLanguage(extension: IExtension): Promise<void>;
	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void>;
	isAutoUpdateEnabledFor(extensionOrPublisher: IExtension | string): boolean;
	updateAutoUpdateEnablementFor(extensionOrPublisher: IExtension | string, enable: boolean): Promise<void>;
	shouldRequireConsentToUpdate(extension: IExtension): Promise<string | undefined>;
	open(extension: IExtension | string, options?: IExtensionEditorOptions): Promise<void>;
	updateAutoUpdateValue(value: AutoUpdateConfigurationValue): Promise<void>;
	getAutoUpdateValue(): AutoUpdateConfigurationValue;
	checkForUpdates(): Promise<void>;
	getExtensionStatus(extension: IExtension): IExtensionsStatus | undefined;
	updateAll(): Promise<InstallExtensionResult[]>;
	updateRunningExtensions(): Promise<void>;

	// Sync APIs
	isExtensionIgnoredToSync(extension: IExtension): boolean;
	toggleExtensionIgnoredToSync(extension: IExtension): Promise<void>;
	toggleApplyExtensionToAllProfiles(extension: IExtension): Promise<void>;
}

export const enum ExtensionEditorTab {
	Readme = 'readme',
	Features = 'features',
	Changelog = 'changelog',
	Dependencies = 'dependencies',
	ExtensionPack = 'extensionPack',
}

export const ConfigurationKey = 'extensions';
export const AutoUpdateConfigurationKey = 'extensions.autoUpdate';
export const AutoCheckUpdatesConfigurationKey = 'extensions.autoCheckUpdates';
export const CloseExtensionDetailsOnViewChangeKey = 'extensions.closeExtensionDetailsOnViewChange';
export const AutoRestartConfigurationKey = 'extensions.autoRestart';

export type AutoUpdateConfigurationValue = boolean | 'onlyEnabledExtensions' | 'onlySelectedExtensions';

export interface IExtensionsConfiguration {
	autoUpdate: boolean;
	autoCheckUpdates: boolean;
	ignoreRecommendations: boolean;
	closeExtensionDetailsOnViewChange: boolean;
}

export interface IExtensionContainer extends IDisposable {
	extension: IExtension | null;
	updateWhenCounterExtensionChanges?: boolean;
	update(): void;
}

export class ExtensionContainers extends Disposable {

	constructor(
		private readonly containers: IExtensionContainer[],
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super();
		this._register(extensionsWorkbenchService.onChange(this.update, this));
	}

	set extension(extension: IExtension) {
		this.containers.forEach(c => c.extension = extension);
	}

	private update(extension: IExtension | undefined): void {
		for (const container of this.containers) {
			if (extension && container.extension) {
				if (areSameExtensions(container.extension.identifier, extension.identifier)) {
					if (container.extension.server && extension.server && container.extension.server !== extension.server) {
						if (container.updateWhenCounterExtensionChanges) {
							container.update();
						}
					} else {
						container.extension = extension;
					}
				}
			} else {
				container.update();
			}
		}
	}
}

export const WORKSPACE_RECOMMENDATIONS_VIEW_ID = 'workbench.views.extensions.workspaceRecommendations';
export const OUTDATED_EXTENSIONS_VIEW_ID = 'workbench.views.extensions.searchOutdated';
export const TOGGLE_IGNORE_EXTENSION_ACTION_ID = 'workbench.extensions.action.toggleIgnoreExtension';
export const SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID = 'workbench.extensions.action.installVSIX';
export const INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID = 'workbench.extensions.command.installFromVSIX';

export const LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID = 'workbench.extensions.action.listWorkspaceUnsupportedExtensions';

// Context Keys
export const HasOutdatedExtensionsContext = new RawContextKey<boolean>('hasOutdatedExtensions', false);
export const CONTEXT_HAS_GALLERY = new RawContextKey<boolean>('hasGallery', false);

// Context Menu Groups
export const THEME_ACTIONS_GROUP = '_theme_';
export const INSTALL_ACTIONS_GROUP = '0_install';
export const UPDATE_ACTIONS_GROUP = '0_update';

export const extensionsSearchActionsMenu = new MenuId('extensionsSearchActionsMenu');

export interface IExtensionArg {
	id: string;
	version: string;
	location: URI | undefined;
}
