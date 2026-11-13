/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignal, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceSelectionSnapshot } from '../../../services/sessions/common/workspaceSelection.js';
import { ISendRequestOptions } from '../common/sessionsManagement.js';
import { ISessionAgentRef } from '../../../services/sessions/common/session.js';
import { getWindowHost, ISessionHost } from '../../../services/sessions/browser/sessionHost.js';

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

export interface INewSessionComposerPicker {
	getDomNode(): HTMLElement | undefined;
	open(): void;
	openComparison?(): void;
}

export interface INewSessionTargetLabels {
	readonly harness?: string;
	readonly workspace?: string;
	readonly environment?: string;
	readonly projectRoot?: URI;
	readonly repositoryRoot?: URI;
}

export interface INewSessionComposer {
	readonly sessionResource?: IObservable<URI | undefined>;
	readonly modelPicker?: INewSessionComposerPicker;
	readonly targetLabels?: IObservable<INewSessionTargetLabels>;
	readonly workspacePreselectionSource?: NewSessionWorkspacePreselectionSource;
	readonly workspaceSelection?: IWorkspaceSelectionSnapshot;
	readonly onDidChangeWorkspaceSelection?: Event<void>;
	readonly hasInput?: boolean;
	readonly isInputReady?: boolean;
	readonly onDidChangeInput?: Event<void>;
	readonly onDidFocus?: Event<void>;
	readonly canApplyWorkspaceDefault?: boolean;
	animatePrompt(text: string, durationMs: number, placeholder: string, token: CancellationToken): Promise<boolean>;
	showPromptOptions(state: NewSessionPromptOptionsState | undefined): boolean;
	setPromptOptionsController?(controller: INewSessionPromptOptionsController): void;
	refreshPromptOptions?(token?: CancellationToken): Promise<boolean>;
}

export const INewSessionComposerService = createDecorator<INewSessionComposerService>('newSessionComposerService');

/** The user selected a custom agent for a session in a picker, or cleared it ({@link INewSessionComposerService.onDidSelectAgent}). */
export interface IUserAgentSelection {
	readonly sessionId: string;
	/** The selected custom agent; `undefined` when the user chose the agent's default. */
	readonly agent: ISessionAgentRef | undefined;
}

export interface INewSessionComposerService {
	readonly _serviceBrand: undefined;
	readonly activeComposer: IObservable<INewSessionComposer | undefined>;
	readonly workspaceSelection: IObservable<IWorkspaceSelectionSnapshot | undefined>;
	readonly userWorkspaceSelectionVersion: IObservable<number>;
	notifyUserWorkspaceSelection(): void;
	readonly userNavigationVersion: IObservable<number>;
	readonly inputVersion: IObservable<number>;
	readonly draftInputVersion: IObservable<number>;
	readonly hasDraftInput: boolean | undefined;
	getDraftInputStateForSession(sessionResource: URI | undefined): boolean | undefined;
	hasDraftInputForSession(sessionResource: URI): boolean;
	getComposer(host: ISessionHost, reader?: IReader): INewSessionComposer | undefined;
	notifyUserNavigation(): void;
	readonly onWillSendRequest: Event<{ readonly options: ISendRequestOptions; readonly selection: IWorkspaceSelectionSnapshot | undefined }>;
	notifyWillSendRequest(options: ISendRequestOptions, selection: IWorkspaceSelectionSnapshot | undefined): void;
	/**
	 * Fires as the user selects a custom agent for a session, or clears it, in a picker: not as a picker selects one for a
	 * draft itself, such as the agent it remembers, or as the session's agent binds it under another URI.
	 */
	readonly onDidSelectAgent: Event<IUserAgentSelection>;
	/** Called by a picker before it applies the user's custom agent selection. */
	notifyUserAgentSelection(selection: IUserAgentSelection): void;
	/** Hidden composers retain draft tracking but cannot receive global composer actions. */
	registerComposer(composer: INewSessionComposer, visible?: IObservable<boolean>, host?: ISessionHost): IDisposable;
}

export class NewSessionComposerService extends Disposable implements INewSessionComposerService {
	declare readonly _serviceBrand: undefined;

	private readonly _composers = new Set<INewSessionComposer>();
	private readonly _composerHosts = new Map<INewSessionComposer, ISessionHost>();
	private readonly _visibleComposers = new Set<INewSessionComposer>();
	private readonly _lastFocusedComposerByWindow = new WeakMap<ISessionHost, INewSessionComposer>();
	private readonly _composerSelectionChanged = observableSignal(this);
	private readonly _activeComposer = observableValue<INewSessionComposer | undefined>(this, undefined);
	readonly activeComposer: IObservable<INewSessionComposer | undefined> = this._activeComposer;
	private readonly _userWorkspaceSelectionVersion = observableValue(this, 0);
	readonly userWorkspaceSelectionVersion: IObservable<number> = this._userWorkspaceSelectionVersion;
	private readonly _userNavigationVersion = observableValue(this, 0);
	readonly userNavigationVersion: IObservable<number> = this._userNavigationVersion;
	private readonly _inputVersion = observableValue(this, 0);
	readonly inputVersion: IObservable<number> = this._inputVersion;
	private readonly _draftInputVersion = observableValue(this, 0);
	readonly draftInputVersion: IObservable<number> = this._draftInputVersion;
	private readonly _selectionChanged = derived(this, reader => observableSignalFromEvent(this, this.activeComposer.read(reader)?.onDidChangeWorkspaceSelection ?? Event.None));
	readonly workspaceSelection = derived(this, reader => {
		this._selectionChanged.read(reader).read(reader);
		return this.activeComposer.read(reader)?.workspaceSelection;
	});
	private readonly _onWillSendRequest = this._register(new Emitter<{ readonly options: ISendRequestOptions; readonly selection: IWorkspaceSelectionSnapshot | undefined }>());
	readonly onWillSendRequest = this._onWillSendRequest.event;

