/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/mergeEditor';
import { Dimension, reset } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorControl, IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { BugIndicatingError } from 'vs/base/common/errors';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Direction, Grid, IView, IViewSize, SerializableGrid } from 'vs/base/browser/ui/grid/grid';
import { Orientation, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { ITextModel } from 'vs/editor/common/model';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { settingsSashBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { Color } from 'vs/base/common/color';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { localize } from 'vs/nls';
import { ILabelService } from 'vs/platform/label/common/label';
import { FloatingClickWidget } from 'vs/workbench/browser/codeeditor';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IAction } from 'vs/base/common/actions';

export const ctxIsMergeEditor = new RawContextKey<boolean>('isMergeEditor', false);
export const ctxUsesColumnLayout = new RawContextKey<boolean>('mergeEditorUsesColumnLayout', false);

export class MergeEditor extends EditorPane {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();

	private _grid!: Grid<CodeEditorView>;

	private readonly inputOneView = this.instantiation.createInstance(CodeEditorView, { readonly: true });
	private readonly inputTwoView = this.instantiation.createInstance(CodeEditorView, { readonly: true });
	private readonly inputResultView = this.instantiation.createInstance(CodeEditorView, { readonly: false });

	private readonly _ctxIsMergeEditor: IContextKey<boolean>;
	private readonly _ctxUsesColumnLayout: IContextKey<boolean>;

	constructor(
		@IInstantiationService private readonly instantiation: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super(MergeEditor.ID, telemetryService, themeService, storageService);

		this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(_contextKeyService);
		this._ctxUsesColumnLayout = ctxUsesColumnLayout.bindTo(_contextKeyService);

		const reentrancyBarrier = new ReentrancyBarrier();
		this._store.add(this.inputOneView.editor.onDidScrollChange(c => {
			if (c.scrollTopChanged) {
				reentrancyBarrier.runExclusively(() => {
					this.inputTwoView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					this.inputResultView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
				});
			}
		}));
		this._store.add(this.inputTwoView.editor.onDidScrollChange(c => {
			if (c.scrollTopChanged) {
				reentrancyBarrier.runExclusively(() => {
					this.inputOneView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					this.inputResultView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
				});
			}
		}));
		this._store.add(this.inputResultView.editor.onDidScrollChange(c => {
			if (c.scrollTopChanged) {
				reentrancyBarrier.runExclusively(() => {
					this.inputOneView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					this.inputTwoView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
				});
			}
		}));

		// TODO@jrieken make this proper: add menu id and allow extensions to contribute
		const toolbarMenu = this._menuService.createMenu(MenuId.MergeToolbar, this._contextKeyService);
		const toolbarMenuDisposables = new DisposableStore();
		const toolbarMenuRender = () => {
			toolbarMenuDisposables.clear();

			const actions: IAction[] = [];
			createAndFillInActionBarActions(toolbarMenu, { renderShortTitle: true, shouldForwardArgs: true }, actions);
			if (actions.length > 0) {
				const [first] = actions;
				const acceptBtn = this.instantiation.createInstance(FloatingClickWidget, this.inputResultView.editor, first.label, first.id);
				toolbarMenuDisposables.add(acceptBtn.onClick(() => first.run(this.inputResultView.editor.getModel()?.uri)));
				toolbarMenuDisposables.add(acceptBtn);
				acceptBtn.render();
			}
		};
		this._store.add(toolbarMenu);
		this._store.add(toolbarMenuDisposables);
		this._store.add(toolbarMenu.onDidChange(toolbarMenuRender));
		toolbarMenuRender();
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		this._ctxIsMergeEditor.reset();
		super.dispose();
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('merge-editor');

		this._grid = SerializableGrid.from<any /*TODO@jrieken*/>({
			orientation: Orientation.VERTICAL,
			size: 100,
			groups: [
				{
					size: 38,
					groups: [{
						data: this.inputOneView
					}, {
						data: this.inputTwoView
					}]
				},
				{
					size: 62,
					data: this.inputResultView
				},
			]
		}, {
			styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
			proportionalLayout: true
		});

		reset(parent, this._grid.element);
		this._ctxUsesColumnLayout.set(false);
	}

	layout(dimension: Dimension): void {
		this._grid.layout(dimension.width, dimension.height);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!(input instanceof MergeEditorInput)) {
			throw new BugIndicatingError('ONLY MergeEditorInput is supported');
		}
		await super.setInput(input, options, context, token);

		this._sessionDisposables.clear();
		const model = await input.resolve();

		this.inputOneView.setModel(model.input1, localize('yours', 'Yours'), undefined);
		this.inputTwoView.setModel(model.input2, localize('theirs', 'Theirs',), undefined);
		this.inputResultView.setModel(model.result, localize('result', 'Result',), this._labelService.getUriLabel(model.result.uri, { relative: true }));
	}

	protected override setEditorVisible(visible: boolean): void {
		this._ctxIsMergeEditor.set(visible);
	}

	// ---- interact with "outside world" via `getControl`, `scopedContextKeyService`

	override getControl(): IEditorControl | undefined {
		for (const view of [this.inputOneView, this.inputTwoView, this.inputResultView]) {
			if (view.editor.hasWidgetFocus()) {
				return view.editor;
			}
		}
		return undefined;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		const control = this.getControl();
		return isCodeEditor(control)
			? control.invokeWithinContext(accessor => accessor.get(IContextKeyService))
			: undefined;
	}

	// --- layout

	private _usesColumnLayout = false;

	toggleLayout(): void {
		if (!this._usesColumnLayout) {
			this._grid.moveView(this.inputResultView, Sizing.Distribute, this.inputOneView, Direction.Right);
		} else {
			this._grid.moveView(this.inputResultView, this._grid.height * .62, this.inputOneView, Direction.Down);
			this._grid.moveView(this.inputTwoView, Sizing.Distribute, this.inputOneView, Direction.Right);
		}
		this._usesColumnLayout = !this._usesColumnLayout;
		this._ctxUsesColumnLayout.set(this._usesColumnLayout);
	}
}

