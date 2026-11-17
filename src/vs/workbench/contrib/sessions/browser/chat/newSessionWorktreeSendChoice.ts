/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorktreeSendChoiceAsker } from '../../../chat/browser/agentSessions/worktreeSendChoiceTarget.js';

/** Where the first request of a new session sent in its folder works ({@link INewSessionWorktreeSendChoiceProvider}). */
export type NewSessionWorktreeSendChoice = 'worktree' | 'folder';

/**
 * Decides, as the first request of a new session that would work in its folder is sent, whether it works in a new worktree
 * of the folder instead: such as when another chat recently worked in that folder, as the user chose once or chooses now
 * in a callout on the New Worktree control of the draft's composer. It holds no UI: the composer marks its own control as
 * the callout's target while the provider asks about its draft, with `WorktreeSendChoiceTarget`.
 */
export interface INewSessionWorktreeSendChoiceProvider extends IWorktreeSendChoiceAsker {
	/** Whether another chat recently worked in `folder` itself, other than the session of `draft`: only then is there a choice. */
	isRecentChatInFolder(folder: URI, draft: URI): boolean;
	/**
	 * Where the session of `draft` works: as the user chose once, else as the user chooses now in a callout on the New Worktree
	 * control of the draft's composer, while the send waits. `undefined` is no answer, such as where it could not ask: the
	 * session then works in its folder.
	 */
	requestSendChoice(draft: URI): Promise<NewSessionWorktreeSendChoice | undefined>;
}

export const INewSessionWorktreeSendChoiceService = createDecorator<INewSessionWorktreeSendChoiceService>('newSessionWorktreeSendChoiceService');

/** Holds the provider that a composer asks as it sends a new session in its folder; with none, it never asks. */
export interface INewSessionWorktreeSendChoiceService {
	readonly _serviceBrand: undefined;
	/** The provider registered last, until its registration is disposed. */
	readonly provider: IObservable<INewSessionWorktreeSendChoiceProvider | undefined>;
	/** Registers `provider`, such as a feature of the window does, until the returned disposable is disposed. */
	registerProvider(provider: INewSessionWorktreeSendChoiceProvider): IDisposable;
}

export class NewSessionWorktreeSendChoiceService implements INewSessionWorktreeSendChoiceService {

	declare readonly _serviceBrand: undefined;

	private readonly _provider = observableValue<INewSessionWorktreeSendChoiceProvider | undefined>(this, undefined);
	readonly provider: IObservable<INewSessionWorktreeSendChoiceProvider | undefined> = this._provider;

	registerProvider(provider: INewSessionWorktreeSendChoiceProvider): IDisposable {
		this._provider.set(provider, undefined);
		return toDisposable(() => {
			if (this._provider.get() === provider) {
				this._provider.set(undefined, undefined);
			}
		});
	}
}

// Wherever a new-session composer shows, in an editor window or the Agents window, which registers no provider
registerSingleton(INewSessionWorktreeSendChoiceService, NewSessionWorktreeSendChoiceService, InstantiationType.Delayed);
