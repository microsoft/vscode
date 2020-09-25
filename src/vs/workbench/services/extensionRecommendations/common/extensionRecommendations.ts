/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
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
	getImportantRecommendations(): Promise<string[]>;
	getOtherRecommendations(): Promise<string[]>;
	getFileBasedRecommendations(): string[];
	getExeBasedRecommendations(exe?: string): Promise<{ important: string[], others: string[] }>;
	getConfigBasedRecommendations(): Promise<{ important: string[], others: string[] }>;
	getWorkspaceRecommendations(): Promise<string[]>;
	getKeymapRecommendations(): string[];

	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void;
	getIgnoredRecommendations(): ReadonlyArray<string>;
	onRecommendationChange: Event<RecommendationChangeNotification>;
}
