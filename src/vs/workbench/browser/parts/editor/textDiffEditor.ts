/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/textdiffeditor';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import objects = require('vs/base/common/objects');
import { Builder } from 'vs/base/browser/builder';
import { Action, IAction } from 'vs/base/common/actions';
import { onUnexpectedError } from 'vs/base/common/errors';
import types = require('vs/base/common/types');
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffEditorOptions, IEditorOptions } from 'vs/editor/common/editorCommon';
import { BaseTextEditor, IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { TextEditorOptions, TextDiffEditorOptions, EditorInput, EditorOptions, TEXT_DIFF_EDITOR_ID, IFileEditorInput } from 'vs/workbench/common/editor';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { DiffNavigator } from 'vs/editor/contrib/diffNavigator/common/diffNavigator';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';
import { DelegatingWorkbenchEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IEditorInput } from 'vs/platform/editor/common/editor';

/**
 * The text editor that leverages the diff text editor for the editing experience.
 */
export class TextDiffEditor extends BaseTextEditor {

	public static ID = TEXT_DIFF_EDITOR_ID;

	private diffNavigator: DiffNavigator;
	private nextDiffAction: NavigateAction;
	private previousDiffAction: NavigateAction;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IModeService modeService: IModeService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(TextDiffEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, modeService, textFileService, editorGroupService);
	}

	public getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textDiffEditor', "Text Diff Editor");
	}

	public createEditorControl(parent: Builder, configuration: IEditorOptions): IDiffEditor {

		// Actions
		this.nextDiffAction = new NavigateAction(this, true);
		this.previousDiffAction = new NavigateAction(this, false);

		// Support navigation within the diff editor by overriding the editor service within
		const delegatingEditorService = this.instantiationService.createInstance(DelegatingWorkbenchEditorService);
		delegatingEditorService.setEditorOpenHandler((input: EditorInput, options?: EditorOptions, arg3?: any) => {

			// Check if arg4 is a position argument that differs from this editors position
			if (types.isUndefinedOrNull(arg3) || arg3 === false || arg3 === this.position) {
				const activeDiffInput = <DiffEditorInput>this.input;
				if (input && options && activeDiffInput) {

					// Input matches modified side of the diff editor: perform the action on modified side
					if (input.matches(activeDiffInput.modifiedInput)) {
						return this.setInput(this.input, options).then(() => this);
					}

					// Input matches original side of the diff editor: perform the action on original side
					else if (input.matches(activeDiffInput.originalInput)) {
						const originalEditor = this.getControl().getOriginalEditor();
						if (options instanceof TextEditorOptions) {
							(<TextEditorOptions>options).apply(originalEditor);

							return TPromise.as(this);
						}
					}
				}
			}

			return TPromise.as(null);
		});

		// Create a special child of instantiator that will delegate all calls to openEditor() to the same diff editor if the input matches with the modified one
		const diffEditorInstantiator = this.instantiationService.createChild(new ServiceCollection([IWorkbenchEditorService, delegatingEditorService]));

		return diffEditorInstantiator.createInstance(DiffEditorWidget, parent.getHTMLElement(), configuration);
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
				textOptions.apply(<IDiffEditor>this.getControl());
			}

			return TPromise.as<void>(null);
		}

		// Dispose previous diff navigator
		if (this.diffNavigator) {
			this.diffNavigator.dispose();
		}

		// Different Input (Reload)
		return input.resolve(true).then(resolvedModel => {

			// Assert Model Instance
			if (!(resolvedModel instanceof TextDiffEditorModel) && this.openAsBinary(input, options)) {
				return null;
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading a diff takes long and another input was set meanwhile
			if (!this.input || this.input !== input) {
				return null;
			}

			// Editor
			const diffEditor = <IDiffEditor>this.getControl();
			diffEditor.setModel((<TextDiffEditorModel>resolvedModel).textDiffEditorModel);

			// Respect text diff editor options
			let autoRevealFirstChange = true;
			if (options instanceof TextDiffEditorOptions) {
				const textDiffOptions = (<TextDiffEditorOptions>options);
				autoRevealFirstChange = !types.isUndefinedOrNull(textDiffOptions.autoRevealFirstChange) ? textDiffOptions.autoRevealFirstChange : autoRevealFirstChange;
			}

			// listen on diff updated changes to reveal the first change
			this.diffNavigator = new DiffNavigator(diffEditor, {
				alwaysRevealFirst: autoRevealFirstChange
			});
			this.diffNavigator.addListener2(DiffNavigator.Events.UPDATED, () => {
				this.nextDiffAction.updateEnablement();
				this.previousDiffAction.updateEnablement();
			});

			// Handle TextOptions
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				(<TextEditorOptions>options).apply(<IDiffEditor>diffEditor);
			}
		}, error => {

			// In case we tried to open a file and the response indicates that this is not a text file, fallback to binary diff.
			if (this.isFileBinaryError(error) && this.openAsBinary(input, options)) {
				return null;
			}

			// Otherwise make sure the error bubbles up
			return TPromise.wrapError(error);
		});
	}

	private openAsBinary(input: EditorInput, options: EditorOptions): boolean {
		if (input instanceof DiffEditorInput) {
			const originalInput = input.originalInput;
			const modifiedInput = input.modifiedInput;

			const binaryDiffInput = new DiffEditorInput(input.getName(), input.getDescription(), originalInput, modifiedInput, true);

			// Forward binary flag to input if supported
			if (types.isFunction(((originalInput as IEditorInput) as IFileEditorInput).setForceOpenAsBinary)) {
				((originalInput as IEditorInput) as IFileEditorInput).setForceOpenAsBinary();
			}

			if (types.isFunction(((modifiedInput as IEditorInput) as IFileEditorInput).setForceOpenAsBinary)) {
				((modifiedInput as IEditorInput) as IFileEditorInput).setForceOpenAsBinary();
			}

			this.editorService.openEditor(binaryDiffInput, options, this.position).done(null, onUnexpectedError);

			return true;
		}

		return false;
	}

	protected computeConfiguration(configuration: IEditorConfiguration): IEditorOptions {
		const editorConfiguration = super.computeConfiguration(configuration);

		// Handle diff editor specially by merging in diffEditor configuration
		if (types.isObject(configuration.diffEditor)) {
			objects.mixin(editorConfiguration, configuration.diffEditor);
		}

		const language = this.getLanguage();
		if (language) {
			objects.assign(editorConfiguration, this.configurationService.getConfiguration<IEditorConfiguration>({ overrideIdentifier: language, section: 'diffEditor' }));
		}

		return editorConfiguration;
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const options: IDiffEditorOptions = super.getConfigurationOverrides();

		options.readOnly = this.isReadOnly();

		return options;
	}

	protected getAriaLabel(): string {
		let ariaLabel: string;
		const inputName = this.input && this.input.getName();
		if (this.isReadOnly()) {
			ariaLabel = inputName ? nls.localize('readonlyEditorWithInputAriaLabel', "{0}. Readonly text compare editor.", inputName) : nls.localize('readonlyEditorAriaLabel', "Readonly text compare editor.");
		} else {
			ariaLabel = inputName ? nls.localize('editableEditorWithInputAriaLabel', "{0}. Text file compare editor.", inputName) : nls.localize('editableEditorAriaLabel', "Text file compare editor.");
		}

		return ariaLabel;
	}

	private isReadOnly(): boolean {
		const input = this.input;
		if (input instanceof DiffEditorInput) {
			const modifiedInput = input.modifiedInput;

			return modifiedInput instanceof StringEditorInput || modifiedInput instanceof ResourceEditorInput;
		}

		return false;
	}

	private isFileBinaryError(error: Error[]): boolean;
	private isFileBinaryError(error: Error): boolean;
	private isFileBinaryError(error: any): boolean {
		if (types.isArray(error)) {
			const errors = <Error[]>error;
			return errors.some(e => this.isFileBinaryError(e));
		}

		return (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY;
	}

	public clearInput(): void {

		// Dispose previous diff navigator
		if (this.diffNavigator) {
			this.diffNavigator.dispose();
		}

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	public getDiffNavigator(): DiffNavigator {
		return this.diffNavigator;
	}

	public getActions(): IAction[] {
		return [
			this.previousDiffAction,
			this.nextDiffAction
		];
	}

	public getSecondaryActions(): IAction[] {
		const actions = super.getSecondaryActions();

		// Action to toggle editor mode from inline to side by side
		const toggleEditorModeAction = new ToggleEditorModeAction(this);
		toggleEditorModeAction.order = 50; // Closer to the end

		actions.push(...[
			toggleEditorModeAction
		]);

		return actions;
	}

	public getControl(): IDiffEditor {
		return super.getControl() as IDiffEditor;
	}

	public dispose(): void {

		// Dispose previous diff navigator
		if (this.diffNavigator) {
			this.diffNavigator.dispose();
		}

		super.dispose();
	}
}

class NavigateAction extends Action {
	static ID_NEXT = 'workbench.action.compareEditor.nextChange';
	static ID_PREV = 'workbench.action.compareEditor.previousChange';

	private editor: TextDiffEditor;
	private next: boolean;

	constructor(editor: TextDiffEditor, next: boolean) {
		super(next ? NavigateAction.ID_NEXT : NavigateAction.ID_PREV);

		this.editor = editor;
		this.next = next;

		this.label = this.next ? nls.localize('navigate.next.label', "Next Change") : nls.localize('navigate.prev.label', "Previous Change");
		this.class = this.next ? 'textdiff-editor-action next' : 'textdiff-editor-action previous';
		this.enabled = false;
	}

	public run(): TPromise<any> {
		if (this.next) {
			this.editor.getDiffNavigator().next();
		} else {
			this.editor.getDiffNavigator().previous();
		}

		return null;
	}

	public updateEnablement(): void {
		this.enabled = this.editor.getDiffNavigator().canNavigate();
	}
}

class ToggleEditorModeAction extends Action {
	private static ID = 'toggle.diff.editorMode';
	private static INLINE_LABEL = nls.localize('inlineDiffLabel', "Switch to Inline View");
	private static SIDEBYSIDE_LABEL = nls.localize('sideBySideDiffLabel', "Switch to Side by Side View");

	constructor(private editor: TextDiffEditor) {
		super(ToggleEditorModeAction.ID);
	}

	public get label(): string {
		return ToggleEditorModeAction.isInlineMode(this.editor) ? ToggleEditorModeAction.SIDEBYSIDE_LABEL : ToggleEditorModeAction.INLINE_LABEL;
	}

	public run(): TPromise<any> {
		const inlineModeActive = ToggleEditorModeAction.isInlineMode(this.editor);

		const control = this.editor.getControl();
		control.updateOptions(<IDiffEditorOptions>{
			renderSideBySide: inlineModeActive
		});

		return TPromise.as(true);
	}

	private static isInlineMode(editor: TextDiffEditor): boolean {
		const control = editor.getControl();

		return control && !control.renderSideBySide;
	}
}