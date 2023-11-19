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
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { IDocumentDiffItem } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IObjectData, IPooledObject } from './objectPool';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class TemplateData implements IObjectData {
	constructor(
		public readonly viewModel: IDiffEditorViewModel,
		public readonly entry: IDocumentDiffItem,
	) { }


	getId(): unknown {
		return this.entry;
	}
}

export class DiffEditorItemTemplate extends Disposable implements IPooledObject<TemplateData> {
	private readonly _contentHeight = observableValue<number>(this, 500);
	public readonly height = derived(this, reader => {
		const h = this._collapsed.read(reader) ? 0 : this._contentHeight.read(reader);
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

	private readonly _collapsed = observableValue<boolean>(this, false);

	private readonly _elements = h('div', {
		style: {
			display: 'flex',
			flexDirection: 'column',
		}
	}, [
		h('div', {
			style: {
				display: 'flex',
				flexDirection: 'column',

				flex: '1',
				overflow: 'hidden',
			}
		}, [
			h('div@header', { style: { display: 'flex', alignItems: 'center', padding: '8px 5px', color: 'var(--vscode-foreground)', background: 'var(--vscode-editor-background)', zIndex: '10000' } }, [
				h('div.expand-button@collapseButton', { style: { margin: '0 5px' } }),
				h('div.show-file-icons@title', { style: { fontSize: '14px', lineHeight: '22px' } }, [] as any),
			]),

			h('div', {
				style: {
					flex: '1',
					display: 'flex',
					flexDirection: 'column',
				}
			}, [
				h('div@editor', { style: { flex: '1' } }),
			])
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
			this._collapsed.set(!this._collapsed.get(), undefined);
			this._elements.editor.style.display = this._collapsed.get() ? 'none' : 'block';
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
				this._contentHeight.set(e.contentHeight, tx);
				this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
				this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
			});
		}));

		this._container.appendChild(this._elements.root);
		this._outerEditorHeight = 38;
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
		this._resourceLabel?.setUri(data.viewModel.model.modified.uri);
		this._dataStore.clear();

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
				},
				renderOverviewRuler: false,
				fixedOverflowWidgets: true,
			};
		}

		if (data.entry.onOptionsDidChange) {
			this._dataStore.add(data.entry.onOptionsDidChange(() => {
				this.editor.updateOptions(updateOptions(data.entry.options ?? {}));
			}));
		}
		globalTransaction(tx => {
			this.editor.setModel(data.viewModel, tx);
			this.editor.updateOptions(updateOptions(data.entry.options ?? {}));
		});
	}

	public render(verticalRange: OffsetRange, width: number, editorScroll: number, viewPort: OffsetRange): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';

		// For sticky scroll
		this._elements.header.style.transform = `translateY(${Math.max(0, Math.min(verticalRange.length - this._elements.header.clientHeight, viewPort.start - verticalRange.start))}px)`;

		globalTransaction(tx => {
			this.editor.layout({
				width: width,
				height: verticalRange.length - this._outerEditorHeight,
			});
		});
		this.editor.getOriginalEditor().setScrollTop(editorScroll);
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
