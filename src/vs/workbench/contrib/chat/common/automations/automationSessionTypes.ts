/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * A single (provider, session-type) choice that an automation can target.
 *
 * Automations capture the user's pick at creation time and reuse it on every
 * scheduled run so the runner can spin up a session of the same kind every
 * time, regardless of which provider happens to be the workspace default
 * when the run fires.
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
 * Bridges the workbench-side Automations UI to whichever layer actually
 * knows which session types exist (today, the Sessions layer wraps
 * `ISessionsManagementService.getSessionTypesForFolder`).
 *
 * The workbench registers a no-op placeholder so the UI builds even
 * without the Sessions layer loaded; the Sessions layer overrides the
 * registration to expose the real list.
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

/**
 * Placeholder implementation used when no Sessions layer has registered
 * an override. Always returns an empty list so the UI falls back to the
 * default-provider create flow (i.e. preserves pre-existing behavior).
 */
export class PlaceholderAutomationSessionTypeProvider implements IAutomationSessionTypeProvider {

	declare readonly _serviceBrand: undefined;

	getSessionTypesForFolder(_folderUri: URI): readonly IAutomationSessionTypeChoice[] {
		return [];
	}
}
