/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, DragAndDropObserver, isEditableElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { applyDragImage } from '../../../../base/browser/ui/dnd/dnd.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from './editor.js';
import { GroupModelChangeKind, IEditorOpenContext } from '../../../common/editor.js';
import { getWindowMainPart, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DraggedEditorIdentifier, fillEditorsDragData } from '../../dnd.js';
import { EditorPane } from './editorPane.js';
import { ViewEditorInput } from './viewEditorInput.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from './viewEditorRegistry.js';

/**
 * A view of a {@link ViewEditorPane} kept alive, out of the DOM, while its editor
 * stays in the group and another editor of the group shows, such as another tab,
 * with what it holds.
 */
interface IHiddenView extends IDisposable {
	readonly view: IViewEditorView;
	readonly disposables: DisposableStore;
}

/**
 * An editor pane that hosts the view of a {@link ViewEditorInput}. The view
 * opens other editors in the main part of its window, not beside itself.
 */
export class ViewEditorPane extends EditorPane {

	static readonly ID = 'workbench.editor.viewEditor';

	private readonly _onDidChangeSizeConstraints = this._register(new Emitter<{ width: number; height: number } | undefined>());
	override readonly onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;

	private container: HTMLElement | undefined;
	private dimension: Dimension | undefined;

	private view: IViewEditorView | undefined;
	private currentInput: ViewEditorInput | undefined;
	private viewStateSaved = false;
	private readonly viewDisposables = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * The views of inputs that stay in the group while another editor shows, such as another tab: they live on, out of the
	 * DOM, until their input leaves the group, as it closes or moves.
	 */
	private readonly hiddenViews = this._register(new DisposableMap<ViewEditorInput, IHiddenView>());

	private readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) {
		super(ViewEditorPane.ID, group, telemetryService, themeService, storageService);

		// The pane of the target group creates its view before this one is disposed
		this._register(group.onWillMoveEditor(e => {
			if (e.editor === this.input) {
				this.saveViewState();
			} else if (e.editor instanceof ViewEditorInput) {
				this.hiddenViews.get(e.editor)?.view.saveViewState?.();
			}
		}));
		this._register(group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.EDITOR_CLOSE && e.editor instanceof ViewEditorInput) {
				this.hiddenViews.deleteAndDispose(e.editor);
			}
		}));
	}

	override get minimumWidth() { return this.view?.minimumWidth ?? DEFAULT_EDITOR_MIN_DIMENSIONS.width; }
	override get maximumWidth() { return this.view?.maximumWidth ?? DEFAULT_EDITOR_MAX_DIMENSIONS.width; }
	override get minimumHeight() { return this.view?.minimumHeight ?? DEFAULT_EDITOR_MIN_DIMENSIONS.height; }
	override get maximumHeight() { return this.view?.maximumHeight ?? DEFAULT_EDITOR_MAX_DIMENSIONS.height; }

	override get providesTitle(): boolean {
		return !!this.view?.providesTitle;
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('.view-editor'));
	}

	override async setInput(input: ViewEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const inputChanged = !this.input?.matches(input);

		await super.setInput(input, options, context, token);

		if (token.isCancellationRequested || !inputChanged) {
			return;
		}

		this.hideOrDisposeView();

		// The view it had while another editor showed in the group, else a new one
		const hidden = this.hiddenViews.get(input);
		if (hidden) {
			this.hiddenViews.deleteAndLeak(input);
			hidden.view.setVisible?.(true);
		}
		const { view, disposables } = hidden ?? this.createView(input);
		this.view = view;
		this.viewStateSaved = false;
		this.currentInput = input;
		this.viewDisposables.value = disposables;

		this.container?.appendChild(view.element);
		this._onDidChangeSizeConstraints.fire(undefined);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private createView(input: ViewEditorInput): IHiddenView {
		const descriptor = Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).get(input.viewType);
		if (!descriptor) {
			throw new Error(`No view editor is registered for '${input.viewType}'.`);
		}

		const disposables = new DisposableStore();
		const viewInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection(
			[IEditorService, this.getMainPartEditorService()]
		)));

		const view = disposables.add(descriptor.createView(viewInstantiationService, input));
		disposables.add(toDisposable(() => {
			view.element.remove();
			if (this.view === view) {
				this.view = undefined;
			}
		}));
		disposables.add(view.onDidChange(e => {
			if (this.view === view) {
				this._onDidChangeSizeConstraints.fire(e);
			}
		}));
		if (view.dragHandle) {
			disposables.add(this.registerDragHandle(view.dragHandle, input));
		}

		return { view, disposables, dispose: () => disposables.dispose() };
	}

	/**
	 * Lets go of the view of the current input: it stays alive, out of the DOM, while its input stays in the group, such as
	 * while another tab shows; it is disposed otherwise.
	 */
	private hideOrDisposeView(): void {
		const view = this.view;
		const input = this.currentInput;
		const disposables = this.viewDisposables.value;
		this.saveViewState();
		this.view = undefined;
		this.currentInput = undefined;
		if (view && input && disposables && this.group.contains(input, { strictEquals: true })) {
			this.viewDisposables.clearAndLeak();
			view.element.remove();
			view.setVisible?.(false);
			this.hiddenViews.set(input, { view, disposables, dispose: () => disposables.dispose() });
		} else {
			this.viewDisposables.clear();
		}
	}

	/**
	 * The editor service of the main part of the window: the first part
	 * created in it.
	 */
	private getMainPartEditorService(): IEditorService {
		const mainPart = getWindowMainPart(this.editorGroupsService, this.group.windowId);

		return this.editorGroupsService.getScopedInstantiationService(mainPart).invokeFunction(accessor => accessor.get(IEditorService));
	}

	/**
	 * Saves the state of the view once before its editor leaves the pane.
	 */
	private saveViewState(): void {
		if (this.view && !this.viewStateSaved) {
			this.viewStateSaved = true;
			this.view.saveViewState?.();
		}
	}

	/**
	 * Drags the editor from the view's drag handle with the same transfer as
	 * its tab, so that it drops into other groups and parts like a tab.
	 */
	private registerDragHandle(handle: HTMLElement, input: ViewEditorInput): IDisposable {
		const disposables = new DisposableStore();

		handle.draggable = true;
		disposables.add(toDisposable(() => handle.draggable = false));

		disposables.add(new DragAndDropObserver(handle, {
			onDragStart: e => {

				// Text fields in the handle, such as a rename, keep the mouse
				if (isHTMLElement(e.target) && isEditableElement(e.target)) {
					e.preventDefault();
					return;
				}

				// What contains the handle, such as a header, may add its own data to the drag
				const identifier = { editor: input, groupId: this.group.id };
				this.editorTransfer.setData([new DraggedEditorIdentifier(identifier)], DraggedEditorIdentifier.prototype);
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'copyMove';
					applyDragImage(e, handle, input.getName());
				}

				this.instantiationService.invokeFunction(fillEditorsDragData, [identifier], e, { disableStandardTransfer: true });
			},
			onDragEnd: () => this.editorTransfer.clearData(DraggedEditorIdentifier.prototype)
		}));

		return disposables;
	}

	override clearInput(): void {
		this.hideOrDisposeView();

		super.clearInput();
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		this.view?.layout(dimension.width, dimension.height, 0, 0);
	}

	override focus(): void {
		super.focus();

		this.view?.focus();
	}
}
