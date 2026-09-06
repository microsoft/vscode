/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const NEW_SESSION_PROMPT_TYPING_DURATION_MS = 2_500;

export interface INewSessionPromptOption {
	readonly id: string;
	readonly title: string;
	readonly titleDetail?: string;
	readonly description: string;
	readonly prompt: string;
	readonly placeholder: string;
	readonly icon?: ThemeIcon;
}

export type NewSessionPromptOptionsState =
	| { readonly kind: 'loading' }
	| { readonly kind: 'resolved'; readonly options: readonly INewSessionPromptOption[] };

export const enum NewSessionWorkspacePreselectionSource {
	None = 'none',
	CheckedWorkspace = 'checkedWorkspace',
	RecentWorkspace = 'recentWorkspace',
	ExistingSessions = 'existingSessions',
	ProvidedWorkspace = 'providedWorkspace',
	User = 'user',
	Unknown = 'unknown',
}

/**
 * Reports an intermediate prompt-option state while {@link INewSessionPromptOptionsController.resolve}
 * is still running, so options can be rendered before the controller has settled on its final set.
 *
 * Returns whether the state was rendered. Implementers may refuse a late update, for example while
 * the user is already acting on the options on screen.
 */
export type NewSessionPromptOptionsProgress = (state: NewSessionPromptOptionsState) => boolean;

export interface INewSessionPromptOptionsController {
	/**
	 * Resolves the final prompt options. Single-shot per refresh.
	 *
	 * @param progress Optional sink for intermediate states. Implementers may ignore it; callers that
	 * pass it must tolerate it never being invoked and must apply the returned state regardless.
	 */
	resolve(token: CancellationToken, progress?: NewSessionPromptOptionsProgress): Promise<NewSessionPromptOptionsState>;
	onDidSelectOption(option: INewSessionPromptOption): void;
	onDidClose(): void;
}

export interface INewSessionComposer {
	readonly workspacePreselectionSource?: NewSessionWorkspacePreselectionSource;
	animatePrompt(text: string, durationMs: number, placeholder: string, token: CancellationToken): Promise<boolean>;
	showPromptOptions(state: NewSessionPromptOptionsState | undefined): boolean;
	setPromptOptionsController?(controller: INewSessionPromptOptionsController): void;
	refreshPromptOptions?(token?: CancellationToken): Promise<boolean>;
}

export const INewSessionComposerService = createDecorator<INewSessionComposerService>('newSessionComposerService');

export interface INewSessionComposerService {
	readonly _serviceBrand: undefined;
	readonly activeComposer: IObservable<INewSessionComposer | undefined>;
	registerComposer(composer: INewSessionComposer): IDisposable;
}

export class NewSessionComposerService extends Disposable implements INewSessionComposerService {
	declare readonly _serviceBrand: undefined;

	private readonly _composers = new Set<INewSessionComposer>();
	private readonly _activeComposer = observableValue<INewSessionComposer | undefined>(this, undefined);
	readonly activeComposer: IObservable<INewSessionComposer | undefined> = this._activeComposer;

	registerComposer(composer: INewSessionComposer): IDisposable {
		this._composers.add(composer);
		this._activeComposer.set(composer, undefined);
		return toDisposable(() => {
			this._composers.delete(composer);
			if (this._activeComposer.get() === composer) {
				this._activeComposer.set(Array.from(this._composers).at(-1), undefined);
			}
		});
	}
}

registerSingleton(INewSessionComposerService, NewSessionComposerService, InstantiationType.Delayed);
