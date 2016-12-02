/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebysideEditor';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import { Disposable } from 'vs/base/common/lifecycle';
import * as DOM from 'vs/base/browser/dom';
import { Dimension, Builder } from 'vs/base/browser/builder';
import Event, { Emitter } from 'vs/base/common/event';

import { Registry } from 'vs/platform/platform';
import { IEditorRegistry, Extensions as EditorExtensions, EditorInput, EditorOptions, SideBySideEditorInput } from 'vs/workbench/common/editor';
import { BaseEditor, EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorControl, Position } from 'vs/platform/editor/common/editor';
import { Sash, ISashEvent, IVerticalSashLayoutProvider } from 'vs/base/browser/ui/sash/sash';

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class SideBySideEditor extends BaseEditor {

	public static ID: string = 'workbench.editor.sidebysideEditor';

	private dimension: Dimension;

	private masterEditor: BaseEditor;
	private masterEditorContainer: HTMLElement;

	private detailsEditor: BaseEditor;
	private detailsEditorContainer: HTMLElement;

	private sash: VSash;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(SideBySideEditor.ID, telemetryService);
	}

	public createEditor(parent: Builder) {
		const parentElement = parent.getHTMLElement();
		DOM.addClass(parentElement, 'side-by-side-editor');
		this.createSash(parentElement);
	}

	public setInput(newInput: SideBySideEditorInput, options: EditorOptions): TPromise<void> {
		const oldInput = <SideBySideEditorInput>this.getInput();
		return super.setInput(newInput, options)
			.then(() => this.updateInput(oldInput, newInput, options));
	}

	public setEditorVisible(visible: boolean, position: Position): void {
		if (this.masterEditor) {
			this.masterEditor.setVisible(visible);
		}
		if (this.detailsEditor) {
			this.detailsEditor.setVisible(visible);
		}
		super.setEditorVisible(visible, position);
	}

	public clearInput() {
		this.disposeEditors();
		super.clearInput();
	}

	public focus() {
		if (this.masterEditor) {
			this.masterEditor.focus();
		}
	}

	public layout(dimension: Dimension) {
		this.dimension = dimension;
		this.sash.setDimenesion(this.dimension);
	}

	public getControl(): IEditorControl {
		return this.masterEditor.getControl();
	}

	private updateInput(oldInput: SideBySideEditorInput, newInput: SideBySideEditorInput, options: EditorOptions): TPromise<void> {
		if (!newInput.matches(oldInput)) {
			if (oldInput) {
				this.disposeEditors();
			}
			this.createEditorContainers();
			return this.setNewInput(newInput, options);
		} else {
			this.detailsEditor.setInput(newInput.details, new EditorOptions());
			this.masterEditor.setInput(newInput.master, options);
		}
	}

	private setNewInput(newInput: SideBySideEditorInput, options: EditorOptions): TPromise<void> {
		return TPromise.join([
			this._createEditor(<EditorInput>newInput.details, this.detailsEditorContainer, new EditorOptions()), //TODO@ben why do you have to provide options
			this._createEditor(<EditorInput>newInput.master, this.masterEditorContainer, options)
		]).then(result => this.onEditorsCreated(result[0], result[1]));
	}

	private _createEditor(editorInput: EditorInput, container: HTMLElement, options: EditorOptions): TPromise<BaseEditor> {
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(editorInput);
		if (!descriptor) {
			return TPromise.wrapError(new Error(strings.format('Can not find a registered editor for the input {0}', editorInput)));
		}
		return this.instantiationService.createInstance(<EditorDescriptor>descriptor)
			.then((editor: BaseEditor) => {
				editor.create(new Builder(container));
				editor.setInput(editorInput, options);
				return editor;
			});
	}

	private onEditorsCreated(details: BaseEditor, master: BaseEditor) {
		this.detailsEditor = details;
		this.masterEditor = master;
		this.setVisible(this.isVisible());
		this.dolayout(this.sash.getVerticalSashLeft());
	}

	private createEditorContainers() {
		const parentElement = this.getContainer().getHTMLElement();
		this.detailsEditorContainer = DOM.append(parentElement, DOM.$('.details-editor-container'));
		this.detailsEditorContainer.style.position = 'absolute';
		this.masterEditorContainer = DOM.append(parentElement, DOM.$('.master-editor-container'));
		this.masterEditorContainer.style.position = 'absolute';
	}

	private createSash(parentElement: HTMLElement): void {
		this.sash = this._register(new VSash(parentElement));
		this._register(this.sash.onPositionChange(position => this.dolayout(position)));
	}

	private dolayout(splitPoint: number) {
		if (!this.detailsEditor || !this.masterEditor) {
			return;
		}
		const masterEditorWidth = this.dimension.width - splitPoint;
		const detailsEditorWidth = this.dimension.width - masterEditorWidth;

		this.detailsEditorContainer.style.width = `${detailsEditorWidth}px`;
		this.detailsEditorContainer.style.height = `${this.dimension.height}px`;
		this.detailsEditorContainer.style.left = '0px';

		this.masterEditorContainer.style.width = `${masterEditorWidth}px`;
		this.masterEditorContainer.style.height = `${this.dimension.height}px`;
		this.masterEditorContainer.style.left = `${splitPoint}px`;

		this.detailsEditor.layout(new Dimension(detailsEditorWidth, this.dimension.height));
		this.masterEditor.layout(new Dimension(masterEditorWidth, this.dimension.height));
	}

	private disposeEditors() {
		const parentContainer = this.getContainer().getHTMLElement();
		if (this.detailsEditor) {
			this.detailsEditor.dispose();
			this.detailsEditor = null;
		}
		if (this.masterEditor) {
			this.masterEditor.dispose();
			this.detailsEditor = null;
		}
		if (this.detailsEditorContainer) {
			parentContainer.removeChild(this.detailsEditorContainer);
			this.detailsEditorContainer = null;
		}
		if (this.masterEditorContainer) {
			parentContainer.removeChild(this.masterEditorContainer);
			this.masterEditorContainer = null;
		}
	}
}

