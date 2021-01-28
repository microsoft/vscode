/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const enum RecommendationSource {
	FILE = 1,
	WORKSPACE = 2,
	EXE = 3
}

export function RecommendationSourceToString(source: RecommendationSource) {
	switch (source) {
		case RecommendationSource.FILE: return 'file';
		case RecommendationSource.WORKSPACE: return 'workspace';
		case RecommendationSource.EXE: return 'exe';
	}
}

export const enum RecommendationsNotificationResult {
	Ignored = 'ignored',
	Cancelled = 'cancelled',
	TooMany = 'toomany',
	IncompatibleWindow = 'incompatibleWindow',
	Accepted = 'reacted',
}

export const IExtensionRecommendationNotificationService = createDecorator<IExtensionRecommendationNotificationService>('IExtensionRecommendationNotificationService');

export interface IExtensionRecommendationNotificationService {
	readonly _serviceBrand: undefined;

	readonly ignoredRecommendations: string[];
	hasToIgnoreRecommendationNotifications(): boolean;

	promptImportantExtensionsInstallNotification(extensionIds: string[], message: string, searchValue: string, source: RecommendationSource): Promise<RecommendationsNotificationResult>;
	promptWorkspaceRecommendations(recommendations: string[]): Promise<void>;
}

