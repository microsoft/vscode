/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ITransaction, observableFromEvent, observableValue, runOnChange, subtransaction, transaction, waitForState } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { EditorCloseContext, IEditorPane } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ICanvasWorkingSets } from '../../canvases/common/canvas.js';
import { ICustomViewService } from './customView.js';
import { createMainWindowInstantiationService } from '../../../services/sessions/browser/sessionHost.js';
import { IWindowCanvas, IWindowCanvasDescriptor, IWindowCanvasPresentation, IWindowCanvasOpenRequest, IWindowCanvasService, WindowCanvasInput } from './windowCanvas.js';

interface ICanvasEntry {
	input: WindowCanvasInput;
	readonly store: DisposableStore;
	readonly retention: MutableDisposable<IDisposable>;
	presentation?: IWindowCanvasPresentation;
}

const OPEN_CANVASES_STORAGE_KEY = 'sessions.windowCanvases.open';

export class WindowCanvasService extends Disposable implements IWindowCanvasService {
	declare readonly _serviceBrand: undefined;
	private readonly descriptors = new Map<string, IWindowCanvasDescriptor>();
	private readonly entries = new Map<string, ICanvasEntry>();
	private readonly _canvases = observableValue<readonly IWindowCanvasDescriptor[]>(this, []);
	readonly canvases = this._canvases;
	readonly activeCanvasId: IObservable<string | undefined>;
	private readonly _navigationRequest = observableValue<IWindowCanvasOpenRequest | undefined>(this, undefined);
	readonly navigationRequest = this._navigationRequest;
	private readonly _activeCanvasOpen = observableValue<IWindowCanvasOpenRequest | undefined>(this, undefined);
	readonly activeCanvasOpen = this._activeCanvasOpen;
	private openVersion = 0;
	private readonly pendingOpen = this._register(new MutableDisposable<IDisposable>());
	private restoringFocus = false;
	private readonly openingInputs = new Map<WindowCanvasInput, number>();
	private readonly restoredIds: Set<string>;
	private workingSets: ICanvasWorkingSets | undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		this.restoredIds = new Set(storageService.getObject<string[]>(OPEN_CANVASES_STORAGE_KEY, StorageScope.WORKSPACE, []));
		const activeEditor = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor);
		this.activeCanvasId = derived(this, reader => {
			const input = activeEditor.read(reader);
			return !customViewService.activeCustomView.read(reader) && input instanceof WindowCanvasInput
				? input.descriptor.id : undefined;
		});
		const trackActiveCanvas = () => {
			const input = editorService.activeEditor;
			if (this.restoringFocus || this.workingSets?.state.get().restoring || input instanceof WindowCanvasInput && this.openingInputs.has(input)) {
				return;
			}
			if (input instanceof WindowCanvasInput && this.descriptors.has(input.descriptor.id) && !customViewService.activeCustomView.get()) {
				if (this._activeCanvasOpen.get()?.id !== input.descriptor.id) {
					const request: IWindowCanvasOpenRequest = { id: input.descriptor.id, source: 'explicit' };
					this.cancelPendingOpen();
					transaction(tx => {
						this._navigationRequest.set(request, tx);
						this._activeCanvasOpen.set(request, tx);
					});
				}
			} else {
				this.deactivateCanvas();
			}
		};
		this._register(editorService.onDidActiveEditorChange(trackActiveCanvas));
		this._register(editorGroupsService.mainPart.onDidFocus(trackActiveCanvas));
		this._register(editorService.onDidCloseEditor(event => {
			if (event.editor instanceof WindowCanvasInput && event.context !== EditorCloseContext.MOVE && !this.workingSets?.state.get().restoring) {
				this.forget(event.editor.descriptor.id);
			}
		}));
		this._register(toDisposable(() => {
			for (const entry of this.entries.values()) {
				entry.store.dispose();
				entry.input.dispose();
			}
			this.entries.clear();
		}));
	}

	connectWorkingSets(workingSets: ICanvasWorkingSets): IDisposable {
		this.workingSets = workingSets;
		const store = new DisposableStore();
		let focusedCanvas: { entry: ICanvasEntry; element: HTMLElement; navigation: IWindowCanvasOpenRequest } | undefined;
		let restoreVersion = 0;
		store.add(runOnChange(workingSets.state, state => {
			const version = ++restoreVersion;
			if (state.restoring) {
				const activeElement = getActiveElement();
				const navigation = this._activeCanvasOpen.get();
				if (!focusedCanvas && isHTMLElement(activeElement)) {
					const entry = [...this.entries.values()].find(entry => entry.input.descriptor.retainFocusOnRestore && entry.presentation?.element.contains(activeElement));
					if (entry && navigation?.id === entry.input.descriptor.id) {
						focusedCanvas = { entry, element: activeElement, navigation };
					}
				}
				return;
			}
			const focusToRestore = focusedCanvas;
			focusedCanvas = undefined;
			if (!state.restoring && this.entries.size > 0) {
				const suppression = workingSets.suppressEditorPartAutoVisibility();
				void Promise.all([...this.entries.keys()].map(id => this.reveal(id, true)))
					.then(() => {
						// Detaching the canvas can drop focus to body; never override a control the user focused instead.
						if (focusToRestore && !store.isDisposed && version === restoreVersion
							&& this._activeCanvasOpen.get() === focusToRestore.navigation
							&& [...this.entries.values()].includes(focusToRestore.entry)
							&& focusToRestore.element.isConnected
							&& getActiveElement() === focusToRestore.element.ownerDocument.body) {
							this.restoringFocus = true;
							try {
								focusToRestore.entry.presentation?.content.focus();
								focusToRestore.element.focus();
							} finally {
								this.restoringFocus = false;
							}
						}
					})
					.catch(error => this.logService.error('[WindowCanvasService] Restoring canvas failed', error))
					.finally(() => suppression.dispose());
			}
		}));
		store.add(toDisposable(() => { this.workingSets = undefined; }));
		return store;
	}

	registerCanvas(descriptor: IWindowCanvasDescriptor): IDisposable {
		if (this.descriptors.has(descriptor.id)) {
			throw new Error(`Canvas already registered: ${descriptor.id}`);
		}
		this.descriptors.set(descriptor.id, descriptor);
		this._canvases.set([...this.descriptors.values()], undefined);
		if (this.restoredIds.has(descriptor.id)) {
			void this.reveal(descriptor.id, true).catch(error => this.logService.error('[WindowCanvasService] Restoring canvas failed', error));
		}
		return toDisposable(() => {
			this.descriptors.delete(descriptor.id);
			this._canvases.set([...this.descriptors.values()], undefined);
			void this.closeCanvas(descriptor.id).catch(error => this.logService.error('[WindowCanvasService] Closing canvas failed', error));
		});
	}

	async openCanvas(id: string, options?: { readonly source?: 'history' }): Promise<void> {
		if (!this.descriptors.has(id)) {
			throw new Error(localize('windowCanvas.unavailable', "The canvas '{0}' is unavailable.", id));
		}
		const version = ++this.openVersion;
		this.pendingOpen.clear();
		const cancellation = new CancellationTokenSource();
		this.pendingOpen.value = toDisposable(() => cancellation.dispose(true));
		const request: IWindowCanvasOpenRequest = { id, source: options?.source ?? 'explicit' };
		this._navigationRequest.set(request, undefined);
		this.customViewService.hideCustomView();
		try {
			if (this.workingSets?.state.get().restoring) {
				await waitForState(this.workingSets.state, state => !state.restoring, undefined, cancellation.token);
			}
			if (version !== this.openVersion) {
				return;
			}
			if (await this.reveal(id, false, () => version === this.openVersion) && version === this.openVersion) {
				this._activeCanvasOpen.set(request, undefined);
			}
		} catch (error) {
			if (!isCancellationError(error) || !cancellation.token.isCancellationRequested) {
				throw error;
			}
		} finally {
			if (this._navigationRequest.get() === request && this._activeCanvasOpen.get() !== request) {
				this._navigationRequest.set(undefined, undefined);
			}
			if (version === this.openVersion) {
				this.pendingOpen.clear();
			}
		}
	}

	cancelPendingOpen(): void {
		this.openVersion++;
		this.pendingOpen.clear();
		if (this._navigationRequest.get() !== this._activeCanvasOpen.get()) {
			this._navigationRequest.set(undefined, undefined);
		}
	}

	deactivateCanvas(tx?: ITransaction): void {
		this.openVersion++;
		this.pendingOpen.clear();
		subtransaction(tx, tx => {
			this._navigationRequest.set(undefined, tx);
			this._activeCanvasOpen.set(undefined, tx);
		});
	}

	private async reveal(id: string, preserveFocus: boolean, isCurrent = () => true): Promise<boolean> {
		const descriptor = this.descriptors.get(id);
		if (!descriptor) {
			return false;
		}
		let entry = this.entries.get(id);
		if (!entry) {
			const store = new DisposableStore();
			entry = { input: this.instantiationService.createInstance(WindowCanvasInput, descriptor), store, retention: store.add(new MutableDisposable()) };
			this.entries.set(id, entry);
			entry.retention.value = this.workingSets?.registerEditorToRetain(entry.input);
		} else if (entry.input.isDisposed()) {
			entry.input = this.instantiationService.createInstance(WindowCanvasInput, descriptor);
			entry.retention.value = this.workingSets?.registerEditorToRetain(entry.input);
		}
		await this.editorGroupsService.whenReady;
		if (this.entries.get(id) !== entry || !this.descriptors.has(id)) {
			throw new Error(localize('windowCanvas.unavailable', "The canvas '{0}' is unavailable.", id));
		}
		if (!isCurrent()) {
			if (!this.restoredIds.has(id) && this._navigationRequest.get()?.id !== id) {
				this.forget(id);
				entry.input.dispose();
			}
			return false;
		}
		if (this.workingSets?.state.get().restoring) {
			return false;
		}
		if (preserveFocus && this.editorGroupsService.mainPart.groups.some(group => group.contains(entry.input))) {
			return true;
		}
		const input = entry.input;
		this.openingInputs.set(input, (this.openingInputs.get(input) ?? 0) + 1);
		let pane: IEditorPane | undefined;
		try {
			pane = await this.editorService.openEditor(input, {
				pinned: true, revealIfOpened: true, preserveFocus: true, inactive: preserveFocus,
				activation: EditorActivation.PRESERVE,
			}, this.editorGroupsService.mainPart.activeGroup);
			if (!pane && !(preserveFocus && this.editorGroupsService.mainPart.groups.some(group => group.contains(entry.input)))) {
				if (!isCurrent()) {
					return false;
				}
				throw new Error(localize('windowCanvas.openFailed', "The canvas '{0}' could not be opened.", descriptor.title));
			}
			if (this.entries.get(id) !== entry || !this.descriptors.has(id)) {
				await this.editorService.closeEditors(this.editorService.findEditors(entry.input.resource).filter(editor => editor.editor === entry.input));
				entry.input.dispose();
				return false;
			}
			this.restoredIds.add(id);
			this.saveOpenCanvases();
			// Editor creation is asynchronous; only the still-current navigation may take focus.
			if (!preserveFocus && pane && isCurrent()) {
				this.editorGroupsService.activateGroup(pane.group);
				if (isCurrent()) {
					pane.focus();
				}
			}
			return isCurrent();
		} finally {
			const count = this.openingInputs.get(input)! - 1;
			if (count) {
				this.openingInputs.set(input, count);
			} else {
				this.openingInputs.delete(input);
			}
		}
	}

	private _mainWindowInstantiationService: IInstantiationService | undefined;
	/** Canvases show in the main window only: their content is the main window's UI, created once. */
	private get mainWindowInstantiationService(): IInstantiationService {
		return this._mainWindowInstantiationService ??= this._register(createMainWindowInstantiationService(this.instantiationService));
	}

	getPresentation(input: WindowCanvasInput): IWindowCanvasPresentation {
		const entry = this.entries.get(input.descriptor.id);
		if (!entry || entry.input !== input || !this.descriptors.has(input.descriptor.id)) {
			throw new Error(localize('windowCanvas.unavailable', "The canvas '{0}' is unavailable.", input.descriptor.title));
		}
		if (!entry.presentation) {
			const element = $('.window-canvas-content');
			// The services of the content's scope dispose after the content, which may still use them as it goes away.
			const store = entry.store.add(new DisposableStore());
			const scopedServices = entry.store.add(new DisposableStore());
			try {
				const context = scopedServices.add(this.contextKeyService.createScoped(element));
				const instantiationService = scopedServices.add(this.mainWindowInstantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
				const content = store.add(instantiationService.createInstance<IWindowCanvas>(input.descriptor.ctor));
				content.render(element);
				entry.presentation = { element, content };
			} catch (error) {
				entry.store.delete(store);
				entry.store.delete(scopedServices);
				throw error;
			}
		}
		return entry.presentation;
	}

	openNewSession(): Promise<void> | undefined {
		const id = this._activeCanvasOpen.get()?.id;
		return id && this.editorService.activeEditorPane?.isVisible() ? this.entries.get(id)?.presentation?.content.openNewSession?.() : undefined;
	}

	async closeCanvas(id: string): Promise<void> {
		const entry = this.entries.get(id);
		this.forget(id);
		if (entry) {
			await this.editorService.closeEditors(this.editorService.findEditors(entry.input.resource));
			entry.input.dispose();
		}
	}

	private forget(id: string): void {
		if (this._navigationRequest.get()?.id === id) {
			this.cancelPendingOpen();
		}
		if (this._activeCanvasOpen.get()?.id === id) {
			this.deactivateCanvas();
		}
		const entry = this.entries.get(id);
		this.entries.delete(id);
		entry?.presentation?.element.remove();
		entry?.store.dispose();
		this.restoredIds.delete(id);
		this.saveOpenCanvases();
	}

	private saveOpenCanvases(): void {
		// Editor and contribution teardown must not erase the next window's restoration state.
		if (!this.lifecycleService.willShutdown) {
			this.storageService.store(OPEN_CANVASES_STORAGE_KEY, [...this.restoredIds], StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}
}
