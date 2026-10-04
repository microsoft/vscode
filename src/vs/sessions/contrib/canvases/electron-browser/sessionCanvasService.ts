/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader, observableFromEvent, observableSignal } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionCanvas } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionCanvasReferenceKey, ISessionCanvasReference, ISessionCanvasReopenTarget, ISessionCanvasService, ISessionCanvasTarget, SessionCanvasInput } from '../common/sessionCanvas.js';

export class SessionCanvasService extends Disposable implements ISessionCanvasService {

	declare readonly _serviceBrand: undefined;
	readonly enabled;
	readonly reopenableCanvases;

	private readonly _inputs = this._register(new DisposableMap<string, SessionCanvasInput>());
	private readonly _inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _dismissed = new Map<string, ISessionCanvasReference>();
	private readonly _presented = new Set<string>();
	private readonly _programmaticCloses = new Set<SessionCanvasInput>();
	private readonly _dismissedChanged = observableSignal(this);

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const onDidChangeEnablement = Event.any(
			entitlementService.onDidChangeSentiment,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CanvasesEnabledSettingId)),
		);
		this.enabled = observableFromEvent(this, onDidChangeEnablement, () =>
			!entitlementService.sentiment.hidden
			&& configurationService.getValue<boolean>(CanvasesEnabledSettingId) === true
		);
		this.reopenableCanvases = derived(this, reader => {
			this._dismissedChanged.read(reader);
			if (!this.enabled.read(reader)) {
				return [];
			}

			const reopenable: ISessionCanvasReopenTarget[] = [];
			for (const reference of this._dismissed.values()) {
				const target = this.getTarget(reference, reader);
				if (target?.canvas.source !== undefined) {
					reopenable.push({ reference, canvas: target.canvas });
				}
			}
			return reopenable;
		});
		this._register(sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this._removeSession(session);
			}
		}));
		this._register(autorun(reader => {
			const enabled = this.enabled.read(reader);
			const activeSession = this.sessionsService.activeSession.read(reader);
			const activeChat = activeSession?.activeChat.read(reader);
			const supported = activeSession?.capabilities.read(reader).supportsCanvases === true;
			const canvases = enabled && supported ? activeChat?.canvases?.read(reader) : undefined;
			const activeKeys = new Set<string>();

			if (activeSession && activeChat && enabled && supported) {
				for (const canvas of canvases ?? []) {
					const reference: ISessionCanvasReference = {
						providerId: activeSession.providerId,
						session: activeSession.resource,
						chat: activeChat.resource,
						canvas: canvas.resource,
					};
					const input = this._getOrCreateInput(reference, canvas);
					const key = getSessionCanvasReferenceKey(reference);
					activeKeys.add(key);
					input.setCanvas(canvas);
					if (canvas.source === undefined || this._dismissed.has(key) || this._presented.has(key)) {
						continue;
					}
					void this._openInput(key, input)
						.catch(error => this.logService.error('[SessionCanvasService] Failed to reveal canvas', error));
				}
			}

			if (activeSession && activeChat && canvases !== undefined) {
				for (const [key, dismissed] of this._dismissed) {
					if (ownsChat(dismissed, activeSession, activeChat) && !activeKeys.has(key)) {
						this._deleteDismissed(key);
					}
				}
			}

			for (const [key, input] of this._inputs) {
				const ownsActiveChat = !!activeSession && !!activeChat && ownsChat(input.reference, activeSession, activeChat);
				if (!enabled || (ownsActiveChat && (!supported || (canvases !== undefined && !activeKeys.has(key))))) {
					void this._closeInput(key, input);
				}
			}
		}));
	}

	getTarget(reference: ISessionCanvasReference, reader?: IReader): ISessionCanvasTarget | undefined {
		const session = this.sessionsService.activeSession.read(reader);
		if (!session || session.capabilities.read(reader).supportsCanvases !== true
			|| session.providerId !== reference.providerId || !isEqual(session.resource, reference.session)) {
			return undefined;
		}
		const chat = session.activeChat.read(reader);
		if (!isEqual(chat.resource, reference.chat)) {
			return undefined;
		}
		const canvas = chat.canvases?.read(reader)?.find(candidate => isEqual(candidate.resource, reference.canvas));
		return canvas ? { session, chat, canvas } : undefined;
	}

	isActiveOwner(reference: ISessionCanvasReference, reader?: IReader): boolean {
		return this.enabled.read(reader) && this.getTarget(reference, reader) !== undefined;
	}

	async reopenCanvas(reference: ISessionCanvasReference): Promise<void> {
		const key = getSessionCanvasReferenceKey(reference);
		const reopenable = this.reopenableCanvases.get().find(candidate => getSessionCanvasReferenceKey(candidate.reference) === key);
		if (!reopenable) {
			return;
		}

		const input = this._getOrCreateInput(reference, reopenable.canvas);
		input.setCanvas(reopenable.canvas);
		this._deleteDismissed(key);
		await this._openInput(key, input);
	}

	private async _openInput(key: string, input: SessionCanvasInput): Promise<void> {
		this._presented.add(key);
		try {
			const pane = await this.editorService.openEditor(input, { pinned: true, revealIfOpened: true, preserveFocus: false });
			const opened = pane || this.editorService.findEditors(input.resource).some(identifier => identifier.editor.matches(input));
			if (!opened) {
				throw new Error('Canvas editor failed to open');
			}
		} catch (error) {
			if (this._inputs.get(key) === input) {
				this._presented.delete(key);
				if (this.enabled.get() && !input.isDisposed()) {
					this._rememberDismissed(key, input.reference);
				}
			}
			throw error;
		}
	}

	private _getOrCreateInput(reference: ISessionCanvasReference, canvas: ISessionCanvas): SessionCanvasInput {
		const key = getSessionCanvasReferenceKey(reference);
		let input = this._inputs.get(key);
		if (input && !input.isDisposed()) {
			return input;
		}
		input = new SessionCanvasInput(reference, canvas);
		this._inputs.set(key, input);
		const lifetime = new DisposableStore();
		this._inputLifetimes.set(key, lifetime);
		lifetime.add(Event.once(input.onWillDispose)(() => {
			const isCurrentInput = this._inputs.get(key) === input;
			if (isCurrentInput && !this._programmaticCloses.delete(input)) {
				this._rememberDismissed(key, reference);
			}
			if (isCurrentInput) {
				this._inputs.deleteAndLeak(key);
			}
			if (this._inputLifetimes.get(key) === lifetime) {
				this._inputLifetimes.deleteAndLeak(key);
			}
			if (isCurrentInput) {
				this._presented.delete(key);
			}
			lifetime.dispose();
		}));
		return input;
	}

	private _removeSession(session: ISession): void {
		for (const [key, dismissed] of this._dismissed) {
			if (ownsSession(dismissed, session)) {
				this._deleteDismissed(key);
			}
		}
		for (const [key, input] of this._inputs) {
			if (ownsSession(input.reference, session)) {
				void this._closeInput(key, input);
			}
		}
	}

	private async _closeInput(key: string, input: SessionCanvasInput): Promise<void> {
		if (this._programmaticCloses.has(input)) {
			return;
		}
		this._programmaticCloses.add(input);
		const lifetime = this._inputLifetimes.get(key);
		if (this._inputs.get(key) === input) {
			this._inputs.deleteAndLeak(key);
		}
		if (lifetime && this._inputLifetimes.get(key) === lifetime) {
			this._inputLifetimes.deleteAndLeak(key);
		}
		this._deleteDismissed(key);
		this._presented.delete(key);
		try {
			await this.editorService.closeEditors(this.editorService.findEditors(input.resource), { preserveFocus: true });
		} finally {
			if (!input.isDisposed()) {
				input.dispose();
			}
			lifetime?.dispose();
			this._programmaticCloses.delete(input);
		}
	}

	private _rememberDismissed(key: string, reference: ISessionCanvasReference): void {
		this._dismissed.delete(key);
		this._dismissed.set(key, reference);
		this._dismissedChanged.trigger(undefined);
	}

	private _deleteDismissed(key: string): void {
		if (this._dismissed.delete(key)) {
			this._dismissedChanged.trigger(undefined);
		}
	}
}

function ownsSession(reference: ISessionCanvasReference, session: ISession): boolean {
	return session.providerId === reference.providerId && isEqual(session.resource, reference.session);
}

function ownsChat(reference: ISessionCanvasReference, session: ISession, chat: IChat): boolean {
	return ownsSession(reference, session) && isEqual(chat.resource, reference.chat);
}
