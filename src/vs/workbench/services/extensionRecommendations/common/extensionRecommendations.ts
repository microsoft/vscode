/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IWorkspace, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IStringDictionary } from 'vs/base/common/collections';

export interface IExtensionsConfigContent {
	recommendations: string[];
	unwantedRecommendations: string[];
}

export type RecommendationChangeNotification = {
	extensionId: string,
	isRecommended: boolean
};

export type DynamicRecommendation = 'dynamic';
export type ConfigRecommendation = 'config';
export type ExecutableRecommendation = 'executable';
export type CachedRecommendation = 'cached';
export type ApplicationRecommendation = 'application';
export type ExperimentalRecommendation = 'experimental';
export type ExtensionRecommendationSource = IWorkspace | IWorkspaceFolder | URI | DynamicRecommendation | ExecutableRecommendation | CachedRecommendation | ApplicationRecommendation | ExperimentalRecommendation | ConfigRecommendation;

export interface IExtensionRecommendation {
	extensionId: string;
	sources: ExtensionRecommendationSource[];
}

export const enum ExtensionRecommendationReason {
	Workspace,
	File,
	Executable,
	WorkspaceConfig,
	DynamicWorkspace,
	Experimental,
	Application,
}

export interface IExtensionRecommendationReson {
	reasonId: ExtensionRecommendationReason;
	reasonText: string;
}

export const IExtensionRecommendationsService = createDecorator<IExtensionRecommendationsService>('extensionRecommendationsService');

export interface IExtensionRecommendationsService {
	readonly _serviceBrand: undefined;

	getAllRecommendationsWithReason(): IStringDictionary<IExtensionRecommendationReson>;
	getImportantRecommendations(): Promise<IExtensionRecommendation[]>;
	getOtherRecommendations(): Promise<IExtensionRecommendation[]>;
	getFileBasedRecommendations(): IExtensionRecommendation[];
	getExeBasedRecommendations(exe?: string): Promise<{ important: IExtensionRecommendation[], others: IExtensionRecommendation[] }>;
	getConfigBasedRecommendations(): Promise<{ important: IExtensionRecommendation[], others: IExtensionRecommendation[] }>;
	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]>;
	getKeymapRecommendations(): IExtensionRecommendation[];

	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void;
	getIgnoredRecommendations(): ReadonlyArray<string>;
	onRecommendationChange: Event<RecommendationChangeNotification>;
}
