/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionCanvas, SessionCanvasAvailability } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionCanvasReference, ISessionCanvasService, ISessionCanvasTarget, SessionCanvasesEnabledSettingId, SessionCanvasInput } from '../common/sessionCanvas.js';

export class SessionCanvasService extends Disposable implements ISessionCanvasService {

	declare readonly _serviceBrand: undefined;
	readonly enabled;

	private readonly _inputs = this._register(new DisposableMap<string, SessionCanvasInput>());
	private readonly _inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _dismissedRevisions = new Map<string, { readonly reference: ISessionCanvasReference; readonly revision: number }>();
	private readonly _presentedRevisions = new Map<string, number>();
	private readonly _programmaticCloses = new Set<string>();

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
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(SessionCanvasesEnabledSettingId)),
		);
		this.enabled = observableFromEvent(this, onDidChangeEnablement, () =>
			!entitlementService.sentiment.hidden
			&& configurationService.getValue<boolean>(SessionCanvasesEnabledSettingId) === true);
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
			const canvases = enabled && supported ? activeChat?.canvases?.read(reader) ?? [] : [];
			const activeKeys = new Set<string>();

			if (activeSession && activeChat && enabled && supported) {
				for (const canvas of canvases) {
					const reference: ISessionCanvasReference = {
						providerId: activeSession.providerId,
						session: activeSession.resource,
						chat: activeChat.resource,
						canvas: canvas.resource,
					};
					const input = this._getOrCreateInput(reference, canvas);
					const key = canvasKey(reference);
					activeKeys.add(key);
					input.setCanvas(canvas);
					if (canvas.availability !== SessionCanvasAvailability.Ready
						|| this._dismissedRevisions.get(key)?.revision === canvas.revision
						|| this._presentedRevisions.get(key) === canvas.revision) {
						continue;
					}
					this._presentedRevisions.set(key, canvas.revision);
					void this.editorService.openEditor(input, { pinned: true, revealIfOpened: true, preserveFocus: false })
						.catch(error => this.logService.error('[SessionCanvasService] Failed to reveal canvas', error));
				}
			}

			if (activeSession && activeChat) {
				for (const [key, dismissed] of this._dismissedRevisions) {
					if (ownsChat(dismissed.reference, activeSession, activeChat) && !activeKeys.has(key)) {
						this._dismissedRevisions.delete(key);
					}
				}
			}

			for (const [key, input] of this._inputs) {
				const ownsActiveChat = !!activeSession && !!activeChat && ownsChat(input.reference, activeSession, activeChat);
				if (!enabled || (ownsActiveChat && !activeKeys.has(key))) {
					void this._closeInput(key, input);
				}
			}
		}));
	}

	getTarget(reference: ISessionCanvasReference, reader?: IReader): ISessionCanvasTarget | undefined {
		const session = this.sessionsService.activeSession.read(reader);
		if (!session || session.providerId !== reference.providerId || !isEqual(session.resource, reference.session)) {
			return undefined;
		}
		const chat = session.activeChat.read(reader);
		if (!isEqual(chat.resource, reference.chat)) {
			return undefined;
		}
		const canvas = chat.canvases?.read(reader).find(candidate => isEqual(candidate.resource, reference.canvas));
		return canvas ? { session, chat, canvas } : undefined;
	}

	isActiveOwner(reference: ISessionCanvasReference, reader?: IReader): boolean {
		return this.enabled.read(reader) && this.getTarget(reference, reader) !== undefined;
	}

	private _getOrCreateInput(reference: ISessionCanvasReference, canvas: ISessionCanvas): SessionCanvasInput {
		const key = canvasKey(reference);
		let input = this._inputs.get(key);
		if (input && !input.isDisposed()) {
			return input;
		}
		input = new SessionCanvasInput(reference, canvas);
		this._inputs.set(key, input);
		const lifetime = new DisposableStore();
		this._inputLifetimes.set(key, lifetime);
		lifetime.add(Event.once(input.onWillDispose)(() => {
			if (!this._programmaticCloses.delete(key)) {
				const revision = input?.canvas.get()?.revision;
				if (revision !== undefined) {
					this._dismissedRevisions.set(key, { reference, revision });
				}
			}
			if (this._inputs.get(key) === input) {
				this._inputs.deleteAndLeak(key);
			}
			if (this._inputLifetimes.get(key) === lifetime) {
				this._inputLifetimes.deleteAndLeak(key);
			}
			this._presentedRevisions.delete(key);
			lifetime.dispose();
		}));
		return input;
	}

	private _removeSession(session: ISession): void {
		for (const [key, dismissed] of this._dismissedRevisions) {
			if (ownsSession(dismissed.reference, session)) {
				this._dismissedRevisions.delete(key);
			}
		}
		for (const [key, input] of this._inputs) {
			if (ownsSession(input.reference, session)) {
				void this._closeInput(key, input);
			}
		}
	}

	private async _closeInput(key: string, input: SessionCanvasInput): Promise<void> {
		if (this._programmaticCloses.has(key)) {
			return;
		}
		this._programmaticCloses.add(key);
		const lifetime = this._inputLifetimes.get(key);
		if (this._inputs.get(key) === input) {
			this._inputs.deleteAndLeak(key);
		}
		if (lifetime && this._inputLifetimes.get(key) === lifetime) {
			this._inputLifetimes.deleteAndLeak(key);
		}
		this._dismissedRevisions.delete(key);
		this._presentedRevisions.delete(key);
		await this.editorService.closeEditors(this.editorService.findEditors(input.resource), { preserveFocus: true });
		if (!input.isDisposed()) {
			input.dispose();
		}
		lifetime?.dispose();
		this._programmaticCloses.delete(key);
	}
}

function canvasKey(reference: ISessionCanvasReference): string {
	return `${reference.providerId}\u0000${reference.session.toString()}\u0000${reference.chat.toString()}\u0000${reference.canvas.toString()}`;
}

function ownsSession(reference: ISessionCanvasReference, session: ISession): boolean {
	return session.providerId === reference.providerId && isEqual(session.resource, reference.session);
}

function ownsChat(reference: ISessionCanvasReference, session: ISession, chat: IChat): boolean {
	return ownsSession(reference, session) && isEqual(chat.resource, reference.chat);
}
