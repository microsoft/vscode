/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISettableObservable } from 'vs/base/common/observable';
import { globalTransaction } from 'vs/base/common/observableInternal/base';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { IDiffEntry } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IObjectData, IPooledObject } from './objectPool';


export class TemplateData implements IObjectData {
	constructor(
		public readonly height: ISettableObservable<number>,
		public readonly viewModel: IDiffEditorViewModel,
		public readonly entry: IDiffEntry
	) { }


	getId(): unknown {
		return this.entry;
	}
}

export class DiffEditorItemTemplate extends Disposable implements IPooledObject<TemplateData> {
	private _height: number = 500;
	private _heightObs: ISettableObservable<number> | undefined = undefined;

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
				border: '1px solid #4d4d4d',
				borderRadius: '5px',
				overflow: 'hidden',
				margin: '10px 10px 10px 10px',
			}
		}, [
			h('div', { style: { display: 'flex', alignItems: 'center', padding: '8px 5px', background: 'var(--vscode-multiDiffEditor-headerBackground)', color: 'black' } }, [
				//h('div.expand-button@collapseButton', { style: { margin: '0 5px' } }),
				h('div@title', { style: { fontSize: '14px' } }, ['Title'] as any),
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
			horizontal: 'visible',
			handleMouseWheel: false,
		},
		renderOverviewRuler: false,
		fixedOverflowWidgets: true,
		overflowWidgetsDomNode: this._overflowWidgetsDomNode, // TODO
	}, {}));

	constructor(
		private readonly _container: HTMLElement,
		private readonly _overflowWidgetsDomNode: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService
	) {
		super();

		// TODO@hediet
		/*
		const btn = new Button(this._elements.collapseButton, {});
		btn.icon = Codicon.chevronDown;
		*/
		this._register(this._editor.onDidContentSizeChange(e => {
			this._height = e.contentHeight + this._elements.root.clientHeight - this._elements.editor.clientHeight;
			globalTransaction(tx => {
				this._heightObs?.set(this._height, tx);
			});
		}));

		this._container.appendChild(this._elements.root);
	}

	public setData(data: TemplateData) {
		this._heightObs = data.height;
		this._elements.title.innerText = this._labelService.getUriLabel(data.viewModel.model.modified.uri, { relative: true }); // data.entry.title;
		globalTransaction(tx => {
			this._editor.setModel(data.viewModel, tx);
			this._heightObs!.set(this._height, tx);
		});
	}

	public hide(): void {
		this._elements.root.style.top = `-100000px`;
		this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
	}

	public render(verticalRange: OffsetRange, width: number, editorScroll: number): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';
		this._editor.layout({ width, height: verticalRange.length });
		this._editor.getOriginalEditor().setScrollTop(editorScroll);
	}
}
