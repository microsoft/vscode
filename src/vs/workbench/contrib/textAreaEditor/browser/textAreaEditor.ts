/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/textareaeditor';
import { addDisposableListener, Dimension } from 'vs/base/browser/dom';
import { bufferToStream, VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { TextAreaEditorInput } from 'vs/workbench/contrib/textAreaEditor/browser/textAreaEditorInput';
import { TextAreaEditorFileWorkingCopyModel } from 'vs/workbench/contrib/textAreaEditor/browser/textAreaEditorWorkingCopy';

export class TextAreaEditor extends EditorPane {

	static readonly ID = 'textAreaEditor';

	private editorControl: TextAreaControl | undefined = undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(TextAreaEditor.ID, telemetryService, themeService, storageService);
	}

	override getTitle(): string {
		return this.input ? this.input.getName() : 'Text Area Editor';
	}

	override async setInput(input: TextAreaEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		const model = withNullAsUndefined(await input.resolve());
		if (model) {
			input.setQueryString(this.extractQueryFromModel(model));
			this._register(model.onDidChangeContent(() => {
				input.setQueryString(this.extractQueryFromModel(model));
			}));
		}
		this.editorControl?.setModel(model);
	}

	private extractQueryFromModel(model: TextAreaEditorFileWorkingCopyModel): string {
		const full = (model.getValue() ?? '') + '\n';
		const firstLineEnd = full.indexOf('\n');
		if (firstLineEnd > 10) {
			return full.slice(0, 10) + '...';
		}
		return full.slice(0, firstLineEnd);
	}

	protected createEditor(parent: HTMLElement): void {
		this.editorControl = this._register(new TextAreaControl());
		this.editorControl.create(parent);
	}

	override focus(): void {
		this.editorControl?.focus();
	}

	override clearInput(): void {
		this.editorControl?.setModel(undefined);

		super.clearInput();
	}

	override getControl(): TextAreaControl | undefined {
		return this.editorControl;
	}

	layout(dimension: Dimension): void { }
}

class TextAreaControl extends Disposable implements ICompositeControl {

	private textArea = document.createElement('textarea');

	private model: TextAreaEditorFileWorkingCopyModel | undefined = undefined;
	private modelListeners = this._register(new MutableDisposable());

	setModel(model: TextAreaEditorFileWorkingCopyModel | undefined): void {
		if (model) {
			this.bindModel(model);
		} else {
			this.unbindModel();
		}
	}

	private bindModel(model: TextAreaEditorFileWorkingCopyModel): void {
		this.model = model;
		this.setValue(model.getValue());

		this.modelListeners.value = model.onDidChangeContent(() => this.setValue(model.getValue()));
	}

	private unbindModel(): void {
		this.model = undefined;
		this.modelListeners.clear();

		this.clearValue();
	}

	private getValue(): string {
		return this.textArea.value;
	}

	private setValue(value: string): void {
		this.textArea.value = value;
	}

	private clearValue(): void {
		this.textArea.value = '';
	}

	create(parent: HTMLElement): void {

		// Our widget is a <textArea>
		this.textArea = document.createElement('textarea');
		this.textArea.classList.add('textarea-editor-input');
		parent.appendChild(this.textArea);

		// Listen for changes
		this._register(addDisposableListener(this.textArea, 'input', () => this.onDidChangeTextAreaContents()));
	}

	private onDidChangeTextAreaContents(): void {
		this.model?.update(bufferToStream(VSBuffer.fromString(this.getValue())), CancellationToken.None);
	}

	focus(): void {
		this.textArea.focus();
	}
}