class VSash extends Disposable implements IVerticalSashLayoutProvider {

	private static MINIMUM_EDITOR_WIDTH = 220;

	private sash: Sash;
	private ratio: number;
	private startPosition: number;
	private position: number;
	private dimension: Dimension;

	private _onPositionChange: Emitter<number> = new Emitter<number>();
	public get onPositionChange(): Event<number> { return this._onPositionChange.event; }

	constructor(container: HTMLElement) {
		super();
		this.ratio = 0.5;
		this.sash = new Sash(container, this);

		this._register(this.sash.addListener2('start', () => this.onSashDragStart()));
		this._register(this.sash.addListener2('change', (e: ISashEvent) => this.onSashDrag(e)));
		this._register(this.sash.addListener2('end', () => this.onSashDragEnd()));
		this._register(this.sash.addListener2('reset', () => this.onSashReset()));
	}

	public getVerticalSashTop(): number {
		return 0;
	}

	public getVerticalSashLeft(): number {
		return this.position;
	}

	public getVerticalSashHeight(): number {
		return this.dimension.height;
	}

	public setDimenesion(dimension: Dimension) {
		this.dimension = dimension;
		this.compute(this.ratio);
	}

	private onSashDragStart(): void {
		this.startPosition = this.position;
	}

	private onSashDrag(e: ISashEvent): void {
		this.compute((this.startPosition + (e.currentX - e.startX)) / this.dimension.width);
	}

	private compute(ratio: number) {
		this.computeSashPosition(ratio);
		this.ratio = this.position / this.dimension.width;
		this._onPositionChange.fire(this.position);
	}

	private onSashDragEnd(): void {
		this.sash.layout();
	}

	private onSashReset(): void {
		this.ratio = 0.5;
		this._onPositionChange.fire(this.position);
		this.sash.layout();
	}

	private computeSashPosition(sashRatio: number = this.ratio) {
		let contentWidth = this.dimension.width;
		let sashPosition = Math.floor((sashRatio || 0.5) * contentWidth);
		let midPoint = Math.floor(0.5 * contentWidth);

		if (contentWidth > VSash.MINIMUM_EDITOR_WIDTH * 2) {
			if (sashPosition < VSash.MINIMUM_EDITOR_WIDTH) {
				sashPosition = VSash.MINIMUM_EDITOR_WIDTH;
			}
			if (sashPosition > contentWidth - VSash.MINIMUM_EDITOR_WIDTH) {
				sashPosition = contentWidth - VSash.MINIMUM_EDITOR_WIDTH;
			}
		} else {
			sashPosition = midPoint;
		}
		if (this.position !== sashPosition) {
			this.position = sashPosition;
			this.sash.layout();
		}
	}
}