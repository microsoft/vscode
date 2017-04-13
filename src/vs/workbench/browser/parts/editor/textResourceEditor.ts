/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import types = require('vs/base/common/types');
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/editorCommon';
import { TextEditorOptions, EditorModel, EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import URI from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

/**
 * An editor implementation that is capable of showing the contents of resource inputs. Uses
 * the TextEditor widget to show the contents.
 */
export class TextResourceEditor extends BaseTextEditor {

	public static ID = 'workbench.editors.textResourceEditor';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IModeService modeService: IModeService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(TextResourceEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, modeService, textFileService, editorGroupService);

		this.toUnbind.push(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDirtyChange(e)));
	}

	private onUntitledDirtyChange(resource: URI): void {
		if (!this.untitledEditorService.isDirty(resource)) {
			this.clearTextEditorViewState([resource.toString()]); // untitled file got reverted, so remove view state
		}
	}

	public getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textEditor', "Text Editor");
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		const oldInput = this.input;
		super.setInput(input, options);

		// Detect options
		const forceOpen = options && options.forceOpen;

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {

			// TextOptions (avoiding instanceof here for a reason, do not change!)
			const textOptions = <TextEditorOptions>options;
			if (textOptions && types.isFunction(textOptions.apply)) {
				textOptions.apply(this.getControl());
			}

			return TPromise.as<void>(null);
		}

		// Remember view settings if input changes
		this.saveTextEditorViewState(oldInput);

		// Different Input (Reload)
		return input.resolve(true).then((resolvedModel: EditorModel) => {

			// Assert Model instance
			if (!(resolvedModel instanceof BaseTextEditorModel)) {
				return TPromise.wrapError<void>('Unable to open file as text');
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
			if (!this.input || this.input !== input) {
				return null;
			}

			// Set Editor Model
			const textEditor = this.getControl();
			const textEditorModel = resolvedModel.textEditorModel;
			textEditor.setModel(textEditorModel);

			// Apply Options from TextOptions
			let optionsGotApplied = false;
			const textOptions = <TextEditorOptions>options;
			if (textOptions && types.isFunction(textOptions.apply)) {
				optionsGotApplied = textOptions.apply(textEditor);
			}

			// Otherwise restore View State
			if (!optionsGotApplied) {
				this.restoreViewState(input);
			}
			return undefined;
		});
	}

	protected restoreViewState(input: EditorInput) {
		if (input instanceof UntitledEditorInput) {
			const viewState = this.loadTextEditorViewState(input.getResource().toString());
			if (viewState) {
				this.getControl().restoreViewState(viewState);
			}
		}
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const options = super.getConfigurationOverrides();

		options.readOnly = !(this.input instanceof UntitledEditorInput); // all resource editors are readonly except for the untitled one;

		return options;
	}

	protected getAriaLabel(): string {
		const input = this.input;
		const isReadonly = !(this.input instanceof UntitledEditorInput);

		let ariaLabel: string;
		const inputName = input && input.getName();
		if (isReadonly) {
			ariaLabel = inputName ? nls.localize('readonlyEditorWithInputAriaLabel', "{0}. Readonly text editor.", inputName) : nls.localize('readonlyEditorAriaLabel', "Readonly text editor.");
		} else {
			ariaLabel = inputName ? nls.localize('untitledFileEditorWithInputAriaLabel', "{0}. Untitled file text editor.", inputName) : nls.localize('untitledFileEditorAriaLabel', "Untitled file text editor.");
		}

		return ariaLabel;
	}

	/**
	 * Reveals the last line of this editor if it has a model set.
	 * If smart reveal is true will only reveal the last line if the line before last is visible #3351
	 */
	public revealLastLine(): void {
		const codeEditor = <ICodeEditor>this.getControl();
		const model = codeEditor.getModel();

		if (model) {
			const lastLine = model.getLineCount();
			codeEditor.revealLine(lastLine);
		}
	}

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		this.saveTextEditorViewState(this.input);

		// Clear Model
		this.getControl().setModel(null);

		super.clearInput();
	}

	public shutdown(): void {

		// Save View State
		this.saveTextEditorViewState(this.input);

		// Call Super
		super.shutdown();
	}

	protected saveTextEditorViewState(input: EditorInput): void;
	protected saveTextEditorViewState(key: string): void;
	protected saveTextEditorViewState(arg1: EditorInput | string): void {
		if (typeof arg1 === 'string') {
			return super.saveTextEditorViewState(arg1);
		}

		if (arg1 instanceof UntitledEditorInput && !arg1.isDisposed()) {
			return super.saveTextEditorViewState(arg1.getResource().toString());
		}
	}
}