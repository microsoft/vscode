/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { IQueryOptions, IExtensionManifest, LocalExtensionType, EnablementState, ILocalExtension, IGalleryExtension, IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IViewContainersRegistry, ViewContainer, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

export const VIEWLET_ID = 'workbench.view.extensions';
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(VIEWLET_ID);

export interface IExtensionsViewlet extends IViewlet {
	search(text: string): void;
}

export const enum ExtensionState {
	Installing,
	Installed,
	Uninstalling,
	Uninstalled
}

export interface IExtension {
	type?: LocalExtensionType;
	state: ExtensionState;
	name: string;
	displayName: string;
	identifier: IExtensionIdentifier;
	publisher: string;
	publisherDisplayName: string;
	version: string;
	latestVersion: string;
	description: string;
	url?: string;
	repository?: string;
	iconUrl: string;
	iconUrlFallback: string;
	licenseUrl?: string;
	installCount?: number;
	rating?: number;
	ratingCount?: number;
	outdated: boolean;
	enablementState: EnablementState;
	dependencies: string[];
	extensionPack: string[];
	telemetryData: any;
	preview: boolean;
	getManifest(token: CancellationToken): Promise<IExtensionManifest | null>;
	getReadme(token: CancellationToken): Promise<string>;
	hasReadme(): boolean;
	getChangelog(token: CancellationToken): Promise<string>;
	hasChangelog(): boolean;
	local?: ILocalExtension;
	locals?: ILocalExtension[];
	gallery?: IGalleryExtension;
	isMalicious: boolean;
}

export interface IExtensionDependencies {
	dependencies: IExtensionDependencies[];
	hasDependencies: boolean;
	identifier: string;
	extension: IExtension;
	dependent: IExtensionDependencies | null;
}

export const SERVICE_ID = 'extensionsWorkbenchService';

export const IExtensionsWorkbenchService = createDecorator<IExtensionsWorkbenchService>(SERVICE_ID);

export interface IExtensionsWorkbenchService {
	_serviceBrand: any;
	onChange: Event<IExtension | undefined>;
	local: IExtension[];
	queryLocal(): Promise<IExtension[]>;
	queryGallery(options?: IQueryOptions): Promise<IPager<IExtension>>;
	canInstall(extension: IExtension): boolean;
	install(vsix: string): Promise<void>;
	install(extension: IExtension, promptToInstallDependencies?: boolean): Promise<void>;
	uninstall(extension: IExtension): Promise<void>;
	installVersion(extension: IExtension, version: string): Promise<void>;
	reinstall(extension: IExtension): Promise<void>;
	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void>;
	loadDependencies(extension: IExtension, token: CancellationToken): Promise<IExtensionDependencies | null>;
	open(extension: IExtension, sideByside?: boolean): Promise<any>;
	checkForUpdates(): Promise<void>;
	allowedBadgeProviders: string[];
}

export const ConfigurationKey = 'extensions';
export const AutoUpdateConfigurationKey = 'extensions.autoUpdate';
export const AutoCheckUpdatesConfigurationKey = 'extensions.autoCheckUpdates';
export const ShowRecommendationsOnlyOnDemandKey = 'extensions.showRecommendationsOnlyOnDemand';
export const CloseExtensionDetailsOnViewChangeKey = 'extensions.closeExtensionDetailsOnViewChange';

export interface IExtensionsConfiguration {
	autoUpdate: boolean;
	autoCheckUpdates: boolean;
	ignoreRecommendations: boolean;
	showRecommendationsOnlyOnDemand: boolean;
	closeExtensionDetailsOnViewChange: boolean;
}

export interface IExtensionContainer {
	extension: IExtension | null;
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

	private update(extension: IExtension): void {
		for (const container of this.containers) {
			if (extension && container.extension) {
				if (areSameExtensions(container.extension.identifier, extension.identifier)) {
					container.extension = extension;
				}
			} else {
				container.update();
			}
		}
	}
}