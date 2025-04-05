/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, globalTransaction, observableValue } from '../../../../base/common/observable.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, type IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { OffsetRange } from '../../../common/core/offsetRange.js';
import { observableCodeEditor } from '../../observableCodeEditor.js';
import { DiffEditorWidget } from '../diffEditor/diffEditorWidget.js';
import { DocumentDiffItemViewModel } from './multiDiffEditorViewModel.js';
import { IObjectData, IPooledObject } from './objectPool.js';
import { ActionRunnerWithContext } from './utils.js';
import { IWorkbenchUIElementFactory } from './workbenchUIElementFactory.js';

export class TemplateData implements IObjectData {
	constructor(
		public readonly viewModel: DocumentDiffItemViewModel,
		public readonly deltaScrollVertical: (delta: number) => void,
	) { }


	getId(): unknown {
		return this.viewModel;
	}
}

export class DiffEditorItemTemplate extends Disposable implements IPooledObject<TemplateData> {
	private readonly _viewModel = observableValue<DocumentDiffItemViewModel | undefined>(this, undefined);

	private readonly _collapsed = derived(this, reader => this._viewModel.read(reader)?.collapsed.read(reader));

	private readonly _editorContentHeight = observableValue<number>(this, 500);
	public readonly contentHeight = derived(this, reader => {
		const h = this._collapsed.read(reader) ? 0 : this._editorContentHeight.read(reader);
		return h + this._outerEditorHeight;
	});

	private readonly _modifiedContentWidth = observableValue<number>(this, 0);
	private readonly _modifiedWidth = observableValue<number>(this, 0);
	private readonly _originalContentWidth = observableValue<number>(this, 0);
	private readonly _originalWidth = observableValue<number>(this, 0);

	public readonly maxScroll = derived(this, reader => {
		const scroll1 = this._modifiedContentWidth.read(reader) - this._modifiedWidth.read(reader);
		const scroll2 = this._originalContentWidth.read(reader) - this._originalWidth.read(reader);
		if (scroll1 > scroll2) {
			return { maxScroll: scroll1, width: this._modifiedWidth.read(reader) };
		} else {
			return { maxScroll: scroll2, width: this._originalWidth.read(reader) };
		}
	});

	private readonly _elements = h('div.multiDiffEntry', [
		h('div.header@header', [
			h('div.header-content', [
				h('div.collapse-button@collapseButton'),
				h('div.file-path', [
					h('div.title.modified.show-file-icons@primaryPath', [] as any),
					h('div.status.deleted@status', ['R']),
					h('div.title.original.show-file-icons@secondaryPath', [] as any),
				]),
				h('div.actions@actions'),
			]),
		]),

		h('div.editorParent', [
			h('div.editorContainer@editor'),
		])
	]) as Record<string, HTMLElement>;

