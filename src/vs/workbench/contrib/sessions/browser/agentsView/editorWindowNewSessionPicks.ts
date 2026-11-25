/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isUriComponents, URI } from '../../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { INewSessionTarget } from '../parts/chatView.js';

/** The key of what the new-session composers of an editor window picked last, per workspace. */
export const EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY = 'sessions.editorWindow.newSessionPicks';

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

/**
 * What the user picked last in the new-session composers of an editor window, such as the folder, agent, model and mode: the
 * next new session starts with it, also after a reload. It is the user's choice for this workspace, and the Agents window's
 * own choices stay its own.
 */
export class EditorWindowNewSessionPicks {

	constructor(private readonly _storageService: IStorageService) { }

	/** What the user picked last, or nothing when nothing is stored or what is stored is not valid. */
	read(): INewSessionTarget | undefined {
		const stored = this._storageService.get(EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!stored) {
			return undefined;
		}
		try {
			const value = JSON.parse(stored) as Partial<Record<keyof INewSessionTarget, unknown>> | null;
			if (!value || typeof value !== 'object' || !isOptionalString(value.providerId) || !isOptionalString(value.sessionTypeId) || !isOptionalString(value.modelId)
				|| !isOptionalString(value.modeId) || (value.placement !== undefined && value.placement !== 'worktree')
				|| (value.requireDevContainer !== undefined && typeof value.requireDevContainer !== 'boolean')
				|| (value.folderUri !== undefined && (!isUriComponents(value.folderUri) || !value.folderUri.scheme))) {
				return undefined;
			}
			const folderUri = value.folderUri ? URI.revive(value.folderUri) : undefined;
			return {
				...(folderUri ? { folderUri } : {}),
				...(value.providerId ? { providerId: value.providerId } : {}),
				...(value.sessionTypeId ? { sessionTypeId: value.sessionTypeId } : {}),
				...(value.modelId ? { modelId: value.modelId } : {}),
				...(value.modeId ? { modeId: value.modeId } : {}),
				...(value.requireDevContainer ? { requireDevContainer: true } : {}),
				...(value.placement ? { placement: value.placement } : {}),
			};
		} catch {
			return undefined;
		}
	}

	store(target: INewSessionTarget): void {
		this._storageService.store(EDITOR_WINDOW_NEW_SESSION_PICKS_STORAGE_KEY, JSON.stringify(target), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

/** What {@link applyRememberedNewSessionPicks} checks a remembered pick against. */
export interface IRememberedPicksContext {
	/** The folder the window's composers create sessions in that `uri` is, if any. */
	toAllowedFolder(uri: URI): URI | undefined;
	/** Whether an agent offers new sessions of the provider and session type. */
	isAgentAvailable(providerId: string, sessionTypeId: string | undefined): boolean;
}

/**
 * The target a new default composer starts with: `target`, as its caller aims it, with what the user picked last for what it
 * leaves open; a caller that names something explicit, such as a folder, agent or placement, does not use it. A pick that no
 * longer applies, such as an agent that is gone or a folder the window does not offer, is left out, so that the composer uses
 * its default. The remembered New Worktree is only a preference: the composer drops it silently where its agent cannot work
 * in a new worktree. A Dev Container is never remembered, as it needs the folder's own support.
 */
export function applyRememberedNewSessionPicks(target: INewSessionTarget | undefined, remembered: INewSessionTarget | undefined, context: IRememberedPicksContext): INewSessionTarget | undefined {
	if (!remembered) {
		return target;
	}
	let result: INewSessionTarget = target ?? {};
	const namesAgent = !!(result.providerId || result.sessionTypeId || result.modelId || result.modeId);
	if (!namesAgent && remembered.providerId && context.isAgentAvailable(remembered.providerId, remembered.sessionTypeId)) {
		result = { ...result, providerId: remembered.providerId, ...(remembered.sessionTypeId ? { sessionTypeId: remembered.sessionTypeId } : {}), ...(remembered.modelId ? { modelId: remembered.modelId } : {}), ...(remembered.modeId ? { modeId: remembered.modeId } : {}) };
	}
	const rememberedFolder = remembered.folderUri && context.toAllowedFolder(remembered.folderUri);
	if (rememberedFolder && !namesAgent && !result.requireDevContainer && !result.placement) {
		result = { ...result, folderUri: rememberedFolder, ...(remembered.placement ? { placement: remembered.placement, placementIsPreference: true } : {}) };
	}
	return result.folderUri || result.providerId ? result : target;
}
