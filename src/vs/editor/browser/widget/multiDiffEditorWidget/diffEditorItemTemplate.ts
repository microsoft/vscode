/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { autorun, derived } from 'vs/base/common/observable';
import { globalTransaction, observableValue } from 'vs/base/common/observableInternal/base';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { IDiffEntry } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IObjectData, IPooledObject } from './objectPool';


export class TemplateData implements IObjectData {
	constructor(
		public readonly viewModel: IDiffEditorViewModel,
		public readonly entry: IDiffEntry
	) { }


	getId(): unknown {
		return this.entry;
	}
}

export class DiffEditorItemTemplate extends Disposable implements IPooledObject<TemplateData> {
	private readonly _contentHeight = observableValue<number>(this, 500);
	private readonly _collapsed = observableValue<boolean>(this, false);
	public readonly height = derived(this, reader => {
		const h = this._collapsed.read(reader) ? 0 : this._contentHeight.read(reader);
		return h + this._outerEditorHeight;
	});

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

	private readonly _editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
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
		overflowWidgetsDomNode: this._overflowWidgetsDomNode,
	}, {}));

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

		this._register(this._editor.onDidContentSizeChange(e => {
			globalTransaction(tx => {
				this._contentHeight.set(e.contentHeight, tx);
			});
		}));

		this._container.appendChild(this._elements.root);

		this._outerEditorHeight = 38; //this._elements.header.clientHeight; //this._elements.root.clientHeight - this._elements.editor.clientHeight;
		//console.log('outerEditorHeight', this._outerEditorHeight);
	}

	public setData(data: TemplateData) {
		this._resourceLabel?.setUri(data.viewModel.model.modified.uri);
		globalTransaction(tx => {
			this._editor.setModel(data.viewModel, tx);
		});
	}

	public hide(): void {
		this._elements.root.style.top = `-100000px`;
		this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
	}

	public render(verticalRange: OffsetRange, width: number, editorScroll: number, viewPort: OffsetRange): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';


		this._elements.header.style.transform = `translateY(${Math.max(0, Math.min(verticalRange.length - this._elements.header.clientHeight, viewPort.start - verticalRange.start))}px)`;

		globalTransaction(tx => {
			this._editor.layout({
				width: width,
				height: verticalRange.length - this._outerEditorHeight,
			});
		});
		this._editor.getOriginalEditor().setScrollTop(editorScroll);
	}
}
