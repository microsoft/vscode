/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, DragAndDropObserver, isEditableElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { applyDragImage } from '../../../../base/browser/ui/dnd/dnd.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from './editor.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { getWindowMainPart, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { DraggedEditorIdentifier, fillEditorsDragData } from '../../dnd.js';
import { EditorPane } from './editorPane.js';
import { ViewEditorInput } from './viewEditorInput.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from './viewEditorRegistry.js';

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
	private viewStateSaved = false;
	private readonly viewDisposables = this._register(new DisposableStore());

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

		this.saveViewState();
		this.viewDisposables.clear();
		this.view = undefined;

		const descriptor = Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).get(input.viewType);
		if (!descriptor) {
			throw new Error(`No view editor is registered for '${input.viewType}'.`);
		}

		const viewInstantiationService = this.viewDisposables.add(this.instantiationService.createChild(new ServiceCollection(
			[IEditorService, this.getMainPartEditorService()]
		)));

		const view = this.viewDisposables.add(descriptor.createView(viewInstantiationService, input));
		this.view = view;
		this.viewStateSaved = false;
		this.viewDisposables.add(toDisposable(() => {
			view.element.remove();
			if (this.view === view) {
				this.view = undefined;
			}
		}));

		this.container?.appendChild(view.element);
		this.viewDisposables.add(view.onDidChange(e => this._onDidChangeSizeConstraints.fire(e)));
		if (view.dragHandle) {
			this.viewDisposables.add(this.registerDragHandle(view.dragHandle, input));
		}
		this._onDidChangeSizeConstraints.fire(undefined);

		if (this.dimension) {
			this.layout(this.dimension);
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

				// The handle owns the drag: what contains it does not also drag
				e.stopPropagation();

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
		this.saveViewState();
		this.viewDisposables.clear();

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
