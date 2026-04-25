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
	 */
	hasCloudConsent(repoNwo?: string): boolean {
		if (!this._configService.getConfig(ConfigKey.TeamInternal.SessionSearchCloudSyncEnabled)) {
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
