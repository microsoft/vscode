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
	/**
	 * Where the session of `draft`, working in `folder`, works; `undefined` when there is nothing to choose, such as with no
	 * recent chat in the folder. It can ask the user on `control`, while the send waits.
	 */
	ask(draft: URI, folder: URI, control: HTMLElement): Promise<NewSessionWorktreeSendChoice | undefined>;
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
