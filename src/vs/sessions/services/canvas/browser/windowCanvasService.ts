/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, observableValue, runOnChange } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { EditorCloseContext, EditorInputCapabilities, GroupIdentifier, IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ILifecycleService } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ICanvasWorkingSets } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { ICustomViewService } from '../../customView/browser/customViewService.js';

export interface IWindowCanvas extends IDisposable {
	render(container: HTMLElement): void;
	layout(width: number, height: number): void;
	focus(): void;
	setVisible(visible: boolean): void;
	openNewSession?(): Promise<void>;
}

export interface IWindowCanvasDescriptor {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly ctor: SyncDescriptor<IWindowCanvas>;
}

export interface IWindowCanvasPresentation {
	readonly element: HTMLElement;
	readonly content: IWindowCanvas;
}

export const IWindowCanvasService = createDecorator<IWindowCanvasService>('windowCanvasService');

/** Native canvases belong to the window, not to an agent, session, or chat. */
export interface IWindowCanvasService {
	readonly _serviceBrand: undefined;
	readonly canvases: IObservable<readonly IWindowCanvasDescriptor[]>;
	readonly activeCanvasId: IObservable<string | undefined>;
	registerCanvas(descriptor: IWindowCanvasDescriptor): IDisposable;
	openCanvas(id: string): Promise<void>;
	closeCanvas(id: string): Promise<void>;
	getPresentation(input: WindowCanvasInput): IWindowCanvasPresentation;
	openNewSession(): Promise<void> | undefined;
	connectWorkingSets(workingSets: ICanvasWorkingSets): IDisposable;
}

export class WindowCanvasInput extends EditorInput {
	static readonly ID = 'sessions.editorInput.windowCanvas';
	static readonly EDITOR_ID = 'sessions.editor.windowCanvas';
	readonly resource: URI;

	constructor(
		readonly descriptor: IWindowCanvasDescriptor,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super();
		this.resource = URI.from({ scheme: Schemas.vscodeWindowCanvas, path: `/${descriptor.id}` });
	}

	override get typeId(): string { return WindowCanvasInput.ID; }
	override get editorId(): string { return WindowCanvasInput.EDITOR_ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal; }
	override getName(): string { return this.descriptor.title; }
	override getIcon(): ThemeIcon { return this.descriptor.icon; }
	override canMove(_source: GroupIdentifier, target: GroupIdentifier): true | string {
		return this.editorGroupsService.getGroup(target)?.windowId === this.editorGroupsService.mainPart.windowId
			? true
			: localize('windowCanvas.mainWindowOnly', "This canvas can only be shown in the main window.");
	}
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof WindowCanvasInput ? other.descriptor.id === this.descriptor.id : super.matches(other);
	}
}

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
		store.add(runOnChange(workingSets.state, state => {
			if (!state.restoring && this.entries.size > 0) {
				const suppression = workingSets.suppressEditorPartAutoVisibility();
				void Promise.all([...this.entries.keys()].map(id => this.reveal(id, true)))
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

	async openCanvas(id: string): Promise<void> {
		if (!this.descriptors.has(id)) {
			throw new Error(localize('windowCanvas.unavailable', "The canvas '{0}' is unavailable.", id));
		}
		this.customViewService.hideCustomView();
		await this.reveal(id, false);
	}

	private async reveal(id: string, preserveFocus: boolean): Promise<void> {
		const descriptor = this.descriptors.get(id);
		if (!descriptor) {
			return;
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
		if (this.workingSets?.state.get().restoring) {
			return;
		}
		if (preserveFocus && this.editorGroupsService.mainPart.groups.some(group => group.contains(entry.input))) {
			return;
		}
		const pane = await this.editorService.openEditor(entry.input, {
			pinned: true, revealIfOpened: true, preserveFocus, inactive: preserveFocus,
			activation: preserveFocus ? EditorActivation.PRESERVE : undefined,
		}, this.editorGroupsService.mainPart.activeGroup);
		if (!pane && !(preserveFocus && this.editorGroupsService.mainPart.groups.some(group => group.contains(entry.input)))) {
			throw new Error(localize('windowCanvas.openFailed', "The canvas '{0}' could not be opened.", descriptor.title));
		}
		if (this.entries.get(id) !== entry || !this.descriptors.has(id)) {
			await this.editorService.closeEditors(this.editorService.findEditors(entry.input.resource).filter(editor => editor.editor === entry.input));
			entry.input.dispose();
			return;
		}
		this.restoredIds.add(id);
		this.saveOpenCanvases();
	}

	getPresentation(input: WindowCanvasInput): IWindowCanvasPresentation {
		const entry = this.entries.get(input.descriptor.id);
		if (!entry || entry.input !== input || !this.descriptors.has(input.descriptor.id)) {
			throw new Error(localize('windowCanvas.unavailable', "The canvas '{0}' is unavailable.", input.descriptor.title));
		}
		if (!entry.presentation) {
			const element = $('.window-canvas-content');
			const store = entry.store.add(new DisposableStore());
			try {
				const context = store.add(this.contextKeyService.createScoped(element));
				const instantiationService = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
				const content = store.add(instantiationService.createInstance<IWindowCanvas>(input.descriptor.ctor));
				content.render(element);
				entry.presentation = { element, content };
			} catch (error) {
				entry.store.delete(store);
				throw error;
			}
		}
		return entry.presentation;
	}

	openNewSession(): Promise<void> | undefined {
		const id = this.activeCanvasId.get();
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
