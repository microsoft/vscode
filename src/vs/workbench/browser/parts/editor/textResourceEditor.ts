/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { assertIsDefined, isFunction } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { TextEditorOptions, EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { UntitledTextEditorInput } from 'vs/workbench/common/editor/untitledTextEditorInput';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { Event } from 'vs/base/common/event';
import { ScrollType, IEditor } from 'vs/editor/common/editorCommon';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

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
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IHostService hostService: IHostService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(id, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService, editorService, editorGroupService, hostService, filesConfigurationService);
	}

	getTitle(): string | undefined {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textEditor', "Text Editor");
	}

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {

		// Remember view settings if input changes
		this.saveTextResourceEditorViewState(this.input);

		// Set input and resolve
		await super.setInput(input, options, token);
		const resolvedModel = await input.resolve();

		// Check for cancellation
		if (token.isCancellationRequested) {
			return undefined;
		}

		// Assert Model instance
		if (!(resolvedModel instanceof BaseTextEditorModel)) {
			throw new Error('Unable to open file as text');
		}

		// Set Editor Model
		const textEditor = assertIsDefined(this.getControl());
		const textEditorModel = resolvedModel.textEditorModel;
		textEditor.setModel(textEditorModel);

		// Apply Options from TextOptions
		let optionsGotApplied = false;
		const textOptions = <TextEditorOptions>options;
		if (textOptions && isFunction(textOptions.apply)) {
			optionsGotApplied = textOptions.apply(textEditor, ScrollType.Immediate);
		}

		// Otherwise restore View State
		if (!optionsGotApplied) {
			this.restoreTextResourceEditorViewState(input, textEditor);
		}
	}

	private restoreTextResourceEditorViewState(editor: EditorInput, control: IEditor) {
		if (editor instanceof UntitledTextEditorInput || editor instanceof ResourceEditorInput) {
			const viewState = this.loadTextEditorViewState(editor.getResource());
			if (viewState) {
				control.restoreViewState(viewState);
			}
		}
	}

	setOptions(options: EditorOptions | undefined): void {
		const textOptions = <TextEditorOptions>options;
		if (textOptions && isFunction(textOptions.apply)) {
			const textEditor = assertIsDefined(this.getControl());
			textOptions.apply(textEditor, ScrollType.Smooth);
		}
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const options = super.getConfigurationOverrides();

		options.readOnly = !(this.input instanceof UntitledTextEditorInput); // all resource editors are readonly except for the untitled one;

		return options;
	}

	protected getAriaLabel(): string {
		const input = this.input;
		const isReadonly = !(this.input instanceof UntitledTextEditorInput);

		let ariaLabel: string;
		const inputName = input?.getName();
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
	revealLastLine(): void {
		const codeEditor = <ICodeEditor>this.getControl();
		const model = codeEditor.getModel();

		if (model) {
			const lastLine = model.getLineCount();
			codeEditor.revealPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) }, ScrollType.Smooth);
		}
	}

	clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		this.saveTextResourceEditorViewState(this.input);

		// Clear Model
		const textEditor = this.getControl();
		if (textEditor) {
			textEditor.setModel(null);
		}

		super.clearInput();
	}

	protected saveState(): void {

		// Save View State (only for untitled)
		if (this.input instanceof UntitledTextEditorInput) {
			this.saveTextResourceEditorViewState(this.input);
		}

		super.saveState();
	}

	private saveTextResourceEditorViewState(input: EditorInput | undefined): void {
		if (!(input instanceof UntitledTextEditorInput) && !(input instanceof ResourceEditorInput)) {
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
			Event.once(input.onDispose)(() => {
				super.clearTextEditorViewState([resource]);
			});
		}
	}
}

export class TextResourceEditor extends AbstractTextResourceEditor {

	static readonly ID = 'workbench.editors.textResourceEditor';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IHostService hostService: IHostService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(TextResourceEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, editorGroupService, textFileService, editorService, hostService, filesConfigurationService);
	}
}
