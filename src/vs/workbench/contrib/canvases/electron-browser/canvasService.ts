/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
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

interface ICanvasPresentation {
	readonly reference: ICanvasReference;
	readonly serializationId: string;
	admitted: boolean;
	opened: boolean;
	restoreActive: boolean;
	requestId: string | undefined;
	canvas: ICanvas | undefined;
	model: IBrowserViewModel | undefined;
	modelSource: URI | undefined;
	modelPromise: { readonly source: URI; readonly value: Promise<IBrowserViewModel> } | undefined;
	modelDisposeListener: IDisposable | undefined;
	modelGeneration: number;
}

interface ICanvasLookup {
	readonly known: boolean;
	readonly canvas: ICanvas | undefined;
}

const settledWorkingSet: ICanvasWorkingSetState = Object.freeze({ owner: undefined, restoring: false, applying: false });

export class CanvasService extends Disposable implements ICanvasService {

	declare readonly _serviceBrand: undefined;
	readonly enabled;
	readonly reopenableCanvases;

	private readonly inputs = this._register(new DisposableMap<string, CanvasInput>());
	private readonly inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly dismissed = new Map<string, { readonly reference: ICanvasReference; readonly requestId: string | undefined }>();
	private readonly presentations = new Map<string, ICanvasPresentation>();
	private readonly presentationsBySerializationId = new Map<string, ICanvasPresentation>();
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
				if (canvas?.source !== undefined) {
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
			for (const presentation of this.presentations.values()) {
				this.disposePresentationModel(presentation);
			}
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
					const membershipPending = canvas.instanceId === undefined;
					existingInput?.setCanvas(membershipPending && presentation?.canvas ? { ...presentation.canvas, source: undefined } : canvas, membershipPending);
					const request = canvas.instanceId ? requests?.get(canvas.instanceId) : undefined;
					if (request || !this.requests.has(key)) {
						this.requests.set(key, request?.id);
					}
					const requestId = this.requests.get(key);
					const dismissed = this.dismissed.get(key);
					if (!visible || !workingSetPresented || canvas.source === undefined
						|| (dismissed && (dismissed.requestId === requestId || !request?.succeeded))
						|| (presentation?.opened && (presentation.requestId === requestId || !request?.succeeded))) {
						continue;
					}
					const input = existingInput ?? this.getOrCreateInput(reference, canvas);
					if (this.opening.has(input)) {
						continue;
					}
					this.deleteDismissed(key);
					if (presentation?.opened && request?.succeeded && this.editorService.isVisible(input)) {
						presentation.requestId = requestId;
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
		if (canvas?.source === undefined) {
			return;
		}
		const key = getCanvasReferenceKey(reference);
		const input = this.getOrCreateInput(reference, canvas);
		input.setCanvas(canvas);
		this.deleteDismissed(key);
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
		const lookup = this.lookupCanvas(presentation.reference);
		if (!lookup) {
			return undefined;
		}
		if (lookup.known && !lookup.canvas) {
			this.removePresentation(presentation);
			return undefined;
		}
		const membershipPending = !lookup.known || lookup.canvas?.instanceId === undefined;
		const canvas = membershipPending
			? presentation.canvas && { ...presentation.canvas, source: undefined }
			: lookup.canvas;
		const input = this.getOrCreateInput(presentation.reference, canvas, membershipPending);
		input.setCanvas(canvas, membershipPending);
		input.setSerializationId(serializationId);
		presentation.opened = true;
		return input;
	}

	resolveCanvasModel(reference: ICanvasReference, source: URI): Promise<ICanvasModelResolution> {
		const key = getCanvasReferenceKey(reference);
		const presentation = this.presentations.get(key);
		if (this._store.isDisposed || !presentation || !isEqual(presentation.canvas?.source, source)) {
			return Promise.reject(new CancellationError());
		}
		if (presentation.model && isEqual(presentation.modelSource, source)) {
			return Promise.resolve({ model: presentation.model, reused: true });
		}
		if (presentation.modelPromise && isEqual(presentation.modelPromise.source, source)) {
			return presentation.modelPromise.value.then(model => ({ model, reused: true }));
		}
		this.disposePresentationModel(presentation);
		const generation = ++presentation.modelGeneration;
		const value = this.browserViewService.createExternalBrowserView(source.toString(true), 'canvas').then(model => {
			const retained = this.presentations.get(key) === presentation
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
		const canvas = input.canvas.get();
		if (!canvas) {
			throw new Error(localize('canvas.closed', "This canvas is no longer available."));
		}
		const presentation = this.getOrCreatePresentation(input.reference, canvas);
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
			presentation.admitted = true;
			presentation.opened = true;
			presentation.restoreActive = false;
			presentation.requestId = this.requests.get(key);
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

	private getOrCreateInput(reference: ICanvasReference, canvas: ICanvas | undefined, membershipPending = false): CanvasInput {
		const key = getCanvasReferenceKey(reference);
		const presentation = this.getOrCreatePresentation(reference, membershipPending ? undefined : canvas);
		const existing = this.inputs.get(key);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		const input = this.instantiationService.createInstance(CanvasInput, reference, canvas);
		input.setCanvas(canvas, membershipPending);
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
					presentation.opened = false;
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

	private getOrCreatePresentation(reference: ICanvasReference, canvas?: ICanvas): ICanvasPresentation {
		const key = getCanvasReferenceKey(reference);
		let presentation = this.presentations.get(key);
		if (presentation) {
			if (canvas) {
				this.setPresentationCanvas(presentation, canvas);
			}
			return presentation;
		}
		presentation = {
			reference,
			serializationId: generateUuid(),
			admitted: false,
			opened: false,
			restoreActive: false,
			requestId: undefined,
			canvas,
			model: undefined,
			modelSource: undefined,
			modelPromise: undefined,
			modelDisposeListener: undefined,
			modelGeneration: 0,
		};
		this.presentations.set(key, presentation);
		this.presentationsBySerializationId.set(presentation.serializationId, presentation);
		return presentation;
	}

	private markPresentedCanvasesForSuspension(): void {
		for (const [key, input] of this.inputs) {
			const presentation = this.presentations.get(key);
			if (presentation) {
				presentation.restoreActive = presentation.opened && this.editorService.activeEditor === input;
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
			if (!opened) {
				presentation.opened = false;
				changed = true;
			}
		}
		if (changed) {
			this.presentationsChanged.trigger(undefined);
		}
	}

	private reconcilePresentations(reader: IReader): void {
		for (const [key, presentation] of this.presentations) {
			const lookup = this.lookupCanvas(presentation.reference, reader);
			if (!lookup) {
				continue;
			}
			const input = this.inputs.get(key);
			if (lookup.known && !lookup.canvas) {
				this.removePresentation(presentation);
				continue;
			}
			if (lookup.canvas?.instanceId === undefined) {
				input?.setCanvas(presentation.canvas && { ...presentation.canvas, source: undefined }, true);
				continue;
			}
			this.setPresentationCanvas(presentation, lookup.canvas);
			input?.setCanvas(lookup.canvas, false);
		}
	}

	private lookupCanvas(reference: ICanvasReference, reader?: IReader): ICanvasLookup | undefined {
		const canvases = this.contextService.getContext(reference, reader)?.canvases;
		if (!canvases) {
			return undefined;
		}
		const current = canvases.read(reader);
		return current === undefined
			? { known: false, canvas: undefined }
			: { known: true, canvas: current.find(candidate => isEqual(candidate.resource, reference.canvas)) };
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
			presentation.opened = false;
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

	private removePresentation(presentation: ICanvasPresentation): void {
		const key = getCanvasReferenceKey(presentation.reference);
		const input = this.inputs.get(key);
		this.deleteDismissed(key);
		if (input) {
			void this.closeInput(key, input).catch(error => this.reportError('Failed to close canvas', error));
		} else {
			this.deletePresentation(key);
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
		this.disposePresentationModel(presentation);
		this.presentationsChanged.trigger(undefined);
	}

	private setPresentationCanvas(presentation: ICanvasPresentation, canvas: ICanvas): void {
		const disposeModel = !canvas.source || presentation.modelSource && !isEqual(presentation.modelSource, canvas.source);
		presentation.canvas = canvas;
		if (disposeModel) {
			this.disposePresentationModel(presentation);
		}
	}

	private disposePresentationModel(presentation: ICanvasPresentation): void {
		presentation.modelGeneration++;
		presentation.modelPromise = undefined;
		presentation.modelDisposeListener?.dispose();
		presentation.modelDisposeListener = undefined;
		const model = presentation.model;
		presentation.model = undefined;
		presentation.modelSource = undefined;
		model?.dispose();
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

function workingSetIncludes(owner: ICanvasWorkingSetOwner, canvasOwner: ICanvasOwner): boolean {
	return isEqual(owner.sessionResource, canvasOwner.session) && (owner.chatResource === undefined || isEqual(owner.chatResource, canvasOwner.chat));
}
