/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import picomatch from 'picomatch';

/**
 * Session indexing levels for cloud sync.
 * - 'local': keep on device only, no remote export
 * - 'user': sync to cloud, visible only to the user
 * - 'repo_and_user': sync to cloud, visible to repo collaborators
 */
export type SessionIndexingLevel = 'local' | 'user' | 'repo_and_user';

/**
 * Manages user preferences for session indexing via VS Code settings.
 *
 * Two settings control behavior:
 * - `chat.localIndex.enabled` (ExP) — enables local
 *   SQLite tracking and /chronicle commands
 * - `chat.sessionSync.enabled` (core setting with enterprise policy) — enables
 *   cloud upload
 */
export class SessionIndexingPreference {

	constructor(
		private readonly _configService: IConfigurationService,
	) { }

	/**
	 * Get the effective storage level for a given repo.
	 * - If cloud sync is enabled and repo is not excluded → 'user'
	 * - Otherwise → 'local'
	 */
	getStorageLevel(repoNwo?: string): SessionIndexingLevel {
		if (this.hasCloudConsent(repoNwo)) {
			return 'user';
		}
		return 'local';
	}

	/**
	 * Check if session sync is enabled for a given repo.
	 * Returns true if `chat.sessionSync.enabled` is true AND the repo is not excluded.
	 */
	hasCloudConsent(repoNwo?: string): boolean {
		if (!(this._configService.getNonExtensionConfig<boolean>('chat.sessionSync.enabled') ?? false)) {
			return false;
		}

		if (repoNwo) {
			const excludePatterns = this._configService.getNonExtensionConfig<string[]>('chat.sessionSync.excludeRepositories');
			if (excludePatterns && excludePatterns.length > 0) {
				for (const pattern of excludePatterns) {
					if (pattern === repoNwo || picomatch.isMatch(repoNwo, pattern)) {
						return false;
					}
				}
			}
		}

		return true;
	}
}