interface ICodeEditorViewOptions {
	readonly: boolean;
}

class CodeEditorView implements IView {

	// preferredWidth?: number | undefined;
	// preferredHeight?: number | undefined;

	element: HTMLElement = document.createElement('div');
	private _titleElement = document.createElement('div');
	private _editorElement = document.createElement('div');

	minimumWidth: number = 10;
	maximumWidth: number = Number.MAX_SAFE_INTEGER;
	minimumHeight: number = 10;
	maximumHeight: number = Number.MAX_SAFE_INTEGER;
	// priority?: LayoutPriority | undefined;
	// snap?: boolean | undefined;

	private readonly _onDidChange = new Emitter<IViewSize | undefined>();
	readonly onDidChange = this._onDidChange.event;

	private _title = new IconLabel(this._titleElement, { supportIcons: true });

	public readonly editor = this.instantiationService.createInstance(
		CodeEditorWidget,
		this._editorElement,
		{ minimap: { enabled: false }, readOnly: this._options.readonly },
		{}
	);


	constructor(
		private readonly _options: ICodeEditorViewOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.element.classList.add('code-view');
		this._titleElement.classList.add('title');
		this.element.appendChild(this._titleElement);
		this.element.appendChild(this._editorElement);
	}

	public setModel(model: ITextModel, title: string, description: string | undefined): void {
		this.editor.setModel(model);
		this._title.setLabel(title, description);
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		this.element.style.top = `${top}px`;
		this.element.style.left = `${left}px`;
		this.editor.layout({ width, height: height - this._titleElement.clientHeight });
	}
}

class ReentrancyBarrier {
	private isActive = false;

	public runExclusively(fn: () => void): void {
		if (this.isActive) {
			return;
		}
		this.isActive = true;
		try {
			fn();
		} finally {
			this.isActive = false;
		}
	}
}
