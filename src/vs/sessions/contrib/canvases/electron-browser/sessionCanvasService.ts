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
import { createSessionCanvasReference, getSessionCanvasReferenceKey, ISessionCanvasReference, ISessionCanvasReopenTarget, ISessionCanvasService, ISessionCanvasTarget, SessionCanvasInput, SessionCanvasWorkingSetResume } from '../common/sessionCanvas.js';

interface ICanvasPresentation {
	readonly reference: ISessionCanvasReference;
	opened: boolean;
}

export class SessionCanvasService extends Disposable implements ISessionCanvasService {

	declare readonly _serviceBrand: undefined;
	readonly enabled;
	readonly reopenableCanvases;

	private readonly _inputs = this._register(new DisposableMap<string, SessionCanvasInput>());
	private readonly _inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _dismissed = new Map<string, ISessionCanvasReference>();
	private readonly _presented = new Map<string, ICanvasPresentation>();
	private readonly _opening = new Map<SessionCanvasInput, Promise<void>>();
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
			for (const session of [...event.removed, ...event.changed.filter(session => session.isArchived.get())]) {
				this._removeSession(session);
			}
		}));
		this._register(sessionsManagementService.onDidDeleteChat(({ session, chatResource }) => {
			this._removePresentations(reference => ownsSession(reference, session) && isEqual(reference.chat, chatResource));
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
					const reference = createSessionCanvasReference(activeSession, activeChat, canvas);
					const input = this._getOrCreateInput(reference, canvas);
					const key = getSessionCanvasReferenceKey(reference);
					activeKeys.add(key);
					input.setCanvas(canvas);
					if (canvas.source === undefined || this._dismissed.has(key) || this._presented.get(key)?.opened || this._opening.has(input)) {
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

			for (const [key, presentation] of this._presented) {
				if (!enabled || (activeSession && activeChat && ownsChat(presentation.reference, activeSession, activeChat)
					&& (!supported || (canvases !== undefined && !activeKeys.has(key))))) {
					this._presented.delete(key);
				}
			}

			for (const [key, input] of this._inputs) {
				const ownsActiveChat = !!activeSession && !!activeChat && ownsChat(input.reference, activeSession, activeChat);
				if (!enabled || (ownsActiveChat && (!supported || (canvases !== undefined && !activeKeys.has(key))))) {
					void this._closeInput(key, input).catch(error => this.logService.error('[SessionCanvasService] Failed to close canvas', error));
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

	async revealCanvas(reference: ISessionCanvasReference): Promise<void> {
		const target = this.enabled.get() ? this.getTarget(reference) : undefined;
		if (target?.canvas.source === undefined) {
			return;
		}

		const key = getSessionCanvasReferenceKey(reference);
		const input = this._getOrCreateInput(reference, target.canvas);
		input.setCanvas(target.canvas);
		this._deleteDismissed(key);
		await this._openInput(key, input);
	}

	async reopenCanvas(reference: ISessionCanvasReference): Promise<void> {
		const key = getSessionCanvasReferenceKey(reference);
		if (!this._dismissed.has(key)) {
			return;
		}
		await this.revealCanvas(reference);
	}

	restoreCanvasInput(reference: ISessionCanvasReference): SessionCanvasInput | undefined {
		const key = getSessionCanvasReferenceKey(reference);
		const session = this.sessionsService.activeSession.get();
		if (this._store.isDisposed || !this.enabled.get() || !this._presented.get(key)?.opened || this._dismissed.has(key)
			|| !session || session.capabilities.get().supportsCanvases !== true
			|| !ownsChat(reference, session, session.activeChat.get())) {
			return undefined;
		}
		const canvases = session.activeChat.get().canvases?.get();
		const canvas = canvases?.find(candidate => isEqual(candidate.resource, reference.canvas));
		if (canvases !== undefined && !canvas) {
			return undefined;
		}
		const input = this._getOrCreateInput(reference, canvas);
		input.setCanvas(canvas);
		return input;
	}

	private _openInput(key: string, input: SessionCanvasInput, preserveFocus = false): Promise<void> {
		const pending = this._opening.get(input);
		if (pending) {
			return pending;
		}
		const opening = this._doOpenInput(key, input, preserveFocus).finally(() => this._opening.delete(input));
		this._opening.set(input, opening);
		return opening;
	}

	private async _doOpenInput(key: string, input: SessionCanvasInput, preserveFocus: boolean): Promise<void> {
		const presentation = this._presented.get(key) ?? { reference: input.reference, opened: false };
		this._presented.set(key, presentation);
		try {
			const pane = await this.editorService.openEditor(input, { pinned: true, revealIfOpened: true, preserveFocus });
			const opened = pane || this.editorService.findEditors(input.resource).some(identifier => !identifier.editor.isDisposed() && identifier.editor.matches(input));
			if (!opened) {
				throw new Error('Canvas editor failed to open');
			}
			if (this._inputs.get(key) !== input || input.isDisposed()) {
				return;
			}
			presentation.opened = true;
			if (!this.isActiveOwner(input.reference)) {
				await this._closeInput(key, input, true);
			}
		} catch (error) {
			if (this._inputs.get(key) === input && this._presented.get(key) === presentation) {
				this._presented.delete(key);
				if (this.enabled.get() && !input.isDisposed()) {
					this._rememberDismissed(key, input.reference);
				}
			}
			throw error;
		}
	}

	private _getOrCreateInput(reference: ISessionCanvasReference, canvas: ISessionCanvas | undefined): SessionCanvasInput {
		const key = getSessionCanvasReferenceKey(reference);
		let input = this._inputs.get(key);
		if (input && !input.isDisposed()) {
			return input;
		}
		input = new SessionCanvasInput(reference, canvas, input => this._suspendInput(key, input));
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

	private async _suspendInput(key: string, input: SessionCanvasInput): Promise<SessionCanvasWorkingSetResume | undefined> {
		if (this._inputs.get(key) !== input || input.isDisposed()) {
			return undefined;
		}
		const presentation = this._presented.get(key);
		await this._closeInput(key, input, true);
		return presentation ? () => this._resumePresentation(key, presentation) : undefined;
	}

	private async _resumePresentation(key: string, presentation: ICanvasPresentation): Promise<void> {
		if (this._store.isDisposed || !this.enabled.get() || this._presented.get(key) !== presentation || this._dismissed.has(key)) {
			return;
		}
		const target = this.getTarget(presentation.reference);
		if (target?.canvas.source === undefined) {
			return;
		}
		const input = this._getOrCreateInput(presentation.reference, target.canvas);
		input.setCanvas(target.canvas);
		if (this.editorService.findEditors(input.resource).some(identifier => identifier.editor === input && !input.isDisposed())) {
			return;
		}
		await this._openInput(key, input, true);
	}

	private _removeSession(session: ISession): void {
		this._removePresentations(reference => ownsSession(reference, session));
	}

	private _removePresentations(owns: (reference: ISessionCanvasReference) => boolean): void {
		for (const [key, presentation] of this._presented) {
			if (owns(presentation.reference)) {
				this._presented.delete(key);
			}
		}
		for (const [key, dismissed] of this._dismissed) {
			if (owns(dismissed)) {
				this._deleteDismissed(key);
			}
		}
		for (const [key, input] of this._inputs) {
			if (owns(input.reference)) {
				void this._closeInput(key, input).catch(error => this.logService.error('[SessionCanvasService] Failed to close canvas', error));
			}
		}
	}

	private async _closeInput(key: string, input: SessionCanvasInput, suspend = false): Promise<void> {
		if (this._programmaticCloses.has(input) || this._inputs.get(key) !== input) {
			return;
		}
		this._programmaticCloses.add(input);
		const lifetime = this._inputLifetimes.get(key);
		if (this._inputs.get(key) === input) {
			this._inputs.deleteAndLeak(key);
			if (lifetime) {
				this._inputLifetimes.deleteAndLeak(key);
			}
			this._deleteDismissed(key);
			if (!suspend) {
				this._presented.delete(key);
			}
		}
		try {
			await this.editorService.closeEditors(
				this.editorService.findEditors(input.resource).filter(identifier => identifier.editor === input),
				{ preserveFocus: true },
			);
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
