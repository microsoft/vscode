/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorInputCapabilities, EditorsOrder, IEditorPartOptions } from '../../../../common/editor.js';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { EditorTitleControl } from '../../../../browser/parts/editor/editorTitleControl.js';
import { ICloseEditorsFilter, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';

export interface ITabBarTestEditorSpec {
	readonly resource: URI;
	readonly dirty?: boolean;
	readonly pinned?: boolean;
	readonly sticky?: boolean;
	readonly active?: boolean;
}

/**
 * A lightweight {@link EditorInput} used to populate a tab bar in tests, without
 * resolving a real editor pane — it only provides what the tab bar renders.
 */
export class TestTabEditorInput extends EditorInput {

	constructor(
		readonly resource: URI,
		private readonly _dirty: boolean
	) {
		super();
	}

	override get typeId(): string { return 'workbench.editors.testTabEditorInput'; }
	override get editorId(): string | undefined { return this.typeId; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.None; }
	override getName(): string { return basename(this.resource); }
	override isDirty(): boolean { return this._dirty; }
}

export function createTabBarPartOptions(overrides?: Partial<IEditorPartOptions>): IEditorPartOptions {
	return {
		...DEFAULT_EDITOR_PART_OPTIONS,
		...overrides,
	};
}

export function populateTabBarModel(model: EditorGroupModel, specs: readonly ITabBarTestEditorSpec[], disposableStore: DisposableStore): void {
	// Open sticky editors first so their indices stay at the front.
	const ordered = [...specs].sort((a, b) => (a.sticky === b.sticky) ? 0 : a.sticky ? -1 : 1);
	for (const spec of ordered) {
		const input = disposableStore.add(new TestTabEditorInput(spec.resource, !!spec.dirty));
		model.openEditor(input, {
			pinned: spec.pinned ?? true,
			sticky: spec.sticky,
			active: spec.active,
		});
	}
}

export interface ITabBarTestOptions {
	readonly partOptions?: Partial<IEditorPartOptions>;
	readonly editors?: readonly ITabBarTestEditorSpec[];
	readonly width?: number;
}

export interface ITabBarTestContext {
	readonly model: EditorGroupModel;
	readonly groupView: IEditorGroupView;
	readonly titleControl: EditorTitleControl;
	readonly titleContainer: HTMLElement;
	readonly layout: () => void;
}

/**
 * Renders a real {@link EditorTitleControl} (backed by a real {@link EditorGroupModel}
 * and a real DOM tree) into `container`, for tests that need to dispatch genuine DOM
 * events against tab nodes and assert on genuine model state afterward.
 */
export function createTabBarTestContext(container: HTMLElement, options: ITabBarTestOptions, disposableStore: DisposableStore): ITabBarTestContext {
	const width = options.width ?? 800;
	const partOptions = createTabBarPartOptions(options.partOptions);

	const instantiationService = workbenchInstantiationService(undefined, disposableStore);
	instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
	instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());

	const contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
	instantiationService.stub(IContextKeyService, contextKeyService);

	const model = disposableStore.add(instantiationService.createInstance(EditorGroupModel, undefined));
	populateTabBarModel(model, options.editors ?? [], disposableStore);

	const groupView = new class extends mock<IEditorGroupView>() {
		relayoutFn: () => void = () => { };
		override get id() { return model.id; }
		override get count() { return model.count; }
		override get stickyCount() { return model.stickyCount; }
		override get activeEditor() { return model.activeEditor; }
		override get activeEditorPane() { return undefined; }
		override get selectedEditors() { return model.selectedEditors; }
		override get ariaLabel() { return 'Editor Group 1'; }
		override getEditorByIndex(index: number) { return model.getEditorByIndex(index); }
		override getIndexOfEditor(editor: EditorInput) { return model.indexOf(editor); }
		override getEditors(order: EditorsOrder, opts?: { excludeSticky?: boolean }) { return model.getEditors(order, opts); }
		override isActive(editor: EditorInput) { return model.isActive(editor); }
		override isPinned(editorOrIndex: EditorInput | number) { return model.isPinned(editorOrIndex); }
		override isSticky(editorOrIndex: EditorInput | number) { return model.isSticky(editorOrIndex); }
		override isSelected(editorOrIndex: EditorInput | number) { return model.isSelected(editorOrIndex); }
		override createEditorActions(_disposables: DisposableStore, _menuId = MenuId.EditorTitle) { return { actions: { primary: [], secondary: [] }, onDidChange: Event.None }; }
		override relayout() { this.relayoutFn(); }
		// Mirrors the real EditorGroupView, which closes each editor on the underlying model.
		override async closeEditors(editors: EditorInput[] | ICloseEditorsFilter): Promise<boolean> {
			if (Array.isArray(editors)) {
				for (const editor of editors) {
					model.closeEditor(editor);
				}
			}
			return true;
		}
		override async closeEditor(editor: EditorInput | undefined = model.activeEditor ?? undefined): Promise<boolean> {
			if (editor) {
				model.closeEditor(editor);
			}
			return true;
		}
		override unstickEditor(editor: EditorInput): void {
			model.unstick(editor);
		}
	};

	const groupsView = new class extends mock<IEditorGroupsView>() {
		override get partOptions() { return partOptions; }
		override get activeGroup() { return groupView; }
		override get groups() { return [groupView]; }
		override readonly onDidChangeEditorPartOptions = Event.None;
		override readonly onDidVisibilityChange = Event.None;
	};

	// So actions resolved via @IEditorGroupsService operate on this same model when clicked for real, not the unrelated group workbenchInstantiationService() stubs by default.
	instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
		override getGroup(id: number) { return id === groupView.id ? groupView : undefined; }
		override get activeGroup() { return groupView; }
	});

	const editorPartsView = new class extends mock<IEditorPartsView>() {
		override get count() { return 1; }
		override getGroup() { return groupView; }
	};

	// Recreate the ancestor chain the tab-bar CSS/behavior is scoped to.
	const editorPart = $('.part.editor');
	const content = $('.content');
	const groupContainer = $('.editor-group-container.active');
	const titleContainer = $('.title');
	titleContainer.classList.toggle('tabs', partOptions.showTabs === 'multiple');
	titleContainer.classList.toggle('show-file-icons', partOptions.showIcons);

	const editorContainer = $('.editor-container');

	editorPart.appendChild(content);
	content.appendChild(groupContainer);
	groupContainer.appendChild(titleContainer);
	groupContainer.appendChild(editorContainer);
	container.appendChild(editorPart);

	container.style.width = `${width}px`;
	groupContainer.style.width = `${width}px`;

	const titleControl = disposableStore.add(instantiationService.createInstance(
		EditorTitleControl,
		titleContainer,
		editorPartsView,
		groupsView,
		groupView,
		model,
		undefined,
		false,
	));

	const layout = () => {
		titleControl.layout({
			container: new Dimension(width, titleControl.getHeight().total),
			available: new Dimension(width, 200),
		});
	};
	groupView.relayoutFn = layout;

	titleControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
	titleControl.setActive(true);
	layout();

	return { model, groupView, titleControl, titleContainer, layout };
}
