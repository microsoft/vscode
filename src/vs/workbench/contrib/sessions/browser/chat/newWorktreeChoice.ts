/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { getSessionIsolationProperty, ISessionConfigProperty, isSessionConfigWritable, readSessionIsolation, writeSessionIsolation } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { ISession, isSessionCreated } from '../../../../services/sessions/common/session.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { IWorkspacePickerNewWorktreeOption } from './sessionWorkspacePicker.js';

interface IDraftIsolation {
	readonly provider: IAgentHostSessionsProvider;
	readonly session: ISession;
	readonly chat: URI;
	readonly property: ISessionConfigProperty;
	readonly isolation: string | undefined;
}

interface IDraftChoice {
	/** Whether the user chose New Worktree for the draft. */
	chosen: boolean;
	/**
	 * Whether it set the draft's isolation to its folder by default once: it does not set it again by itself, also where
	 * the agent keeps a new worktree, which then shows as selected. The user's own choice still writes.
	 */
	defaulted: boolean;
	/** The latest of the user's choices for the draft, which alone is undone as the agent rejects it. */
	latestChoice: number;
	/** The latest write to the draft's isolation that the agent has not taken yet: the draft's isolation will be its target. */
	pending: { readonly target: string } | undefined;
}

/**
 * What is known of each draft, as long as the draft lives and across the composers that show it: a composer that sends its
 * drafts in the background and starts new ones keeps nothing of the drafts that went, and a draft shown again, such as as its
 * editor moves to another group, keeps the user's choice.
 */
const draftChoices = new WeakMap<ISession, IDraftChoice>();

/** Fires for a draft as a write to its isolation settles, which changes what the draft shows as selected. */
const onDidSettleDraft = new Emitter<ISession>();

/**
 * New Worktree for a composer restricted to its folders, such as an editor window's: its draft works in a new worktree of
 * the selected folder, through its agent's isolation setting, which its own isolation picker sets in the Agents window.
 * A draft works in its folder unless the user chose New Worktree for it, whatever isolation its agent remembers.
 */
export class NewWorktreeChoice implements IWorkspacePickerNewWorktreeOption {

	/**
	 * @param _enabled Whether the composer is restricted to its folders: none restrict it, and it offers no New Worktree.
	 */
	constructor(
		private readonly _session: IObservable<ISession | undefined>,
		private readonly _enabled: IObservable<boolean>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) { }

	/** Fires as what the current draft shows changes without a change of its configuration: a write settles or is undone. */
	readonly onDidChange: Event<void> = Event.map(Event.filter(onDidSettleDraft.event, session => session === this._session.get()), () => undefined);

	isAvailable(): boolean {
		return !!this._draftIsolation();
	}

	isSelected(): boolean {
		const draft = this._draftIsolation();
		return !!draft && this._isolationOf(draft) === 'worktree';
	}

	setSelected(selected: boolean): void {
		const draft = this._draftIsolation();
		if (!draft) {
			return;
		}
		// The choice is known before the agent takes it: its configuration can change, and apply the default, meanwhile
		const state = this._stateOf(draft.session);
		const wasChosen = state.chosen;
		state.chosen = selected;
		const choice = ++state.latestChoice;
		this._write(draft, state, selected, () => {
			// The agent did not take it: unless the user chose again since, the draft is as before
			if (state.latestChoice === choice) {
				state.chosen = wasChosen;
			}
		});
	}

	/** Makes the current draft work in its folder, once, unless the user chose New Worktree for it. */
	applyDefault(): void {
		const draft = this._draftIsolation();
		if (!draft || this._isolationOf(draft) !== 'worktree') {
			return;
		}
		const state = this._stateOf(draft.session);
		if (!state.chosen && !state.defaulted) {
			state.defaulted = true;
			this._write(draft, state, false);
		}
	}

	private _stateOf(session: ISession): IDraftChoice {
		let state = draftChoices.get(session);
		if (!state) {
			state = { chosen: false, defaulted: false, latestChoice: 0, pending: undefined };
			draftChoices.set(session, state);
		}
		return state;
	}

	/** The isolation the draft has or is about to have: the agent can take a write later than the choice. */
	private _isolationOf(draft: IDraftIsolation): string | undefined {
		return draftChoices.get(draft.session)?.pending?.target ?? draft.isolation;
	}

	private _write(draft: IDraftIsolation, state: IDraftChoice, worktree: boolean, onDidReject?: () => void): void {
		const target = worktree ? 'worktree' : 'folder';
		const value = writeSessionIsolation(draft.property, target);
		if (value === undefined || this._isolationOf(draft) === target) {
			return;
		}
		const operation = draft.provider.setSessionConfigValue(draft.session.sessionId, draft.chat, draft.property.key, value);
		draft.provider.trackSessionConfigOperation(draft.session.sessionId, operation);
		const pending = state.pending = { target };
		const settle = () => {
			if (state.pending === pending) {
				state.pending = undefined;
			}
		};
		operation.then(() => {
			settle();
			onDidSettleDraft.fire(draft.session);
		}, error => {
			settle();
			onDidReject?.();
			onDidSettleDraft.fire(draft.session);
			onUnexpectedError(error);
		});
	}

	/** The isolation of the current draft, when its agent lets it work in a new worktree and the setting can change. */
	private _draftIsolation(): IDraftIsolation | undefined {
		const session = this._session.get();
		if (!this._enabled.get() || !session || isSessionCreated(session) || session.isQuickChat?.get()) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId, session.sessionId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		const values = provider.getCreateSessionConfig(session.sessionId);
		const chat = session.mainChat.get().resource;
		const config = values && provider.getSessionConfig(session.sessionId, chat);
		const property = config && getSessionIsolationProperty(config.schema);
		if (!values || !property || !isSessionConfigWritable(property.schema, true) || writeSessionIsolation(property, 'worktree') === undefined) {
			return undefined;
		}
		return { provider, session, chat, property, isolation: readSessionIsolation(property, values[property.key] ?? property.schema.default) };
	}
}
