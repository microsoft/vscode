/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';

/** Where the first request of a new session sent in its folder works ({@link INewSessionWorktreeSendChoiceProvider}). */
export type NewSessionWorktreeSendChoice = 'worktree' | 'folder';

/**
 * Decides, as the first request of a new session that would work in its folder is sent, whether it works in a new worktree
 * of the folder instead: such as when another chat recently worked in that folder, as the user chose once or chooses now
 * in a callout on the composer's New Worktree control.
 */
export interface INewSessionWorktreeSendChoiceProvider {
	/** Whether another chat recently worked in `folder` itself, other than the session of `draft`: only then is there a choice. */
	isRecentChatInFolder(folder: URI, draft: URI): boolean;
	/**
	 * Where the session works: as the user chose once, else as the user chooses now in a callout on `control`, while the send
	 * waits. `undefined` is no answer, such as where it could not ask: the session then works in its folder.
	 */
	askWorktreeOnSend(control: HTMLElement): Promise<NewSessionWorktreeSendChoice | undefined>;
}

let provider: INewSessionWorktreeSendChoiceProvider | undefined;

/** Registers the provider that a composer asks as it sends a new session in its folder; with none, it never asks. */
export function registerNewSessionWorktreeSendChoice(newProvider: INewSessionWorktreeSendChoiceProvider): IDisposable {
	provider = newProvider;
	return toDisposable(() => {
		if (provider === newProvider) {
			provider = undefined;
		}
	});
}

export function getNewSessionWorktreeSendChoice(): INewSessionWorktreeSendChoiceProvider | undefined {
	return provider;
}