	notifyUserWorkspaceSelection(): void {
		this._userWorkspaceSelectionVersion.set(this._userWorkspaceSelectionVersion.get() + 1, undefined);
	}

	notifyUserNavigation(): void {
		this._userNavigationVersion.set(this._userNavigationVersion.get() + 1, undefined);
	}

	private readonly _onDidSelectAgent = this._register(new Emitter<IUserAgentSelection>());
	readonly onDidSelectAgent: Event<IUserAgentSelection> = this._onDidSelectAgent.event;

	notifyUserAgentSelection(selection: IUserAgentSelection): void {
		this._onDidSelectAgent.fire(selection);
	}

	notifyWillSendRequest(options: ISendRequestOptions, selection: IWorkspaceSelectionSnapshot | undefined): void {
		this._onWillSendRequest.fire({ options, selection });
	}

	get hasDraftInput(): boolean | undefined {
		const ready = [...this._composers].filter(composer => composer.isInputReady !== false && composer.hasInput !== undefined);
		return ready.length ? ready.some(composer => composer.hasInput) : undefined;
	}

	getDraftInputStateForSession(sessionResource: URI | undefined): boolean | undefined {
		const ready = [...this._composers].filter(composer => isEqual(composer.sessionResource?.get(), sessionResource)
			&& composer.isInputReady !== false && composer.hasInput !== undefined);
		return ready.length ? ready.some(composer => composer.hasInput) : undefined;
	}

	hasDraftInputForSession(sessionResource: URI): boolean {
		return [...this._composers].some(composer => isEqual(composer.sessionResource?.get(), sessionResource)
			&& (composer.isInputReady === false || composer.hasInput === true));
	}

	getComposer(host: ISessionHost, reader?: IReader): INewSessionComposer | undefined {
		this._composerSelectionChanged.read(reader);
		const windowHost = getWindowHost(host);
		const lastFocused = this._lastFocusedComposerByWindow.get(windowHost);
		if (lastFocused && this._composers.has(lastFocused)) {
			return lastFocused;
		}
		return Array.from(this._composers).findLast(composer => {
			const composerHost = this._composerHosts.get(composer);
			return composerHost && getWindowHost(composerHost) === windowHost;
		});
	}

	registerComposer(composer: INewSessionComposer, visible?: IObservable<boolean>, host?: ISessionHost): IDisposable {
		this._composers.add(composer);
		if (host) {
			this._composerHosts.set(composer, host);
		}
		this._composerSelectionChanged.trigger(undefined);
		const windowHost = host && getWindowHost(host);
		const activate = () => {
			if (this._visibleComposers.has(composer)) {
				this._visibleComposers.delete(composer);
				this._visibleComposers.add(composer);
				this._activeComposer.set(composer, undefined);
			}
		};
		const focus = () => {
			if (windowHost) {
				this._lastFocusedComposerByWindow.set(windowHost, composer);
				this._composerSelectionChanged.trigger(undefined);
			}
			activate();
		};
		const deactivate = () => {
			this._visibleComposers.delete(composer);
			if (this._activeComposer.get() === composer) {
				this._activeComposer.set(Array.from(this._visibleComposers).at(-1), undefined);
			}
		};
		const visibilityListener = autorun(reader => {
			if (visible?.read(reader) ?? true) {
				this._visibleComposers.add(composer);
				activate();
			} else {
				deactivate();
			}
		});
		const focusListener = composer.onDidFocus?.(focus) ?? Disposable.None;
		const inputListener = composer.onDidChangeInput?.(() => {
			this._inputVersion.set(this._inputVersion.get() + 1, undefined);
			if (composer.hasInput) {
				this._draftInputVersion.set(this._draftInputVersion.get() + 1, undefined);
			}
		}) ?? Disposable.None;
		const sessionListener = autorun(reader => {
			composer.sessionResource?.read(reader);
			this._inputVersion.set(this._inputVersion.read(undefined) + 1, undefined);
		});
		return combinedDisposable(visibilityListener, focusListener, inputListener, sessionListener, toDisposable(() => {
			this._composers.delete(composer);
			this._composerHosts.delete(composer);
			if (windowHost && this._lastFocusedComposerByWindow.get(windowHost) === composer) {
				const replacement = Array.from(this._composers).findLast(candidate => {
					const candidateHost = this._composerHosts.get(candidate);
					return candidateHost && getWindowHost(candidateHost) === windowHost;
				});
				if (replacement) {
					this._lastFocusedComposerByWindow.set(windowHost, replacement);
				} else {
					this._lastFocusedComposerByWindow.delete(windowHost);
				}
			}
			this._composerSelectionChanged.trigger(undefined);
			this._inputVersion.set(this._inputVersion.get() + 1, undefined);
			deactivate();
		}));
	}
}
