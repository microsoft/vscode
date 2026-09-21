/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionRecommendationNotificationService, RecommendationsNotificationResult } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';

export class NullExtensionRecommendationNotificationService implements IExtensionRecommendationNotificationService {
	readonly _serviceBrand: undefined;

	readonly ignoredRecommendations: string[] = [];

	hasToIgnoreRecommendationNotifications(): boolean {
		return true;
	}

	async promptImportantExtensionsInstallNotification(): Promise<RecommendationsNotificationResult> {
		return RecommendationsNotificationResult.Ignored;
	}

	async promptWorkspaceRecommendations(): Promise<void> {
		// no-op
	}
}
