/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
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

/**
 * New Worktree for a composer restricted to its folders, such as an editor window's: its draft works in a new worktree of
 * the selected folder, through its agent's isolation setting, which its own isolation picker sets in the Agents window.
 * A draft works in its folder unless the user chose New Worktree for it, whatever isolation its agent remembers.
 */
export class NewWorktreeChoice implements IWorkspacePickerNewWorktreeOption {

	/** The drafts the user chose New Worktree for. */
	private readonly _chosen = new Set<string>();
	/**
	 * The drafts whose isolation it set to their folder by default once: it does not set it again by itself, also where
	 * the agent keeps a new worktree, which then shows as selected. The user's own choice still writes.
	 */
	private readonly _defaulted = new Set<string>();
	/** The latest of the user's choices per draft, which alone is undone as the agent rejects it. */
	private readonly _latestChoice = new Map<string, number>();
	private _choices = 0;

	constructor(
		private readonly _session: IObservable<ISession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) { }

	isAvailable(): boolean {
		return !!this._draftIsolation();
	}

	isSelected(): boolean {
		return this._draftIsolation()?.isolation === 'worktree';
	}

	setSelected(selected: boolean): void {
		const draft = this._draftIsolation();
		if (!draft) {
			return;
		}
		// The choice is known before the agent takes it: its configuration can change, and apply the default, meanwhile
		const sessionId = draft.session.sessionId;
		const wasChosen = this._chosen.has(sessionId);
		if (selected) {
			this._chosen.add(sessionId);
		} else {
			this._chosen.delete(sessionId);
		}
		const choice = ++this._choices;
		this._latestChoice.set(sessionId, choice);
		this._write(draft, selected, () => {
			// The agent did not take it: unless the user chose again since, the draft is as before
			if (this._latestChoice.get(sessionId) === choice) {
				if (wasChosen) {
					this._chosen.add(sessionId);
				} else {
					this._chosen.delete(sessionId);
				}
			}
		});
	}

	/** Makes the current draft work in its folder, once, unless the user chose New Worktree for it. */
	applyDefault(): void {
		const draft = this._draftIsolation();
		const sessionId = draft?.session.sessionId;
		if (draft && sessionId && draft.isolation === 'worktree' && !this._chosen.has(sessionId) && !this._defaulted.has(sessionId)) {
			this._defaulted.add(sessionId);
			this._write(draft, false);
		}
	}

	private _write(draft: IDraftIsolation, worktree: boolean, onDidReject?: () => void): void {
		const value = writeSessionIsolation(draft.property, worktree ? 'worktree' : 'folder');
		if (value === undefined || draft.isolation === (worktree ? 'worktree' : 'folder')) {
			return;
		}
		const operation = draft.provider.setSessionConfigValue(draft.session.sessionId, draft.chat, draft.property.key, value);
		draft.provider.trackSessionConfigOperation(draft.session.sessionId, operation);
		operation.catch(error => {
			onDidReject?.();
			onUnexpectedError(error);
		});
	}

	/** The isolation of the current draft, when its agent lets it work in a new worktree and the setting can change. */
	private _draftIsolation(): IDraftIsolation | undefined {
		const session = this._session.get();
		if (!session || isSessionCreated(session) || session.isQuickChat?.get()) {
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
