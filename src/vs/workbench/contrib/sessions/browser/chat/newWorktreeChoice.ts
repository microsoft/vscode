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
		const draft = this._select(selected);
		if (draft && selected) {
			this._chosen.add(draft.session.sessionId);
		} else if (draft) {
			this._chosen.delete(draft.session.sessionId);
		}
	}

	/** Makes the current draft work in its folder, unless the user chose New Worktree for it. */
	applyDefault(): void {
		const draft = this._draftIsolation();
		if (draft?.isolation === 'worktree' && !this._chosen.has(draft.session.sessionId)) {
			this._select(false);
		}
	}

	private _select(selected: boolean): IDraftIsolation | undefined {
		const draft = this._draftIsolation();
		const value = draft && writeSessionIsolation(draft.property, selected ? 'worktree' : 'folder');
		if (draft && value !== undefined && draft.isolation !== (selected ? 'worktree' : 'folder')) {
			const operation = draft.provider.setSessionConfigValue(draft.session.sessionId, draft.chat, draft.property.key, value);
			draft.provider.trackSessionConfigOperation(draft.session.sessionId, operation);
			operation.catch(onUnexpectedError);
		}
		return draft;
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
