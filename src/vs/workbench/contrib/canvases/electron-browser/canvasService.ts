/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent, observableSignal, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../browserView/common/browserView.js';
import { CanvasInput, canvasOwnerKey, getCanvasReferenceKey, ICanvas, ICanvasContextService, ICanvasModelResolution, ICanvasOwner, ICanvasReference, ICanvasReopenTarget, ICanvasService, ICanvasWorkingSetOwner, ICanvasWorkingSetState, isCanvasOwner } from '../common/canvas.js';

type CanvasMembershipState =
	| { readonly kind: 'unknown' }
	| { readonly kind: 'hydrating'; readonly canvas: ICanvas }
	| { readonly kind: 'available'; readonly canvas: ICanvas; readonly source: URI }
	| { readonly kind: 'unavailable'; readonly canvas: ICanvas }
	| { readonly kind: 'removed' };

class CanvasPresentation extends Disposable {

	readonly key: string;
	readonly reference: ICanvasReference;
	readonly serializationId: string;
	private _admitted = false;
	private _opened = false;
	private _restoreActive = false;
	private _requestId: string | undefined;
	private _membership: CanvasMembershipState;
	private _canvas: ICanvas | undefined;
	private _model: IBrowserViewModel | undefined;
	private _modelSource: URI | undefined;
	private _modelPromise: { readonly source: URI; readonly value: Promise<IBrowserViewModel> } | undefined;
	private readonly _modelDisposeListener = this._register(new MutableDisposable());
	private _modelGeneration = 0;

	constructor(
		reference: ICanvasReference,
		membership: CanvasMembershipState,
		private readonly browserViewService: IBrowserViewWorkbenchService,
	) {
		super();
		this.key = getCanvasReferenceKey(reference);
		this.reference = reference;
		this.serializationId = generateUuid();
		this._membership = { kind: 'unknown' };
		this.updateMembership(membership);
	}

	get admitted(): boolean {
		return this._admitted;
	}

	get opened(): boolean {
		return this._opened;
	}

	get restoreActive(): boolean {
		return this._restoreActive;
	}

	get requestId(): string | undefined {
		return this._requestId;
	}

	get inputCanvas(): ICanvas | undefined {
		switch (this._membership.kind) {
			case 'available':
			case 'unavailable':
				return this._canvas;
			case 'unknown':
			case 'hydrating':
				return this._canvas && { ...this._canvas, source: undefined };
			case 'removed':
				return undefined;
		}
	}

	get membershipPending(): boolean {
		return this._membership.kind === 'unknown' || this._membership.kind === 'hydrating';
	}

	updateMembership(membership: CanvasMembershipState): void {
		this._membership = membership;
		if (membership.kind === 'available' || membership.kind === 'unavailable') {
			this._updateCanvas(membership.canvas);
		}
	}

	private _updateCanvas(canvas: ICanvas): void {
		const disposeModel = !canvas.source || this._modelSource && !isEqual(this._modelSource, canvas.source);
		this._canvas = canvas;
		if (disposeModel) {
			this._disposeModel();
		}
	}

	acknowledgeRequest(requestId: string | undefined): void {
		this._requestId = requestId;
	}

	markAdmitted(requestId: string | undefined): void {
		this._admitted = true;
		this._opened = true;
		this._restoreActive = false;
		this._requestId = requestId;
	}

	markRestored(): void {
		this._opened = true;
	}

	prepareForSuspension(active: boolean): void {
		this._restoreActive = this._opened && active;
	}

	markSuspended(): void {
		this._opened = false;
	}

	reconcileOpened(opened: boolean): boolean {
		if (!this._opened || opened) {
			return false;
		}
		this._opened = false;
		return true;
	}

