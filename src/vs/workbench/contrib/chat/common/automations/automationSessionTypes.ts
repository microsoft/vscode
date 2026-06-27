/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * A (provider, session-type) choice an automation can target. Captured at
 * creation and reused on every run, independent of the workspace default.
 */
export interface IAutomationSessionTypeChoice {
	readonly providerId: string;
	readonly sessionTypeId: string;
	/** Human-readable label suitable for display in a dropdown. */
	readonly label: string;
	/** Optional sub-label distinguishing duplicates (e.g. a remote host). */
	readonly description?: string;
}

export const IAutomationSessionTypeProvider = createDecorator<IAutomationSessionTypeProvider>('automationSessionTypeProvider');

/**
 * Bridges the workbench-side Automations UI to whichever layer knows which
 * session types exist (the Sessions layer wraps
 * `ISessionsManagementService.getSessionTypesForFolder`).
 */
export interface IAutomationSessionTypeProvider {
	readonly _serviceBrand: undefined;

	/**
	 * Lists the session types the user can pick from for a given folder.
	 * Returns an empty array when nothing is registered or no provider
	 * can serve the folder.
	 */
	getSessionTypesForFolder(folderUri: URI): readonly IAutomationSessionTypeChoice[];
}
