/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { autorun, derived, observableFromEvent } from 'vs/base/common/observable';
import { IObservable, globalTransaction, observableValue } from 'vs/base/common/observableInternal/base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { DocumentDiffItemViewModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorViewModel';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IObjectData, IPooledObject } from './objectPool';
import { ActionRunnerWithContext } from './utils';

export class TemplateData implements IObjectData {
	constructor(
		public readonly viewModel: DocumentDiffItemViewModel,
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
			h('div.collapse-button@collapseButton'),
			h('div.title.show-file-icons@title', [] as any),
			h('div.actions@actions'),
		]),

		h('div.editorParent', [
			h('div.editorContainer@editor'),
		])
	]);

	public readonly editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
		overflowWidgetsDomNode: this._overflowWidgetsDomNode,
	}, {}));

	private readonly isModifedFocused = isFocused(this.editor.getModifiedEditor());
	private readonly isOriginalFocused = isFocused(this.editor.getOriginalEditor());
	public readonly isFocused = derived(this, reader => this.isModifedFocused.read(reader) || this.isOriginalFocused.read(reader));

	private readonly _resourceLabel = this._workbenchUIElementFactory.createResourceLabel
		? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.title))
		: undefined;

	private readonly _outerEditorHeight: number;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _overflowWidgetsDomNode: HTMLElement,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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

		this.editor.getModifiedEditor().onDidLayoutChange(e => {
			const width = this.editor.getModifiedEditor().getLayoutInfo().contentWidth;
			this._modifiedWidth.set(width, undefined);
		});

		this.editor.getOriginalEditor().onDidLayoutChange(e => {
			const width = this.editor.getOriginalEditor().getLayoutInfo().contentWidth;
			this._originalWidth.set(width, undefined);
		});

		this._register(this.editor.onDidContentSizeChange(e => {
			globalTransaction(tx => {
				this._editorContentHeight.set(e.contentHeight, tx);
				this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
				this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
			});
		}));

		this._register(autorun(reader => {
			const isFocused = this.isFocused.read(reader);
			this._elements.root.classList.toggle('focused', isFocused);
		}));

		this._container.appendChild(this._elements.root);
		this._outerEditorHeight = 38;

		this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.actions, MenuId.MultiDiffEditorFileToolbar, {
			actionRunner: this._register(new ActionRunnerWithContext(() => (this._viewModel.get()?.diffEditorViewModel?.model.modified.uri))),
			menuOptions: {
				shouldForwardArgs: true,
			},
			toolbarOptions: { primaryGroup: g => g.startsWith('navigation') },
		}));
	}

	public setScrollLeft(left: number): void {
		if (this._modifiedContentWidth.get() - this._modifiedWidth.get() > this._originalContentWidth.get() - this._originalWidth.get()) {
			this.editor.getModifiedEditor().setScrollLeft(left);
		} else {
			this.editor.getOriginalEditor().setScrollLeft(left);
		}
	}

	private readonly _dataStore = new DisposableStore();

	public setData(data: TemplateData): void {
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

		const value = data.viewModel.entry.value!; // TODO

		if (value.onOptionsDidChange) {
			this._dataStore.add(value.onOptionsDidChange(() => {
				this.editor.updateOptions(updateOptions(value.options ?? {}));
			}));
		}
		globalTransaction(tx => {
			this._resourceLabel?.setUri(data.viewModel.diffEditorViewModel.model.modified.uri);
			this._dataStore.clear();
			this._viewModel.set(data.viewModel, tx);
			this.editor.setModel(data.viewModel.diffEditorViewModel, tx);
			this.editor.updateOptions(updateOptions(value.options ?? {}));
		});
	}

	private readonly _headerHeight = /*this._elements.header.clientHeight*/ 38;

	public render(verticalRange: OffsetRange, width: number, editorScroll: number, viewPort: OffsetRange): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';

		// For sticky scroll
		const delta = Math.max(0, Math.min(verticalRange.length - this._headerHeight, viewPort.start - verticalRange.start));
		this._elements.header.style.transform = `translateY(${delta}px)`;

		globalTransaction(tx => {
			this.editor.layout({
				width: width,
				height: verticalRange.length - this._outerEditorHeight,
			});
		});
		this.editor.getOriginalEditor().setScrollTop(editorScroll);

		this._elements.header.classList.toggle('shadow', delta > 0 || editorScroll > 0);
	}

	public hide(): void {
		this._elements.root.style.top = `-100000px`;
		this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
	}
}

function isFocused(editor: ICodeEditor): IObservable<boolean> {
	return observableFromEvent(
		h => {
			const store = new DisposableStore();
			store.add(editor.onDidFocusEditorWidget(() => h(true)));
			store.add(editor.onDidBlurEditorWidget(() => h(false)));
			return store;
		},
		() => editor.hasWidgetFocus()
	);
}
