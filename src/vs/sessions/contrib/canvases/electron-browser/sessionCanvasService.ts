/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader, observableFromEvent, observableSignal, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionCanvas } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { editorWorkingSetOwnerIncludes, ISessionEditorWorkingSetOwner, ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { createSessionCanvasReference, getSessionCanvasReferenceKey, ISessionCanvasModelResolution, ISessionCanvasReference, ISessionCanvasReopenTarget, ISessionCanvasService, ISessionCanvasTarget, SessionCanvasInput } from '../common/sessionCanvas.js';

interface ICanvasPresentation {
	readonly reference: ISessionCanvasReference;
	readonly serializationId: string;
	admitted: boolean;
	opened: boolean;
	restoreActive: boolean;
	canvas: ISessionCanvas | undefined;
	model: IBrowserViewModel | undefined;
	modelSource: URI | undefined;
	modelPromise: { readonly source: URI; readonly value: Promise<IBrowserViewModel> } | undefined;
	modelDisposeListener: IDisposable | undefined;
	modelGeneration: number;
}

interface ICanvasLookup {
	readonly known: boolean;
	readonly canvas: ISessionCanvas | undefined;
}

export class SessionCanvasService extends Disposable implements ISessionCanvasService {

	declare readonly _serviceBrand: undefined;
	readonly enabled;
	readonly reopenableCanvases;

	private readonly _inputs = this._register(new DisposableMap<string, SessionCanvasInput>());
	private readonly _inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _dismissed = new Map<string, ISessionCanvasReference>();
	private readonly _presentations = new Map<string, ICanvasPresentation>();
	private readonly _presentationsBySerializationId = new Map<string, ICanvasPresentation>();
	private readonly _opening = new Map<SessionCanvasInput, { readonly value: Promise<void>; readonly restoreFallback: boolean }>();
	private readonly _programmaticCloses = new Set<SessionCanvasInput>();
	private readonly _workingSetSuspensions = new Set<SessionCanvasInput>();
	private readonly _dismissedChanged = observableSignal(this);
	private readonly _presentationsChanged = observableSignal(this);
	private _restoreSettled: DeferredPromise<boolean> | undefined;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
		@ISessionEditorWorkingSetService private readonly editorWorkingSetService: ISessionEditorWorkingSetService,
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
			const archived = event.changed.filter(session => session.isArchived.read(undefined));
			for (const session of [...event.removed, ...archived]) {
				this._removeSession(session);
			}
		}));
		this._register(sessionsManagementService.onDidDeleteChat(({ session, chatResource }) => {
			this._removePresentations(reference => ownsSession(reference, session) && isEqual(reference.chat, chatResource));
		}));
		this._register(runOnChange(this.editorWorkingSetService.restoreState, state => {
			if (state.applying) {
				this._markPresentedCanvasesForSuspension();
				return;
			}
			if (state.restoring) {
				return;
			}
			this._workingSetSuspensions.clear();
			this._reconcileRestoredPresentations(state.owner);
			this._restoreSettled?.complete(true);
			this._restoreSettled = undefined;
		}));
		this._register(toDisposable(() => this._restoreSettled?.complete(false)));
		this._register(toDisposable(() => {
			for (const presentation of this._presentations.values()) {
				this._disposePresentationModel(presentation);
			}
		}));
		this._register(autorun(reader => {
			this._presentationsChanged.read(reader);
			const enabled = this.enabled.read(reader);
			const { owner, restoring } = this.editorWorkingSetService.restoreState.read(reader);
			const activeSession = this.sessionsService.activeSession.read(reader);
			const activeChat = activeSession?.activeChat.read(reader);
			const supported = activeSession?.capabilities.read(reader).supportsCanvases === true;
			const canvases = enabled && supported ? activeChat?.canvases?.read(reader) : undefined;
			const activeKeys = new Set<string>();

			if (enabled && activeSession) {
				this._reconcilePresentations(activeSession, reader);
			}

			if (activeSession && activeChat && enabled && supported) {
				const workingSetPresented = !restoring && (!owner || editorWorkingSetOwnerIncludes(owner, activeSession.resource, activeChat.resource));
				for (const canvas of canvases ?? []) {
					const reference = createSessionCanvasReference(activeSession, activeChat, canvas);
					const key = getSessionCanvasReferenceKey(reference);
					activeKeys.add(key);
					const existingInput = this._inputs.get(key);
					const presentation = this._presentations.get(key);
					const membershipPending = canvas.instanceId === undefined;
					existingInput?.setCanvas(
						membershipPending && presentation?.canvas
							? { ...presentation.canvas, source: undefined }
							: canvas,
						membershipPending,
					);
					if (!workingSetPresented || canvas.source === undefined || this._dismissed.has(key)) {
						continue;
					}
					const input = existingInput ?? this._getOrCreateInput(reference, canvas);
					if (presentation?.opened || this._opening.has(input)) {
						continue;
					}
					void this._openInput(key, input, presentation?.admitted === true)
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

			if (!enabled) {
				for (const key of [...this._presentations.keys()]) {
					this._deletePresentation(key);
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
		const session = this.sessionsService.activeSession.read(reader);
		return this.enabled.read(reader)
			&& session?.capabilities.read(reader).supportsCanvases === true
			&& ownsSession(reference, session)
			&& isEqual(session.activeChat.read(reader).resource, reference.chat);
	}

	async revealCanvas(reference: ISessionCanvasReference): Promise<void> {
		if (this.editorWorkingSetService.restoreState.get().restoring && !await this._waitForWorkingSetRestore()) {
			return;
		}
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

	restoreCanvasInput(serializationId: string): SessionCanvasInput | undefined {
		const presentation = this._presentationsBySerializationId.get(serializationId);
		const { owner, restoring } = this.editorWorkingSetService.restoreState.get();
		const session = this.sessionsService.activeSession.get();
		if (!presentation?.admitted || !restoring || !owner || !this.enabled.get() || this._dismissed.has(getSessionCanvasReferenceKey(presentation.reference))
			|| !session || session.capabilities.get().supportsCanvases !== true
			|| !ownsSession(presentation.reference, session)
			|| !editorWorkingSetOwnerIncludes(owner, presentation.reference.session, presentation.reference.chat)) {
			return undefined;
		}

		const lookup = this._lookupCanvas(presentation.reference, session);
		if (lookup.known && !lookup.canvas) {
			this._removePresentation(presentation);
			return undefined;
		}

		const membershipPending = !lookup.known || lookup.canvas?.instanceId === undefined;
		const canvas = membershipPending
			? presentation.canvas && { ...presentation.canvas, source: undefined }
			: lookup.canvas;
		const input = this._getOrCreateInput(presentation.reference, canvas, membershipPending);
		input.setCanvas(canvas, membershipPending);
		input.setSerializationId(serializationId);
		presentation.opened = true;
		return input;
	}

	resolveCanvasModel(reference: ISessionCanvasReference, source: URI): Promise<ISessionCanvasModelResolution> {
		const key = getSessionCanvasReferenceKey(reference);
		const presentation = this._presentations.get(key);
		if (this._store.isDisposed || !presentation || !isEqual(presentation.canvas?.source, source)) {
			return Promise.reject(new CancellationError());
		}
		if (presentation.model && isEqual(presentation.modelSource, source)) {
			return Promise.resolve({ model: presentation.model, reused: true });
		}
		if (presentation.modelPromise && isEqual(presentation.modelPromise.source, source)) {
			return presentation.modelPromise.value.then(model => ({ model, reused: true }));
		}
		this._disposePresentationModel(presentation);
		const generation = ++presentation.modelGeneration;
		const value = this.browserViewService.createExternalBrowserView(source.toString(true), 'canvas').then(model => {
			const retained = this._presentations.get(key) === presentation
				&& presentation.modelGeneration === generation
				&& isEqual(presentation.canvas?.source, source);
			if (retained) {
				presentation.model = model;
				presentation.modelSource = source;
				presentation.modelDisposeListener = Event.once(model.onWillDispose)(() => {
					if (presentation.model !== model) {
						return;
					}
					presentation.model = undefined;
					presentation.modelSource = undefined;
					presentation.modelDisposeListener = undefined;
					presentation.modelGeneration++;
				});
			} else {
				model.dispose();
			}
			return model;
		}).finally(() => {
			if (presentation.modelPromise?.value === value) {
				presentation.modelPromise = undefined;
			}
		});
		presentation.modelPromise = { source, value };
		return value.then(model => ({ model, reused: false }));
	}

	private async _waitForWorkingSetRestore(): Promise<boolean> {
		while (this.editorWorkingSetService.restoreState.get().restoring) {
			this._restoreSettled ??= new DeferredPromise<boolean>();
			if (!await this._restoreSettled.p) {
				return false;
			}
		}
		return true;
	}

	private _openInput(key: string, input: SessionCanvasInput, restoreFallback = false): Promise<void> {
		const pending = this._opening.get(input);
		if (pending) {
			if (!restoreFallback && pending.restoreFallback) {
				return pending.value.then(() => this._openInput(key, input, false));
			}
			return pending.value;
		}
		const opening = this._doOpenInput(key, input, restoreFallback).finally(() => this._opening.delete(input));
		this._opening.set(input, { value: opening, restoreFallback });
		return opening;
	}

	private async _doOpenInput(key: string, input: SessionCanvasInput, restoreFallback: boolean): Promise<void> {
		const presentation = this._getOrCreatePresentation(input.reference, input.canvas.get());
		const suppression = restoreFallback ? this.layoutService.suppressEditorPartAutoVisibility() : undefined;
		try {
			const options: IEditorOptions = restoreFallback
				? {
					pinned: true,
					preserveFocus: true,
					inactive: !presentation.restoreActive,
					activation: EditorActivation.PRESERVE,
				}
				: { pinned: true, revealIfOpened: true, preserveFocus: false };
			const group = restoreFallback ? this.editorGroupsService.mainPart.activeGroup.id : undefined;
			const pane = await this.editorService.openEditor(input, options, group);
			const opened = pane || this.editorService.findEditors(input.resource).some(identifier => !identifier.editor.isDisposed() && identifier.editor.matches(input));
			if (!opened) {
				throw new Error('Canvas editor failed to open');
			}
			if (this._inputs.get(key) !== input || input.isDisposed() || this._presentations.get(key) !== presentation) {
				return;
			}
			presentation.admitted = true;
			presentation.opened = true;
			presentation.restoreActive = false;
			input.setSerializationId(presentation.serializationId);
			this._presentationsChanged.trigger(undefined);
			if (!this.isActiveOwner(input.reference)) {
				await this._closeInput(key, input, true);
			}
		} catch (error) {
			if (this._inputs.get(key) === input && this._presentations.get(key) === presentation) {
				this._deletePresentation(key);
				if (this.enabled.get() && !input.isDisposed()) {
					this._rememberDismissed(key, input.reference);
				}
			}
			throw error;
		} finally {
			suppression?.dispose();
		}
	}

	private _getOrCreateInput(reference: ISessionCanvasReference, canvas: ISessionCanvas | undefined, membershipPending = false): SessionCanvasInput {
		const key = getSessionCanvasReferenceKey(reference);
		const presentation = this._getOrCreatePresentation(reference, membershipPending ? undefined : canvas);
		let input = this._inputs.get(key);
		if (input && !input.isDisposed()) {
			return input;
		}
		input = new SessionCanvasInput(reference, canvas, membershipPending);
		if (presentation.admitted) {
			input.setSerializationId(presentation.serializationId);
		}
		this._inputs.set(key, input);
		const lifetime = new DisposableStore();
		this._inputLifetimes.set(key, lifetime);
		lifetime.add(this.editorWorkingSetService.registerEditorToRetain(input));
		lifetime.add(Event.once(input.onWillDispose)(() => {
			const isCurrentInput = this._inputs.get(key) === input;
			const workingSetSuspension = this._workingSetSuspensions.delete(input);
			const programmaticClose = this._programmaticCloses.delete(input);
			if (isCurrentInput) {
				if (workingSetSuspension) {
					const presentation = this._presentations.get(key);
					if (presentation?.admitted) {
						presentation.opened = false;
						this._presentationsChanged.trigger(undefined);
					}
				} else if (!programmaticClose) {
					this._rememberDismissed(key, reference);
					this._deletePresentation(key);
				}
			}
			if (isCurrentInput) {
				this._inputs.deleteAndLeak(key);
			}
			if (this._inputLifetimes.get(key) === lifetime) {
				this._inputLifetimes.deleteAndLeak(key);
			}
			lifetime.dispose();
		}));
		return input;
	}

	private _getOrCreatePresentation(reference: ISessionCanvasReference, canvas?: ISessionCanvas): ICanvasPresentation {
		const key = getSessionCanvasReferenceKey(reference);
		let presentation = this._presentations.get(key);
		if (presentation) {
			if (canvas) {
				this._setPresentationCanvas(presentation, canvas);
			}
			return presentation;
		}
		presentation = {
			reference,
			serializationId: generateUuid(),
			admitted: false,
			opened: false,
			restoreActive: false,
			canvas,
			model: undefined,
			modelSource: undefined,
			modelPromise: undefined,
			modelDisposeListener: undefined,
			modelGeneration: 0,
		};
		this._presentations.set(key, presentation);
		this._presentationsBySerializationId.set(presentation.serializationId, presentation);
		return presentation;
	}

	private _markPresentedCanvasesForSuspension(): void {
		for (const [key, input] of this._inputs) {
			const presentation = this._presentations.get(key);
			if (presentation) {
				presentation.restoreActive = presentation.opened && this.editorService.activeEditor === input;
			}
			this._workingSetSuspensions.add(input);
		}
	}

	private _reconcileRestoredPresentations(owner: ISessionEditorWorkingSetOwner | undefined): void {
		if (!owner) {
			return;
		}
		let changed = false;
		for (const [key, presentation] of this._presentations) {
			if (!presentation.opened || !editorWorkingSetOwnerIncludes(owner, presentation.reference.session, presentation.reference.chat)) {
				continue;
			}
			const input = this._inputs.get(key);
			const opened = !!input && this.editorService.findEditors(input.resource).some(identifier => identifier.editor === input && !input.isDisposed());
			if (!opened) {
				presentation.opened = false;
				changed = true;
			}
		}
		if (changed) {
			this._presentationsChanged.trigger(undefined);
		}
	}

	private _reconcilePresentations(session: IActiveSession, reader: IReader): void {
		for (const [key, presentation] of this._presentations) {
			if (!ownsSession(presentation.reference, session)) {
				continue;
			}
			const lookup = this._lookupCanvas(presentation.reference, session, reader);
			const input = this._inputs.get(key);
			if (!lookup.known || lookup.canvas?.instanceId === undefined) {
				input?.setCanvas(presentation.canvas && { ...presentation.canvas, source: undefined }, true);
				continue;
			}
			if (!lookup.canvas) {
				this._deleteDismissed(key);
				if (input) {
					void this._closeInput(key, input).catch(error => this.logService.error('[SessionCanvasService] Failed to close removed canvas', error));
				} else {
					this._deletePresentation(key);
				}
				continue;
			}
			this._setPresentationCanvas(presentation, lookup.canvas);
			input?.setCanvas(lookup.canvas, false);
		}
	}

	private _lookupCanvas(reference: ISessionCanvasReference, session: IActiveSession, reader?: IReader): ICanvasLookup {
		const activeChat = session.activeChat.read(reader);
		const chat = isEqual(activeChat.resource, reference.chat)
			? activeChat
			: session.chats.read(reader).find(candidate => isEqual(candidate.resource, reference.chat));
		if (!chat) {
			return { known: false, canvas: undefined };
		}
		const canvases = chat.canvases?.read(reader);
		if (canvases === undefined) {
			return { known: false, canvas: undefined };
		}
		return {
			known: true,
			canvas: canvases.find(candidate => isEqual(candidate.resource, reference.canvas)),
		};
	}

	private _removeSession(session: ISession): void {
		this._removePresentations(reference => ownsSession(reference, session));
	}

	private _removePresentations(owns: (reference: ISessionCanvasReference) => boolean): void {
		for (const [key, presentation] of this._presentations) {
			if (owns(presentation.reference)) {
				this._deletePresentation(key);
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
		this._workingSetSuspensions.delete(input);
		this._programmaticCloses.add(input);
		const lifetime = this._inputLifetimes.get(key);
		if (this._inputs.get(key) === input) {
			this._inputs.deleteAndLeak(key);
			if (lifetime) {
				this._inputLifetimes.deleteAndLeak(key);
			}
			this._deleteDismissed(key);
			const presentation = this._presentations.get(key);
			if (suspend && presentation?.admitted) {
				presentation.opened = false;
				this._presentationsChanged.trigger(undefined);
			} else {
				this._deletePresentation(key);
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

	private _removePresentation(presentation: ICanvasPresentation): void {
		const key = getSessionCanvasReferenceKey(presentation.reference);
		const input = this._inputs.get(key);
		this._deleteDismissed(key);
		if (input) {
			void this._closeInput(key, input).catch(error => this.logService.error('[SessionCanvasService] Failed to close invalid canvas', error));
		} else {
			this._deletePresentation(key);
		}
	}

	private _deletePresentation(key: string): void {
		const presentation = this._presentations.get(key);
		if (!presentation) {
			return;
		}
		this._presentations.delete(key);
		if (this._presentationsBySerializationId.get(presentation.serializationId) === presentation) {
			this._presentationsBySerializationId.delete(presentation.serializationId);
		}
		this._disposePresentationModel(presentation);
		this._presentationsChanged.trigger(undefined);
	}

	private _setPresentationCanvas(presentation: ICanvasPresentation, canvas: ISessionCanvas): void {
		const disposeModel = !canvas.source || presentation.modelSource && !isEqual(presentation.modelSource, canvas.source);
		presentation.canvas = canvas;
		if (disposeModel) {
			this._disposePresentationModel(presentation);
		}
	}

	private _disposePresentationModel(presentation: ICanvasPresentation): void {
		presentation.modelGeneration++;
		presentation.modelPromise = undefined;
		presentation.modelDisposeListener?.dispose();
		presentation.modelDisposeListener = undefined;
		const model = presentation.model;
		presentation.model = undefined;
		presentation.modelSource = undefined;
		model?.dispose();
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
