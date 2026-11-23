/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { ActiveChatSessionHost, ChatDraftOutcome, IChatDraftRequest, IChatDraftRequestService, IChatDraftResolution } from '../../common/sessionObserver/chatSessionObserver.js';

/**
 * Drafts (proposed API `chatDraftRequests`): a third pending kind beside Steering and Queued.
 * Drafts live here, per session, outside the model's pending queue: they are never drained,
 * never sent to an agent host's server-side queue, and not persisted across reloads.
 */
export class ChatDraftRequestService extends Disposable implements IChatDraftRequestService {
	declare readonly _serviceBrand: undefined;

	private readonly byId = new Map<string, IChatDraftRequest>();
	private readonly editing = new ResourceMap<IChatDraftRequest>();
	private readonly states = new Map<string, 'shown' | 'hidden' | 'editing'>();

	private readonly _onDidChangeDrafts = this._register(new Emitter<URI>());
	readonly onDidChangeDrafts = this._onDidChangeDrafts.event;
	private readonly _onDidChangeDraftState = this._register(new Emitter<{ draft: IChatDraftRequest; state: 'shown' | 'hidden' | 'editing'; host: ActiveChatSessionHost }>());
	readonly onDidChangeDraftState = this._onDidChangeDraftState.event;
	private readonly _onDidResolveDraft = this._register(new Emitter<IChatDraftResolution>());
	readonly onDidResolveDraft = this._onDidResolveDraft.event;

	setDraft(draft: IChatDraftRequest): void {
		// One draft per session per owner: a new one replaces the owner's previous one there.
		for (const d of [...this.byId.values()]) {
			if (d.owner === draft.owner && d.session.toString() === draft.session.toString() && d.id !== draft.id) {
				this.resolveDraft(d.id, 'expired', { reason: 'superseded' });
			}
		}
		this.byId.set(draft.id, draft);
		this._onDidChangeDrafts.fire(draft.session);
	}

	updateDraft(id: string, patch: Partial<Pick<IChatDraftRequest, 'text' | 'label' | 'detail' | 'warning'>>): void {
		const d = this.byId.get(id);
		if (d) {
			this.byId.set(id, { ...d, ...patch });
			this._onDidChangeDrafts.fire(d.session);
		}
	}

	resolveDraft(id: string, outcome: ChatDraftOutcome, details: { finalText?: string; edited?: boolean; reason?: string; requestId?: string } = {}): void {
		const d = this.byId.get(id) ?? [...this.editing.values()].find(x => x.id === id);
		if (!d) {
			return;
		}
		this.byId.delete(id);
		this.states.delete(id);
		if (this.editing.get(d.session)?.id === id) {
			this.editing.delete(d.session);
		}
		this._onDidChangeDrafts.fire(d.session);
		this._onDidResolveDraft.fire({ draft: d, outcome, edited: !!details.edited, ...(details.finalText !== undefined ? { finalText: details.finalText } : {}), ...(details.reason ? { reason: details.reason } : {}), ...(details.requestId ? { requestId: details.requestId } : {}) });
	}

	getDrafts(session: URI): readonly IChatDraftRequest[] {
		const key = session.toString();
		return [...this.byId.values()].filter(d => d.session.toString() === key);
	}

	getDraft(id: string): IChatDraftRequest | undefined {
		return this.byId.get(id);
	}

	reportDraftState(id: string, state: 'shown' | 'hidden' | 'editing', host: ActiveChatSessionHost): void {
		const d = this.byId.get(id) ?? [...this.editing.values()].find(x => x.id === id);
		if (!d || this.states.get(id) === state) {
			return;
		}
		this.states.set(id, state);
		if (state === 'editing') {
			// The draft moves into the input; it resolves when the user sends from there.
			this.byId.delete(id);
			this.editing.set(d.session, d);
			this._onDidChangeDrafts.fire(d.session);
		}
		this._onDidChangeDraftState.fire({ draft: d, state, host });
	}

	stageForSubmit(id: string): void {
		const d = this.byId.get(id);
		if (d) {
			this.byId.delete(id);
			this.editing.set(d.session, d);
			this._onDidChangeDrafts.fire(d.session);
		}
	}

	editingDraft(session: URI): IChatDraftRequest | undefined {
		return this.editing.get(session);
	}
}