	resolveModel(source: URI): Promise<ICanvasModelResolution> {
		if (this._store.isDisposed || this._membership.kind !== 'available' || !isEqual(this._membership.source, source)) {
			return Promise.reject(new CancellationError());
		}
		if (this._model && isEqual(this._modelSource, source)) {
			return Promise.resolve({ model: this._model, reused: true });
		}
		if (this._modelPromise && isEqual(this._modelPromise.source, source)) {
			return this._modelPromise.value.then(model => ({ model, reused: true }));
		}
		this._disposeModel();
		const generation = ++this._modelGeneration;
		const value = this.browserViewService.createExternalBrowserView(source.toString(true), 'canvas', { type: 'agent', sessionId: this.reference.chat.toString() }).then(model => {
			const retained = !this._store.isDisposed
				&& this._modelGeneration === generation
				&& this._membership.kind === 'available'
				&& isEqual(this._membership.source, source);
			if (retained) {
				this._model = model;
				this._modelSource = source;
				this._modelDisposeListener.value = Event.once(model.onWillDispose)(() => {
					if (this._model !== model) {
						return;
					}
					this._model = undefined;
					this._modelSource = undefined;
					this._modelDisposeListener.clear();
					this._modelGeneration++;
				});
			} else {
				model.dispose();
			}
			return model;
		}).finally(() => {
			if (this._modelPromise?.value === value) {
				this._modelPromise = undefined;
			}
		});
		this._modelPromise = { source, value };
		return value.then(model => ({ model, reused: false }));
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._disposeModel();
		super.dispose();
	}

	private _disposeModel(): void {
		this._modelGeneration++;
		this._modelPromise = undefined;
		this._modelDisposeListener.clear();
		const model = this._model;
		this._model = undefined;
		this._modelSource = undefined;
		model?.dispose();
	}
}

const settledWorkingSet: ICanvasWorkingSetState = Object.freeze({ owner: undefined, restoring: false, applying: false });

export class CanvasService extends Disposable implements ICanvasService {

	declare readonly _serviceBrand: undefined;
	readonly enabled;
	readonly reopenableCanvases;

	private readonly inputs = this._register(new DisposableMap<string, CanvasInput>());
	private readonly inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly dismissed = new Map<string, { readonly reference: ICanvasReference; readonly requestId: string | undefined }>();
	private readonly presentations = new Map<string, CanvasPresentation>();
	private readonly presentationsBySerializationId = new Map<string, CanvasPresentation>();
	private readonly requests = new Map<string, string | undefined>();
	private readonly opening = new Map<CanvasInput, { readonly value: Promise<void>; readonly restoreFallback: boolean }>();
	private readonly programmaticCloses = new Set<CanvasInput>();
	private readonly workingSetSuspensions = new Set<CanvasInput>();
	private readonly dismissedChanged = observableSignal(this);
	private readonly presentationsChanged = observableSignal(this);
	private readonly workingSetState: IObservable<ICanvasWorkingSetState>;
	private restoreSettled: DeferredPromise<boolean> | undefined;

