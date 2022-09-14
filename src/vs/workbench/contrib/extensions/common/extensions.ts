/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { IQueryOptions, ILocalExtension, IGalleryExtension, IExtensionIdentifier, InstallOptions, InstallVSIXOptions, IExtensionInfo, IExtensionQueryOptions, IDeprecationInfo } from 'vs/platform/extensionManagement/common/extensionManagement';
import { EnablementState, IExtensionManagementServer } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionManifest, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { IView, IViewPaneContainer } from 'vs/workbench/common/views';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionsStatus } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionEditorOptions } from 'vs/workbench/contrib/extensions/common/extensionsInput';
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

export interface IExtension {
	readonly type: ExtensionType;
	readonly isBuiltin: boolean;
	readonly state: ExtensionState;
	readonly name: string;
	readonly displayName: string;
	readonly identifier: IExtensionIdentifier;
	readonly publisher: string;
	readonly publisherDisplayName: string;
	readonly publisherUrl?: URI;
	readonly publisherDomain?: { link: string; verified: boolean };
	readonly publisherSponsorLink?: URI;
	readonly version: string;
	readonly latestVersion: string;
	readonly hasPreReleaseVersion: boolean;
	readonly hasReleaseVersion: boolean;
	readonly description: string;
	readonly url?: string;
	readonly repository?: string;
	readonly iconUrl: string;
	readonly iconUrlFallback: string;
	readonly licenseUrl?: string;
	readonly installCount?: number;
	readonly rating?: number;
	readonly ratingCount?: number;
	readonly outdated: boolean;
	readonly outdatedTargetPlatform: boolean;
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
	readonly isMalicious: boolean;
	readonly deprecationInfo?: IDeprecationInfo;
}

export const SERVICE_ID = 'extensionsWorkbenchService';

export const IExtensionsWorkbenchService = createDecorator<IExtensionsWorkbenchService>(SERVICE_ID);

export interface IExtensionsWorkbenchService {
	readonly _serviceBrand: undefined;
	readonly onChange: Event<IExtension | undefined>;
	readonly onReset: Event<void>;
	readonly preferPreReleases: boolean;
	readonly local: IExtension[];
	readonly installed: IExtension[];
	readonly outdated: IExtension[];
	queryLocal(server?: IExtensionManagementServer): Promise<IExtension[]>;
	queryGallery(token: CancellationToken): Promise<IPager<IExtension>>;
	queryGallery(options: IQueryOptions, token: CancellationToken): Promise<IPager<IExtension>>;
	getExtensions(extensionInfos: IExtensionInfo[], token: CancellationToken): Promise<IExtension[]>;
	getExtensions(extensionInfos: IExtensionInfo[], options: IExtensionQueryOptions, token: CancellationToken): Promise<IExtension[]>;
	canInstall(extension: IExtension): Promise<boolean>;
	install(vsix: URI, installOptions?: InstallVSIXOptions): Promise<IExtension>;
	install(extension: IExtension, installOptions?: InstallOptions, progressLocation?: ProgressLocation): Promise<IExtension>;
	uninstall(extension: IExtension): Promise<void>;
	installVersion(extension: IExtension, version: string, installOptions?: InstallOptions): Promise<IExtension>;
	reinstall(extension: IExtension): Promise<IExtension>;
	canSetLanguage(extension: IExtension): boolean;
	setLanguage(extension: IExtension): Promise<void>;
	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void>;
	open(extension: IExtension, options?: IExtensionEditorOptions): Promise<void>;
	checkForUpdates(): Promise<void>;
	getExtensionStatus(extension: IExtension): IExtensionsStatus | undefined;

	// Sync APIs
	isExtensionIgnoredToSync(extension: IExtension): boolean;
	toggleExtensionIgnoredToSync(extension: IExtension): Promise<void>;
}

export const enum ExtensionEditorTab {
	Readme = 'readme',
	Contributions = 'contributions',
	Changelog = 'changelog',
	Dependencies = 'dependencies',
	ExtensionPack = 'extensionPack',
	RuntimeStatus = 'runtimeStatus',
}

export const ConfigurationKey = 'extensions';
export const AutoUpdateConfigurationKey = 'extensions.autoUpdate';
export const AutoCheckUpdatesConfigurationKey = 'extensions.autoCheckUpdates';
export const CloseExtensionDetailsOnViewChangeKey = 'extensions.closeExtensionDetailsOnViewChange';

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
export const TOGGLE_IGNORE_EXTENSION_ACTION_ID = 'workbench.extensions.action.toggleIgnoreExtension';
export const SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID = 'workbench.extensions.action.installVSIX';
export const INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID = 'workbench.extensions.command.installFromVSIX';

export const LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID = 'workbench.extensions.action.listWorkspaceUnsupportedExtensions';

// Context Keys
export const HasOutdatedExtensionsContext = new RawContextKey<boolean>('hasOutdatedExtensions', false);

// Context Menu Groups
export const THEME_ACTIONS_GROUP = '_theme_';
export const INSTALL_ACTIONS_GROUP = '0_install';
