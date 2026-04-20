/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
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
 * - `chat.sessionSearch.localIndex.enabled` (team-internal, ExP) — enables local
 *   SQLite tracking and /chronicle commands
 * - `chat.sessionSearch.cloudSync.enabled` — enables
 *   cloud upload to cloud
 * - `chat.sessionSearch.cloudSync.excludeRepositories` — repo patterns
 *   to exclude from cloud sync
 */
export class SessionIndexingPreference {

	constructor(
		private readonly _configService: IConfigurationService,
	) { }

	/**
	 * Get the effective storage level for a given repo.	 *
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
	 * Check if cloud sync is enabled for a given repo.
	 * Returns true if cloudSync.enabled is true AND the repo is not excluded.
	 * Check both new and old setting for backward compatibility.
	 */
	hasCloudConsent(repoNwo?: string): boolean {
		let cloudEnabled: boolean;
		if (this._configService.isConfigured(ConfigKey.Advanced.SessionSearchCloudSync)) {
			// New key explicitly set by user — authoritative
			cloudEnabled = this._configService.getConfig(ConfigKey.Advanced.SessionSearchCloudSync);
		} else {
			// Fall back to old internal key for existing users who haven't migrated yet
			cloudEnabled = this._configService.getConfig(ConfigKey.TeamInternal.SessionSearchCloudSyncEnabled);
		}

		if (!cloudEnabled) {
			return false;
		}

		if (repoNwo) {
			const excludePatterns = this._configService.getConfig(ConfigKey.TeamInternal.SessionSearchCloudSyncExcludeRepositories);
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
