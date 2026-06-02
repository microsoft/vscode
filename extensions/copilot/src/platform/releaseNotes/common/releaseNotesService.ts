/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

/**
 * Service to fetch release notes.
 */
export interface IReleaseNotesService {
	readonly _serviceBrand: undefined;
	fetchLatestReleaseNotes(): Promise<string | undefined>;
	/**
	 * Fetch release notes for a specific VS Code version.
	 * Accepts full versions like "1.92.1" or minor versions like "1.92".
	 * Implementation should sanitize to major.minor.
	 */
	fetchReleaseNotesForVersion(version: string): Promise<string | undefined>;
}

export const IReleaseNotesService = createServiceIdentifier<IReleaseNotesService>('releaseNotesService');