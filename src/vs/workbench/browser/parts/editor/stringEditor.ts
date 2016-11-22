/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import types = require('vs/base/common/types');
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions, IEditorViewState } from 'vs/editor/common/editorCommon';
import { TextEditorOptions, EditorModel, EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import URI from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

/**
 * An editor implementation that is capable of showing string inputs or promise inputs that resolve to a string.
 * Uses the TextEditor widget to show the contents.
 */
export class StringEditor extends BaseTextEditor {

	public static ID = 'workbench.editors.stringEditor';

	private mapResourceToEditorViewState: { [resource: string]: IEditorViewState; };

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		super(StringEditor.ID, telemetryService, instantiationService, contextService, storageService, messageService, configurationService, eventService, editorService, themeService);

		this.mapResourceToEditorViewState = Object.create(null);

		this.toUnbind.push(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDirtyChange(e)));
	}

	private onUntitledDirtyChange(resource: URI): void {
		if (!this.untitledEditorService.isDirty(resource)) {
			delete this.mapResourceToEditorViewState[resource.toString()]; // untitled file got reverted, so remove view state
		}
	}

	public getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textEditor', "Text Editor");
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		const oldInput = this.getInput();
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
		if (oldInput instanceof UntitledEditorInput) {
			this.mapResourceToEditorViewState[oldInput.getResource().toString()] = this.getControl().saveViewState();
		}

		// Different Input (Reload)
		return input.resolve(true).then((resolvedModel: EditorModel) => {

			// Assert Model instance
			if (!(resolvedModel instanceof BaseTextEditorModel)) {
				return TPromise.wrapError<void>('Invalid editor input. String editor requires a model instance of BaseTextEditorModel.');
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
			if (!this.getInput() || this.getInput() !== input) {
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

			// Apply options again because input has changed
			textEditor.updateOptions(this.getCodeEditorOptions());
		});
	}

	protected restoreViewState(input: EditorInput) {
		if (input instanceof UntitledEditorInput) {
			const viewState = this.mapResourceToEditorViewState[input.getResource().toString()];
			if (viewState) {
				this.getControl().restoreViewState(viewState);
			}
		}
	}

	protected getCodeEditorOptions(): IEditorOptions {
		const options = super.getCodeEditorOptions();

		const input = this.getInput();
		const isUntitled = input instanceof UntitledEditorInput;
		const isReadonly = !isUntitled; // all string editors are readonly except for the untitled one

		options.readOnly = isReadonly;

		let ariaLabel: string;
		const inputName = input && input.getName();
		if (isReadonly) {
			ariaLabel = inputName ? nls.localize('readonlyEditorWithInputAriaLabel', "{0}. Readonly text editor.", inputName) : nls.localize('readonlyEditorAriaLabel', "Readonly text editor.");
		} else {
			ariaLabel = inputName ? nls.localize('untitledFileEditorWithInputAriaLabel', "{0}. Untitled file text editor.", inputName) : nls.localize('untitledFileEditorAriaLabel', "Untitled file text editor.");
		}

		options.ariaLabel = ariaLabel;

		return options;
	}

	/**
	 * Reveals the last line of this editor if it has a model set.
	 * If smart reveal is true will only reveal the last line if the line before last is visible #3351
	 */
	public revealLastLine(smartReveal = false): void {
		const codeEditor = <ICodeEditor>this.getControl();
		const model = codeEditor.getModel();
		const lineBeforeLastRevealed = codeEditor.getScrollTop() + codeEditor.getLayoutInfo().height >= codeEditor.getScrollHeight();

		if (model && (!smartReveal || lineBeforeLastRevealed)) {
			const lastLine = model.getLineCount();
			codeEditor.revealLine(lastLine);
		}
	}

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		if (this.input instanceof UntitledEditorInput) {
			this.mapResourceToEditorViewState[(<UntitledEditorInput>this.input).getResource().toString()] = this.getControl().saveViewState();
		}

		// Clear Model
		this.getControl().setModel(null);

		super.clearInput();
	}
}