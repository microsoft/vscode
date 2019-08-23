/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IPager } from 'vs/base/common/paging';
import { IQueryOptions, ILocalExtension, IGalleryExtension, IExtensionIdentifier } from 'vs/platform/extensionManagement/common/extensionManagement';
import { EnablementState, IExtensionManagementServer } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IViewContainersRegistry, ViewContainer, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionManifest, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';

export const VIEWLET_ID = 'workbench.view.extensions';
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(VIEWLET_ID);

export const EXTENSIONS_CONFIG = '.vscode/extensions.json';

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
	readonly type: ExtensionType;
	readonly state: ExtensionState;
	readonly name: string;
	readonly displayName: string;
	readonly identifier: IExtensionIdentifier;
	readonly publisher: string;
	readonly publisherDisplayName: string;
	readonly version: string;
	readonly latestVersion: string;
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
	readonly enablementState: EnablementState;
	readonly dependencies: string[];
	readonly extensionPack: string[];
	readonly telemetryData: any;
	readonly preview: boolean;
	getManifest(token: CancellationToken): Promise<IExtensionManifest | null>;
	getReadme(token: CancellationToken): Promise<string>;
	hasReadme(): boolean;
	getChangelog(token: CancellationToken): Promise<string>;
	hasChangelog(): boolean;
	readonly server?: IExtensionManagementServer;
	readonly local?: ILocalExtension;
	gallery?: IGalleryExtension;
	readonly isMalicious: boolean;
}

export const SERVICE_ID = 'extensionsWorkbenchService';

export const IExtensionsWorkbenchService = createDecorator<IExtensionsWorkbenchService>(SERVICE_ID);

export interface IExtensionsWorkbenchService {
	_serviceBrand: any;
	onChange: Event<IExtension | undefined>;
	local: IExtension[];
	installed: IExtension[];
	outdated: IExtension[];
	queryLocal(server?: IExtensionManagementServer): Promise<IExtension[]>;
	queryGallery(token: CancellationToken): Promise<IPager<IExtension>>;
	queryGallery(options: IQueryOptions, token: CancellationToken): Promise<IPager<IExtension>>;
	canInstall(extension: IExtension): boolean;
	install(vsix: URI): Promise<IExtension>;
	install(extension: IExtension, promptToInstallDependencies?: boolean): Promise<IExtension>;
	uninstall(extension: IExtension): Promise<void>;
	installVersion(extension: IExtension, version: string): Promise<IExtension>;
	reinstall(extension: IExtension): Promise<IExtension>;
	setEnablement(extensions: IExtension | IExtension[], enablementState: EnablementState): Promise<void>;
	open(extension: IExtension, sideByside?: boolean): Promise<any>;
	checkForUpdates(): Promise<void>;
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

	private update(extension: IExtension): void {
		for (const container of this.containers) {
			if (extension && container.extension) {
				if (areSameExtensions(container.extension.identifier, extension.identifier)) {
					if (!container.extension.server || !extension.server || container.extension.server === extension.server) {
						container.extension = extension;
					} else if (container.updateWhenCounterExtensionChanges) {
						container.update();
					}
				}
			} else {
				container.update();
			}
		}
	}
}
