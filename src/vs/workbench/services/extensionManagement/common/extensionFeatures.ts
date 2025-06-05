/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Event } from '../../../../base/common/event.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import Severity from '../../../../base/common/severity.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Color } from '../../../../base/common/color.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export namespace Extensions {
	export const ExtensionFeaturesRegistry = 'workbench.registry.extensionFeatures';
}

export interface IExtensionFeatureRenderer extends IDisposable {
	type: string;
	shouldRender(manifest: IExtensionManifest): boolean;
	render(manifest: IExtensionManifest): IDisposable;
}

export interface IRenderedData<T> extends IDisposable {
	readonly data: T;
	readonly onDidChange?: Event<T>;
}

export interface IExtensionFeatureMarkdownRenderer extends IExtensionFeatureRenderer {
	type: 'markdown';
	render(manifest: IExtensionManifest): IRenderedData<IMarkdownString>;
}

export type IRowData = string | IMarkdownString | ResolvedKeybinding | Color | ReadonlyArray<ResolvedKeybinding | IMarkdownString | Color>;

export interface ITableData {
	headers: string[];
	rows: IRowData[][];
}

export interface IExtensionFeatureTableRenderer extends IExtensionFeatureRenderer {
	type: 'table';
	render(manifest: IExtensionManifest): IRenderedData<ITableData>;
}

export interface IExtensionFeatureMarkdownAndTableRenderer extends IExtensionFeatureRenderer {
	type: 'markdown+table';
	render(manifest: IExtensionManifest): IRenderedData<Array<IMarkdownString | ITableData>>;
}

export interface IExtensionFeatureDescriptor {
	readonly id: string;
	readonly label: string;
	// label of the access data, if different from the feature title.
	// This is useful when the feature is a part of a larger feature and the access data is not about the larger feature.
	// This is shown in the access chart like "There were ${accessCount} ${accessLabel} requests from this extension".
	readonly accessDataLabel?: string;
	readonly description?: string;
	readonly icon?: ThemeIcon;
	readonly access: {
		readonly canToggle?: boolean;
		readonly requireUserConsent?: boolean;
		readonly extensionsList?: IStringDictionary<boolean>;
	};
	readonly renderer?: SyncDescriptor<IExtensionFeatureRenderer>;
}

export interface IExtensionFeaturesRegistry {

	registerExtensionFeature(descriptor: IExtensionFeatureDescriptor): IDisposable;
	getExtensionFeature(id: string): IExtensionFeatureDescriptor | undefined;
	getExtensionFeatures(): ReadonlyArray<IExtensionFeatureDescriptor>;
}

export interface IExtensionFeatureAccessData {
	readonly current?: {
		readonly accessTimes: Date[];
		readonly lastAccessed: Date;
		readonly status?: { readonly severity: Severity; readonly message: string };
	};
	readonly accessTimes: Date[];
}

export const IExtensionFeaturesManagementService = createDecorator<IExtensionFeaturesManagementService>('IExtensionFeaturesManagementService');
export interface IExtensionFeaturesManagementService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeEnablement: Event<{ readonly extension: ExtensionIdentifier; readonly featureId: string; readonly enabled: boolean }>;
	isEnabled(extension: ExtensionIdentifier, featureId: string): boolean;
	setEnablement(extension: ExtensionIdentifier, featureId: string, enabled: boolean): void;
	getEnablementData(featureId: string): { readonly extension: ExtensionIdentifier; readonly enabled: boolean }[];

	getAccess(extension: ExtensionIdentifier, featureId: string, justification?: string): Promise<boolean>;

	readonly onDidChangeAccessData: Event<{ readonly extension: ExtensionIdentifier; readonly featureId: string; readonly accessData: IExtensionFeatureAccessData }>;
	getAllAccessDataForExtension(extension: ExtensionIdentifier): Map<string, IExtensionFeatureAccessData>;
	getAccessData(extension: ExtensionIdentifier, featureId: string): IExtensionFeatureAccessData | undefined;
	setStatus(extension: ExtensionIdentifier, featureId: string, status: { readonly severity: Severity; readonly message: string } | undefined): void;
}

class ExtensionFeaturesRegistry implements IExtensionFeaturesRegistry {

	private readonly extensionFeatures = new Map<string, IExtensionFeatureDescriptor>();

	registerExtensionFeature(descriptor: IExtensionFeatureDescriptor): IDisposable {
		if (this.extensionFeatures.has(descriptor.id)) {
			throw new Error(`Extension feature with id '${descriptor.id}' already exists`);
		}
		this.extensionFeatures.set(descriptor.id, descriptor);
		return {
			dispose: () => this.extensionFeatures.delete(descriptor.id)
		};
	}

	getExtensionFeature(id: string): IExtensionFeatureDescriptor | undefined {
		return this.extensionFeatures.get(id);
	}

	getExtensionFeatures(): ReadonlyArray<IExtensionFeatureDescriptor> {
		return Array.from(this.extensionFeatures.values());
	}
}

Registry.add(Extensions.ExtensionFeaturesRegistry, new ExtensionFeaturesRegistry());
