/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { TextEditorOptions, EditorModel, EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { once } from 'vs/base/common/event';
import { ScrollType } from 'vs/editor/common/editorCommon';

/**
 * An editor implementation that is capable of showing the contents of resource inputs. Uses
 * the TextEditor widget to show the contents.
 */
export class AbstractTextResourceEditor extends BaseTextEditor {

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(id, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService, editorGroupService);
	}

	public getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textEditor', "Text Editor");
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {

		// Return early for same input unless we force to open
		const forceOpen = options && options.forceOpen;
		if (!forceOpen && input.matches(this.input)) {

			// Still apply options if any (avoiding instanceof here for a reason, do not change!)
			const textOptions = <TextEditorOptions>options;
			if (textOptions && types.isFunction(textOptions.apply)) {
				textOptions.apply(this.getControl(), ScrollType.Smooth);
			}

			return TPromise.wrap<void>(null);
		}

		// Remember view settings if input changes
		this.saveTextEditorViewStateForInput(this.input);

		// Set input and resolve
		return super.setInput(input, options).then(() => {
			return input.resolve(true).then((resolvedModel: EditorModel) => {

				// Assert Model instance
				if (!(resolvedModel instanceof BaseTextEditorModel)) {
					return TPromise.wrapError<void>(new Error('Unable to open file as text'));
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
					optionsGotApplied = textOptions.apply(textEditor, ScrollType.Immediate);
				}

				// Otherwise restore View State
				if (!optionsGotApplied) {
					this.restoreViewState(input);
				}

				return void 0;
			});
		});
	}

	protected restoreViewState(input: EditorInput) {
		if (input instanceof UntitledEditorInput || input instanceof ResourceEditorInput) {
			const viewState = this.loadTextEditorViewState(input.getResource());
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
	 */
	public revealLastLine(): void {
		const codeEditor = <ICodeEditor>this.getControl();
		const model = codeEditor.getModel();

		if (model) {
			const lastLine = model.getLineCount();
			codeEditor.revealPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) }, ScrollType.Smooth);
		}
	}

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		this.saveTextEditorViewStateForInput(this.input);

		// Clear Model
		this.getControl().setModel(null);

		super.clearInput();
	}

	public shutdown(): void {

		// Save View State (only for untitled)
		if (this.input instanceof UntitledEditorInput) {
			this.saveTextEditorViewStateForInput(this.input);
		}

		// Call Super
		super.shutdown();
	}

	protected saveTextEditorViewStateForInput(input: EditorInput): void {
		if (!(input instanceof UntitledEditorInput) && !(input instanceof ResourceEditorInput)) {
			return; // only enabled for untitled and resource inputs
		}

		const resource = input.getResource();

		// Clear view state if input is disposed
		if (input.isDisposed()) {
			super.clearTextEditorViewState([resource]);
		}

		// Otherwise save it
		else {
			super.saveTextEditorViewState(resource);

			// Make sure to clean up when the input gets disposed
			once(input.onDispose)(() => {
				super.clearTextEditorViewState([resource]);
			});
		}
	}
}

export class TextResourceEditor extends AbstractTextResourceEditor {

	public static readonly ID = 'workbench.editors.textResourceEditor';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(TextResourceEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, editorGroupService, textFileService);
	}
}