	public readonly editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
		overflowWidgetsDomNode: this._overflowWidgetsDomNode,
	}, {}));

	private readonly isModifedFocused = observableCodeEditor(this.editor.getModifiedEditor()).isFocused;
	private readonly isOriginalFocused = observableCodeEditor(this.editor.getOriginalEditor()).isFocused;
	public readonly isFocused = derived(this, reader => this.isModifedFocused.read(reader) || this.isOriginalFocused.read(reader));

	private readonly _resourceLabel = this._workbenchUIElementFactory.createResourceLabel
		? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.primaryPath))
		: undefined;

	private readonly _resourceLabel2 = this._workbenchUIElementFactory.createResourceLabel
		? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.secondaryPath))
		: undefined;

	private readonly _outerEditorHeight: number;
	private readonly _contextKeyService: IScopedContextKeyService;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _overflowWidgetsDomNode: HTMLElement,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService _parentContextKeyService: IContextKeyService,
	) {
		super();

		const btn = new Button(this._elements.collapseButton, {});

		this._register(autorun(reader => {
			btn.element.className = '';
			btn.icon = this._collapsed.read(reader) ? Codicon.chevronRight : Codicon.chevronDown;
		}));
		this._register(btn.onDidClick(() => {
			this._viewModel.get()?.collapsed.set(!this._collapsed.get(), undefined);
		}));

		this._register(autorun(reader => {
			this._elements.editor.style.display = this._collapsed.read(reader) ? 'none' : 'block';
		}));

		this._register(this.editor.getModifiedEditor().onDidLayoutChange(e => {
			const width = this.editor.getModifiedEditor().getLayoutInfo().contentWidth;
			this._modifiedWidth.set(width, undefined);
		}));

		this._register(this.editor.getOriginalEditor().onDidLayoutChange(e => {
			const width = this.editor.getOriginalEditor().getLayoutInfo().contentWidth;
			this._originalWidth.set(width, undefined);
		}));

		this._register(this.editor.onDidContentSizeChange(e => {
			globalTransaction(tx => {
				this._editorContentHeight.set(e.contentHeight, tx);
				this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
				this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
			});
		}));

		this._register(this.editor.getOriginalEditor().onDidScrollChange(e => {
			if (this._isSettingScrollTop) {
				return;
			}

			if (!e.scrollTopChanged || !this._data) {
				return;
			}
			const delta = e.scrollTop - this._lastScrollTop;
			this._data.deltaScrollVertical(delta);
		}));

		this._register(autorun(reader => {
			const isActive = this._viewModel.read(reader)?.isActive.read(reader);
			this._elements.root.classList.toggle('active', isActive);
		}));

		this._container.appendChild(this._elements.root);
		this._outerEditorHeight = this._headerHeight;

		this._contextKeyService = this._register(_parentContextKeyService.createScoped(this._elements.actions));
		const instantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
		this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.actions, MenuId.MultiDiffEditorFileToolbar, {
			actionRunner: this._register(new ActionRunnerWithContext(() => (this._viewModel.get()?.modifiedUri))),
			menuOptions: {
				shouldForwardArgs: true,
			},
			toolbarOptions: { primaryGroup: g => g.startsWith('navigation') },
			actionViewItemProvider: (action, options) => createActionViewItem(instantiationService, action, options),
		}));
	}

	public setScrollLeft(left: number): void {
		if (this._modifiedContentWidth.get() - this._modifiedWidth.get() > this._originalContentWidth.get() - this._originalWidth.get()) {
			this.editor.getModifiedEditor().setScrollLeft(left);
		} else {
			this.editor.getOriginalEditor().setScrollLeft(left);
		}
	}

	private readonly _dataStore = this._register(new DisposableStore());

	private _data: TemplateData | undefined;

	public setData(data: TemplateData | undefined): void {
		this._data = data;
		function updateOptions(options: IDiffEditorOptions): IDiffEditorOptions {
			return {
				...options,
				scrollBeyondLastLine: false,
				hideUnchangedRegions: {
					enabled: true,
				},
				scrollbar: {
					vertical: 'hidden',
					horizontal: 'hidden',
					handleMouseWheel: false,
					useShadows: false,
				},
				renderOverviewRuler: false,
				fixedOverflowWidgets: true,
				overviewRulerBorder: false,
			};
		}

		if (!data) {
			globalTransaction(tx => {
				this._viewModel.set(undefined, tx);
				this.editor.setDiffModel(null, tx);
				this._dataStore.clear();
			});
			return;
		}

		const value = data.viewModel.documentDiffItem;

		globalTransaction(tx => {
			this._resourceLabel?.setUri(data.viewModel.modifiedUri ?? data.viewModel.originalUri!, { strikethrough: data.viewModel.modifiedUri === undefined });

			let isRenamed = false;
			let isDeleted = false;
			let isAdded = false;
			let flag = '';
			if (data.viewModel.modifiedUri && data.viewModel.originalUri && data.viewModel.modifiedUri.path !== data.viewModel.originalUri.path) {
				flag = 'R';
				isRenamed = true;
			} else if (!data.viewModel.modifiedUri) {
				flag = 'D';
				isDeleted = true;
			} else if (!data.viewModel.originalUri) {
				flag = 'A';
				isAdded = true;
			}
			this._elements.status.classList.toggle('renamed', isRenamed);
			this._elements.status.classList.toggle('deleted', isDeleted);
			this._elements.status.classList.toggle('added', isAdded);
			this._elements.status.innerText = flag;

			this._resourceLabel2?.setUri(isRenamed ? data.viewModel.originalUri : undefined, { strikethrough: true });

			this._dataStore.clear();
			this._viewModel.set(data.viewModel, tx);
			this.editor.setDiffModel(data.viewModel.diffEditorViewModelRef, tx);
			this.editor.updateOptions(updateOptions(value.options ?? {}));
		});
		if (value.onOptionsDidChange) {
			this._dataStore.add(value.onOptionsDidChange(() => {
				this.editor.updateOptions(updateOptions(value.options ?? {}));
			}));
		}
		data.viewModel.isAlive.recomputeInitiallyAndOnChange(this._dataStore, value => {
			if (!value) {
				this.setData(undefined);
			}
		});

		if (data.viewModel.documentDiffItem.contextKeys) {
			for (const [key, value] of Object.entries(data.viewModel.documentDiffItem.contextKeys)) {
				this._contextKeyService.createKey(key, value);
			}
		}
	}

	private readonly _headerHeight = /*this._elements.header.clientHeight*/ 40;

	private _lastScrollTop = -1;
	private _isSettingScrollTop = false;

	public render(verticalRange: OffsetRange, width: number, editorScroll: number, viewPort: OffsetRange): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';

		// For sticky scroll
		const maxDelta = verticalRange.length - this._headerHeight;
		const delta = Math.max(0, Math.min(viewPort.start - verticalRange.start, maxDelta));
		this._elements.header.style.transform = `translateY(${delta}px)`;

		globalTransaction(tx => {
			this.editor.layout({
				width: width - 2 * 8 - 2 * 1,
				height: verticalRange.length - this._outerEditorHeight,
			});
		});
		try {
			this._isSettingScrollTop = true;
			this._lastScrollTop = editorScroll;
			this.editor.getOriginalEditor().setScrollTop(editorScroll);
		} finally {
			this._isSettingScrollTop = false;
		}

		this._elements.header.classList.toggle('shadow', delta > 0 || editorScroll > 0);
		this._elements.header.classList.toggle('collapsed', delta === maxDelta);
	}

	public hide(): void {
		this._elements.root.style.top = `-100000px`;
		this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
	}
}