	constructor(
		@ICanvasContextService private readonly contextService: ICanvasContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.enabled = observableFromEvent(this, Event.any(
			entitlementService.onDidChangeSentiment,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CanvasesEnabledSettingId)),
		), () => !entitlementService.sentiment.hidden && configurationService.getValue<boolean>(CanvasesEnabledSettingId) === true);
		this.workingSetState = contextService.workingSets?.state ?? constObservable(settledWorkingSet);
		this.reopenableCanvases = derived(this, reader => {
			this.dismissedChanged.read(reader);
			if (!this.enabled.read(reader)) {
				return [];
			}
			const targets: ICanvasReopenTarget[] = [];
			for (const { reference } of this.dismissed.values()) {
				if (!contextService.isOwnerVisible(reference, reader)) {
					continue;
				}
				const context = contextService.contexts.read(reader).find(context => isCanvasOwner(context.owner, reference));
				const canvas = context?.canvases.read(reader)?.find(canvas => isEqual(canvas.resource, reference.canvas));
				if (canvas && getCanvasMembershipState(canvas).kind === 'available') {
					targets.push({ reference, canvas });
				}
			}
			return targets;
		});
		this._register(contextService.onDidRemoveOwner(owner => this.removeOwner(owner)));
		if (contextService.workingSets) {
			this._register(runOnChange(contextService.workingSets.state, state => {
				if (state.applying) {
					this.markPresentedCanvasesForSuspension();
					return;
				}
				if (state.restoring) {
					return;
				}
				this.workingSetSuspensions.clear();
				this.reconcileRestoredPresentations(state.owner);
				this.restoreSettled?.complete(true);
				this.restoreSettled = undefined;
			}));
		}
		this._register(toDisposable(() => this.restoreSettled?.complete(false)));
		this._register(toDisposable(() => {
			this.presentationsBySerializationId.clear();
			for (const presentation of this.presentations.values()) {
				presentation.dispose();
			}
			this.presentations.clear();
		}));
		this._register(autorun(reader => {
			this.presentationsChanged.read(reader);
			const enabled = this.enabled.read(reader);
			const { owner: workingSetOwner, restoring } = this.workingSetState.read(reader);
			const contexts = contextService.contexts.read(reader);
			if (enabled) {
				this.reconcilePresentations(reader);
			}
			const knownOwners = new Set<string>();
			const liveKeys = new Set<string>();
			for (const context of contexts) {
				const canvases = context.canvases.read(reader);
				if (canvases === undefined) {
					continue;
				}
				knownOwners.add(canvasOwnerKey(context.owner));
				const visible = enabled && contextService.isOwnerVisible(context.owner, reader);
				const workingSetPresented = !restoring && (!workingSetOwner || workingSetIncludes(workingSetOwner, context.owner));
				const requests = context.openRequests?.read(reader);
				for (const canvas of canvases) {
					const reference: ICanvasReference = { ...context.owner, canvas: canvas.resource };
					const key = getCanvasReferenceKey(reference);
					liveKeys.add(key);
					const existingInput = this.inputs.get(key);
					const presentation = this.presentations.get(key);
					const membership = getCanvasMembershipState(canvas);
					if (existingInput && presentation) {
						existingInput.setCanvas(presentation.inputCanvas, presentation.membershipPending);
					}
					const request = canvas.instanceId ? requests?.get(canvas.instanceId) : undefined;
					if (request || !this.requests.has(key)) {
						this.requests.set(key, request?.id);
					}
					const requestId = this.requests.get(key);
					const dismissed = this.dismissed.get(key);
					if (!visible || !workingSetPresented || membership.kind !== 'available'
						|| (dismissed && (dismissed.requestId === requestId || !request?.succeeded))
						|| (presentation?.opened && (presentation.requestId === requestId || !request?.succeeded))) {
						continue;
					}
					const input = existingInput ?? this.getOrCreateInput(reference, membership);
					if (this.opening.has(input)) {
						continue;
					}
					this.deleteDismissed(key);
					if (presentation?.opened && request?.succeeded && this.editorService.isVisible(input)) {
						presentation.acknowledgeRequest(requestId);
						continue;
					}
					void this.openInput(key, input, presentation?.admitted === true && !presentation.opened)
						.catch(error => this.reportError('Failed to reveal canvas', error));
				}
			}
			for (const [key, dismissed] of this.dismissed) {
				if (knownOwners.has(canvasOwnerKey(dismissed.reference)) && !liveKeys.has(key)) {
					this.deleteDismissed(key);
					this.requests.delete(key);
				}
			}
			if (!enabled) {
				for (const key of [...this.presentations.keys()]) {
					this.deletePresentation(key);
				}
			}
			for (const key of this.requests.keys()) {
				if (!liveKeys.has(key) && !this.inputs.has(key) && !this.dismissed.has(key) && !this.presentations.has(key)) {
					this.requests.delete(key);
				}
			}
			for (const [key, input] of this.inputs) {
				if (!enabled || (knownOwners.has(canvasOwnerKey(input.reference)) && !liveKeys.has(key))) {
					void this.closeInput(key, input).catch(error => this.reportError('Failed to close canvas', error));
				}
			}
		}));
	}

	isOwnerPresentable(reference: ICanvasReference, reader?: IReader): boolean {
		return this.enabled.read(reader) && this.contextService.isOwnerVisible(reference, reader);
	}

	async revealCanvas(reference: ICanvasReference): Promise<void> {
		if (this.workingSetState.get().restoring && !await this.waitForWorkingSetRestore()) {
			return;
		}
		const context = this.isOwnerPresentable(reference)
			? this.contextService.contexts.get().find(context => isCanvasOwner(context.owner, reference))
			: undefined;
		const canvas = context?.canvases.get()?.find(canvas => isEqual(canvas.resource, reference.canvas));
		if (!canvas) {
			return;
		}
		const key = getCanvasReferenceKey(reference);
		this.deleteDismissed(key);
		const membership = getCanvasMembershipState(canvas);
		if (membership.kind !== 'available') {
			return;
		}
		const input = this.getOrCreateInput(reference, membership);
		await this.openInput(key, input);
	}

	async reopenCanvas(reference: ICanvasReference): Promise<void> {
		if (!this.dismissed.has(getCanvasReferenceKey(reference))) {
			return;
		}
		await this.revealCanvas(reference);
	}

	restoreCanvasInput(serializationId: string): CanvasInput | undefined {
		const presentation = this.presentationsBySerializationId.get(serializationId);
		const { owner, restoring } = this.workingSetState.get();
		if (!presentation?.admitted || !restoring || !owner || !this.enabled.get()
			|| this.dismissed.has(getCanvasReferenceKey(presentation.reference))
			|| !workingSetIncludes(owner, presentation.reference)) {
			return undefined;
		}
		const membership = this.resolveMembership(presentation.reference);
		if (!membership) {
			return undefined;
		}
		if (membership.kind === 'removed') {
			this.removePresentation(presentation);
			return undefined;
		}
		const input = this.getOrCreateInput(presentation.reference, membership);
		input.setSerializationId(serializationId);
		presentation.markRestored();
		return input;
	}

	resolveCanvasModel(reference: ICanvasReference, source: URI): Promise<ICanvasModelResolution> {
		const key = getCanvasReferenceKey(reference);
		const presentation = this.presentations.get(key);
		if (this._store.isDisposed || !presentation) {
			return Promise.reject(new CancellationError());
		}
		return presentation.resolveModel(source);
	}

	private async waitForWorkingSetRestore(): Promise<boolean> {
		while (this.workingSetState.get().restoring) {
			this.restoreSettled ??= new DeferredPromise<boolean>();
			if (!await this.restoreSettled.p) {
				return false;
			}
		}
		return true;
	}

	private openInput(key: string, input: CanvasInput, restoreFallback = false): Promise<void> {
		const pending = this.opening.get(input);
		if (pending) {
			if (!restoreFallback && pending.restoreFallback) {
				return pending.value.then(() => this.openInput(key, input, false));
			}
			return pending.value;
		}
		const opening = this.doOpenInput(key, input, restoreFallback).finally(() => this.opening.delete(input));
		this.opening.set(input, { value: opening, restoreFallback });
		return opening;
	}

	private async doOpenInput(key: string, input: CanvasInput, restoreFallback: boolean): Promise<void> {
		const presentation = this.presentations.get(key);
		if (!presentation) {
			throw new Error(localize('canvas.closed', "This canvas is no longer available."));
		}
		const suppression = restoreFallback ? this.contextService.workingSets?.suppressEditorPartAutoVisibility() : undefined;
		try {
			if (!this.isOwnerPresentable(input.reference)) {
				return;
			}
			const options: IEditorOptions = restoreFallback
				? {
					pinned: true,
					preserveFocus: true,
					inactive: !presentation.restoreActive,
					activation: EditorActivation.PRESERVE,
				}
				: { pinned: true, revealIfOpened: true, preserveFocus: false };
			const group = this.contextService.getEditorGroup(input.reference, input, restoreFallback);
			const pane = this.moveToGroup(input, options, group) ? undefined : await this.editorService.openEditor(input, options, group);
			if (this._store.isDisposed || input.isDisposed() || this.inputs.get(key) !== input || this.presentations.get(key) !== presentation) {
				await this.closeEditors(input);
				return;
			}
			const opened = pane || this.editorService.findEditors(input.resource).some(identifier => !identifier.editor.isDisposed() && identifier.editor.matches(input));
			if (!opened) {
				throw new Error(localize('canvas.openFailed', "Canvas editor failed to open"));
			}
			presentation.markAdmitted(this.requests.get(key));
			input.setSerializationId(presentation.serializationId);
			this.presentationsChanged.trigger(undefined);
			if (!this.isOwnerPresentable(input.reference)) {
				await this.closeInput(key, input, this.contextService.workingSets !== undefined);
			}
		} catch (error) {
			if (this.inputs.get(key) === input && this.presentations.get(key) === presentation) {
				this.deletePresentation(key);
				if (this.enabled.get() && !input.isDisposed()) {
					this.rememberDismissed(key, input.reference);
				}
			}
			throw error;
		} finally {
			suppression?.dispose();
		}
	}

	private getOrCreateInput(reference: ICanvasReference, membership: CanvasMembershipState): CanvasInput {
		const key = getCanvasReferenceKey(reference);
		const presentation = this.getOrCreatePresentation(reference, membership);
		const existing = this.inputs.get(key);
		if (existing && !existing.isDisposed()) {
			existing.setCanvas(presentation.inputCanvas, presentation.membershipPending);
			return existing;
		}
		const input = this.instantiationService.createInstance(CanvasInput, reference, presentation.inputCanvas);
		input.setCanvas(presentation.inputCanvas, presentation.membershipPending);
		if (presentation.admitted) {
			input.setSerializationId(presentation.serializationId);
		}
		this.inputs.set(key, input);
		const lifetime = new DisposableStore();
		this.inputLifetimes.set(key, lifetime);
		if (this.contextService.workingSets) {
			lifetime.add(this.contextService.workingSets.registerEditorToRetain(input));
		}
		lifetime.add(Event.once(input.onWillDispose)(() => {
			const isCurrentInput = this.inputs.get(key) === input;
			const workingSetSuspension = this.workingSetSuspensions.delete(input);
			if (isCurrentInput && !this._store.isDisposed && !this.programmaticCloses.has(input)) {
				const presentation = this.presentations.get(key);
				if (!workingSetSuspension) {
					this.rememberDismissed(key, reference);
					this.deletePresentation(key);
				} else if (presentation?.admitted) {
					presentation.markSuspended();
					this.presentationsChanged.trigger(undefined);
				}
			}
			if (isCurrentInput) {
				this.inputs.deleteAndLeak(key);
			}
			if (this.inputLifetimes.get(key) === lifetime) {
				this.inputLifetimes.deleteAndLeak(key);
			}
			lifetime.dispose();
		}));
		return input;
	}

	private getOrCreatePresentation(reference: ICanvasReference, membership: CanvasMembershipState): CanvasPresentation {
		const key = getCanvasReferenceKey(reference);
		let presentation = this.presentations.get(key);
		if (presentation) {
			presentation.updateMembership(membership);
			return presentation;
		}
		presentation = new CanvasPresentation(reference, membership, this.browserViewService);
		this.presentations.set(presentation.key, presentation);
		this.presentationsBySerializationId.set(presentation.serializationId, presentation);
		return presentation;
	}

	private markPresentedCanvasesForSuspension(): void {
		for (const [key, input] of this.inputs) {
			const presentation = this.presentations.get(key);
			if (presentation) {
				presentation.prepareForSuspension(this.editorService.activeEditor === input);
			}
			this.workingSetSuspensions.add(input);
		}
	}

	private reconcileRestoredPresentations(owner: ICanvasWorkingSetOwner | undefined): void {
		if (!owner) {
			return;
		}
		let changed = false;
		for (const [key, presentation] of this.presentations) {
			if (!presentation.opened || !workingSetIncludes(owner, presentation.reference)) {
				continue;
			}
			const input = this.inputs.get(key);
			const opened = !!input && this.editorService.findEditors(input.resource).some(identifier => identifier.editor === input && !input.isDisposed());
			if (presentation.reconcileOpened(opened)) {
				changed = true;
			}
		}
		if (changed) {
			this.presentationsChanged.trigger(undefined);
		}
	}

	private reconcilePresentations(reader: IReader): void {
		for (const [key, presentation] of this.presentations) {
			const membership = this.resolveMembership(presentation.reference, reader);
			if (!membership) {
				continue;
			}
			const input = this.inputs.get(key);
			if (membership.kind === 'removed') {
				this.removePresentation(presentation);
				continue;
			}
			presentation.updateMembership(membership);
			input?.setCanvas(presentation.inputCanvas, presentation.membershipPending);
		}
	}

	private resolveMembership(reference: ICanvasReference, reader?: IReader): CanvasMembershipState | undefined {
		const canvases = this.contextService.getContext(reference, reader)?.canvases;
		if (!canvases) {
			return undefined;
		}
		const current = canvases.read(reader);
		if (current === undefined) {
			return { kind: 'unknown' };
		}
		const canvas = current.find(candidate => isEqual(candidate.resource, reference.canvas));
		return canvas ? getCanvasMembershipState(canvas) : { kind: 'removed' };
	}

	private removeOwner(owner: ICanvasOwner): void {
		for (const [key, presentation] of this.presentations) {
			if (isCanvasOwner(presentation.reference, owner)) {
				this.deletePresentation(key);
			}
		}
		for (const [key, dismissed] of this.dismissed) {
			if (isCanvasOwner(dismissed.reference, owner)) {
				this.deleteDismissed(key);
				this.requests.delete(key);
			}
		}
		for (const [key, input] of this.inputs) {
			if (isCanvasOwner(input.reference, owner)) {
				void this.closeInput(key, input).catch(error => this.reportError('Failed to close canvas', error));
			}
		}
	}

	private async closeInput(key: string, input: CanvasInput, suspend = false): Promise<void> {
		if (this.programmaticCloses.has(input) || this.inputs.get(key) !== input) {
			return;
		}
		this.workingSetSuspensions.delete(input);
		this.programmaticCloses.add(input);
		this.inputs.deleteAndLeak(key);
		const lifetime = this.inputLifetimes.deleteAndLeak(key);
		this.deleteDismissed(key);
		const presentation = this.presentations.get(key);
		if (suspend && presentation?.admitted) {
			presentation.markSuspended();
			this.presentationsChanged.trigger(undefined);
		} else {
			this.deletePresentation(key);
			this.requests.delete(key);
		}
		try {
			await this.closeEditors(input);
		} finally {
			input.dispose();
			lifetime?.dispose();
			this.programmaticCloses.delete(input);
		}
	}

	/**
	 * Opening into an explicit group does not enforce the singleton capability, so
	 * a canvas that is already open in another group moves instead of duplicating.
	 */
	private moveToGroup(input: CanvasInput, options: IEditorOptions, target: IEditorGroup | undefined): boolean {
		const source = target && this.editorService.findEditors(input.resource).find(identifier => identifier.editor === input && identifier.groupId !== target.id);
		return !!source && !!this.editorGroupsService.getGroup(source.groupId)?.moveEditor(input, target, options);
	}

	private closeEditors(input: CanvasInput): Promise<void> {
		return this.editorService.closeEditors(this.editorService.findEditors(input.resource).filter(editor => editor.editor === input), { preserveFocus: true });
	}

	private removePresentation(presentation: CanvasPresentation): void {
		const input = this.inputs.get(presentation.key);
		this.deleteDismissed(presentation.key);
		if (input) {
			void this.closeInput(presentation.key, input).catch(error => this.reportError('Failed to close canvas', error));
		} else {
			this.deletePresentation(presentation.key);
		}
	}

	private deletePresentation(key: string): void {
		const presentation = this.presentations.get(key);
		if (!presentation) {
			return;
		}
		this.presentations.delete(key);
		if (this.presentationsBySerializationId.get(presentation.serializationId) === presentation) {
			this.presentationsBySerializationId.delete(presentation.serializationId);
		}
		presentation.dispose();
		this.presentationsChanged.trigger(undefined);
	}

	private reportError(message: string, error: Error): void {
		this.logService.error(`[CanvasService] ${message}`, error);
		this.notificationService.error(error);
	}

	private rememberDismissed(key: string, reference: ICanvasReference): void {
		this.dismissed.delete(key);
		this.dismissed.set(key, { reference, requestId: this.requests.get(key) });
		this.dismissedChanged.trigger(undefined);
	}

	private deleteDismissed(key: string): void {
		if (this.dismissed.delete(key)) {
			this.dismissedChanged.trigger(undefined);
		}
	}
}

function getCanvasMembershipState(canvas: ICanvas): CanvasMembershipState {
	if (canvas.instanceId === undefined) {
		return { kind: 'hydrating', canvas };
	}
	if (canvas.source === undefined) {
		return { kind: 'unavailable', canvas };
	}
	return { kind: 'available', canvas, source: canvas.source };
}

function workingSetIncludes(owner: ICanvasWorkingSetOwner, canvasOwner: ICanvasOwner): boolean {
	return isEqual(owner.sessionResource, canvasOwner.session) && (owner.chatResource === undefined || isEqual(owner.chatResource, canvasOwner.chat));
}
