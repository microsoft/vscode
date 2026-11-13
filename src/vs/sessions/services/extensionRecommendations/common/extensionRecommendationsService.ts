/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionRecommendationReason, IExtensionRecommendationsService } from '../../../../workbench/services/extensionRecommendations/common/extensionRecommendations.js';

/**
 * The Agents window doesn't recommend extensions, but shows extension pages, which show why extensions are recommended.
 */
export class NullExtensionRecommendationsService implements IExtensionRecommendationsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeRecommendations = Event.None;

	getAllRecommendationsWithReason(): IStringDictionary<IExtensionRecommendationReason> {
		return {};
	}

	async getImportantRecommendations(): Promise<string[]> {
		return [];
	}

	async getOtherRecommendations(): Promise<string[]> {
		return [];
	}

	getFileBasedRecommendations(): string[] {
		return [];
	}

	async getExeBasedRecommendations(): Promise<{ important: string[]; others: string[] }> {
		return { important: [], others: [] };
	}

	async getConfigBasedRecommendations(): Promise<{ important: string[]; others: string[] }> {
		return { important: [], others: [] };
	}

	async getWorkspaceRecommendations(): Promise<Array<string | URI>> {
		return [];
	}

	getKeymapRecommendations(): string[] {
		return [];
	}

	getLanguageRecommendations(): string[] {
		return [];
	}

	getRemoteRecommendations(): string[] {
		return [];
	}
}
