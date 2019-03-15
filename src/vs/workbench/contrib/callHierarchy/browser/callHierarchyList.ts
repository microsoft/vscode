/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyProvider, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import * as callHierarchyTree from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyTree';
import { Location, symbolKindToCssClass } from 'vs/editor/common/modes';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IView, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Disposable } from 'vs/base/common/lifecycle';

export type ListElement = callHierarchyTree.Call | Location;

class LocationTemplate {
	label: IconLabel;
}

export class LocationRenderer implements IListRenderer<Location, LocationTemplate> {

	static id = 'LocationRenderer';

	templateId: string = LocationRenderer.id;

	constructor(
		@ITextModelService private readonly _textModelService: ITextModelService,
	) { }

	renderTemplate(container: HTMLElement): LocationTemplate {
		const label = new IconLabel(container, { supportHighlights: true });
		return { label };
	}

	renderElement(element: Location, _index: number, template: LocationTemplate): void {
		this._textModelService.createModelReference(element.uri).then(reference => {
			const model = reference.object.textEditorModel;
			const text = model.getLineContent(element.range.startLineNumber);
			const indent = model.getLineFirstNonWhitespaceColumn(element.range.startLineNumber) - 1;

			const prefix = String(element.range.startLineNumber);
			const shift = (1 + indent /*left*/) - (prefix.length + 2 /*right*/);

			template.label.setLabel(`${prefix}: ${text.substr(indent)}`, undefined, {
				matches: [{ start: element.range.startColumn - shift, end: element.range.endColumn - shift }],
				extraClasses: ['location']
			});
			reference.dispose();
		});
	}

	disposeTemplate(template: LocationTemplate): void {
		template.label.dispose();
	}
}

class CallRenderingTemplate {
	iconLabel: IconLabel;
}

export class CallRenderer implements IListRenderer<callHierarchyTree.Call, CallRenderingTemplate> {

	static id = 'CallRenderer';

	templateId: string = CallRenderer.id;

	renderTemplate(container: HTMLElement): CallRenderingTemplate {
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		return { iconLabel };
	}

	renderElement(element: callHierarchyTree.Call, _index: number, template: CallRenderingTemplate): void {
		template.iconLabel.setLabel(
			element.item.name,
			element.item.detail,
			{
				labelEscapeNewLines: true,
				extraClasses: ['call', symbolKindToCssClass(element.item.kind, true)]
			}
		);
	}

	disposeTemplate(template: CallRenderingTemplate): void {
		template.iconLabel.dispose();
	}
}

export class Delegate implements IListVirtualDelegate<ListElement> {
	getHeight(element: ListElement): number {
		return 23;
	}
	getTemplateId(element: ListElement): string {
		if (element instanceof callHierarchyTree.Call) {
			return CallRenderer.id;
		} else {
			return LocationRenderer.id;
		}
	}
}


export class CallColumn extends Disposable implements IView {

	private _list: WorkbenchList<ListElement>;
	private _token: CancellationTokenSource;

	readonly element: HTMLElement = document.createElement('div');
	readonly minimumSize: number = 100;
	readonly maximumSize: number = Number.MAX_VALUE;

	private readonly _onDidChange = new Emitter<number | undefined>();
	readonly onDidChange: Event<number | undefined> = this._onDidChange.event;

	private readonly _fakeEvent = new UIEvent('fake');

	constructor(
		readonly index: number,
		readonly root: callHierarchyTree.Call,
		private readonly _provider: CallHierarchyProvider,
		private readonly _direction: CallHierarchyDirection,
		private readonly _emitter: Emitter<{ column: CallColumn, element: ListElement, focus: boolean }>,
		private readonly _getDim: () => Dimension,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		addClass(this.element, 'column');

		this._list = this._register(<WorkbenchList<ListElement>>this._instantiationService.createInstance(
			WorkbenchList,
			this.element,
			new Delegate(),
			[
				new CallRenderer(),
				this._instantiationService.createInstance(LocationRenderer)
			],
			{}
		));

		this._register(this._list.onFocusChange(e => {
			if (e.browserEvent !== this._fakeEvent && e.elements.length === 1) {
				this._emitter.fire({ column: this, element: e.elements[0], focus: true });
			}
		}));
		this._register(this._list.onSelectionChange(e => {
			if (e.browserEvent !== this._fakeEvent && e.elements.length === 1) {
				this._emitter.fire({ column: this, element: e.elements[0], focus: false });
			}
		}));

		this._token = this._register(new CancellationTokenSource());

		Promise.resolve(this._provider.resolveCallHierarchyItem(this.root.item, this._direction, this._token.token)).then(calls => {
			if (calls && calls.length > 0) {
				const input: ListElement[] = [];
				for (const [item, locations] of calls) {
					input.push(new callHierarchyTree.Call(this._direction, item, locations));
					input.push(...locations);
				}
				this._list.splice(0, this._list.length, input);
				this._list.focusFirst(this._fakeEvent);
				this._list.setSelection([0], this._fakeEvent);

			} else {
				// show message
			}
		}).catch(err => {
			console.error(err);
		});
	}

	layout(size: number, orientation: Orientation): void {
		const { height, width } = this._getDim();
		this._list.layout(height, Math.min(size, Math.ceil(width / 6)));
	}

	focus(): void {
		this._list.domFocus();
	}
}


export class LocationColumn extends Disposable implements IView {

	readonly element: HTMLElement = document.createElement('div');
	readonly minimumSize: number = 100;
	readonly maximumSize: number = Number.MAX_VALUE;

	private readonly _onDidChange = new Emitter<number | undefined>();
	readonly onDidChange: Event<number | undefined> = this._onDidChange.event;

	private _editor: EmbeddedCodeEditorWidget;

	constructor(
		private _location: Location,
		private readonly _getDim: () => Dimension,
		editor: ICodeEditor,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
		addClass(this.element, 'column');

		// todo@joh pretty random selection of options
		let options: IEditorOptions = {
			readOnly: true,
			scrollBeyondLastLine: false,
			lineNumbers: 'off',
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: {
				enabled: false
			},
			codeLens: false,
			glyphMargin: false,
		};

		this._editor = editor.invokeWithinContext(accessor => {
			return this._register(accessor.get(IInstantiationService).createInstance(EmbeddedCodeEditorWidget, this.element, options, editor));
		});

		this._textModelService.createModelReference(this._location.uri).then(reference => {
			this._editor.setModel(reference.object.textEditorModel);
			this._editor.revealRangeInCenter(this._location.range);
			this._editor.setSelection(this._location.range);
			this._register(reference);
		});
	}

	layout(size: number) {
		this._editor.layout({ height: this._getDim().height, width: size });
	}

	focus(): void {
		this._editor.focus();
	}
}

