/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ICodeEditor, IPasteEvent } from '../../../../editor/browser/editorBrowser.js';
import { IEditorOpenContext, isTextEditorViewState } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { applyTextEditorOptions } from '../../../common/editor/editorOptions.js';
import { AbstractTextResourceEditorInput, TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { BaseTextEditorModel } from '../../../common/editor/textEditorModel.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { AbstractTextCodeEditor } from './textCodeEditor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ScrollType, ICodeEditorViewState } from '../../../../editor/common/editorCommon.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { EditorOption, IEditorOptions as ICodeEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { ModelConstants } from '../../../../editor/common/model.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';

/**
 * An editor implementation that is capable of showing the contents of resource inputs. Uses
 * the TextEditor widget to show the contents.
 */
export abstract class AbstractTextResourceEditor extends AbstractTextCodeEditor<ICodeEditorViewState> {

	constructor(
		id: string,
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService
	) {
		super(id, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
	}

	override async setInput(input: AbstractTextResourceEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Set input and resolve
		await super.setInput(input, options, context, token);
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
		const control = assertReturnsDefined(this.editorControl);
		const textEditorModel = resolvedModel.textEditorModel;
		control.setModel(textEditorModel);

		// Restore view state (unless provided by options)
		if (!isTextEditorViewState(options?.viewState)) {
			const editorViewState = this.loadEditorViewState(input, context);
			if (editorViewState) {
				if (options?.selection) {
					editorViewState.cursorState = []; // prevent duplicate selections via options
				}

				control.restoreViewState(editorViewState);
			}
		}

		// Apply options to editor if any
		if (options) {
			applyTextEditorOptions(options, control, ScrollType.Immediate);
		}

		// Since the resolved model provides information about being readonly
		// or not, we apply it here to the editor even though the editor input
		// was already asked for being readonly or not. The rationale is that
		// a resolved model might have more specific information about being
		// readonly or not that the input did not have.
		control.updateOptions(this.getReadonlyConfiguration(resolvedModel.isReadonly()));
	}

	/**
	 * Reveals the last line of this editor if it has a model set.
	 */
	revealLastLine(): void {
		const control = this.editorControl;
		if (!control) {
			return;
		}

		const model = control.getModel();

		if (model) {
			const lastLine = model.getLineCount();
			control.revealPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) }, ScrollType.Smooth);
		}
	}

	override clearInput(): void {
		super.clearInput();

		// Clear Model
		this.editorControl?.setModel(null);
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		// editor view state persistence is only enabled for untitled and resource inputs
		return input instanceof UntitledTextEditorInput || input instanceof TextResourceEditorInput;
	}
}

export class TextResourceEditor extends AbstractTextResourceEditor {

	static readonly ID = 'workbench.editors.textResourceEditor';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService fileService: IFileService
	) {
		super(TextResourceEditor.ID, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService);
	}

	protected override createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): void {
		super.createEditorControl(parent, configuration);

		// Install a listener for paste to update this editors
		// language if the paste includes a specific language
		const control = this.editorControl;
		if (control) {
			this._register(control.onDidPaste(e => this.onDidEditorPaste(e, control)));
		}
	}

	private onDidEditorPaste(e: IPasteEvent, codeEditor: ICodeEditor): void {
		if (this.input instanceof UntitledTextEditorInput && this.input.hasLanguageSetExplicitly) {
			return; // do not override language if it was set explicitly
		}

		if (e.range.startLineNumber !== 1 || e.range.startColumn !== 1) {
			return; // document had existing content before the pasted text, don't override.
		}

		if (codeEditor.getOption(EditorOption.readOnly)) {
			return; // not for readonly editors
		}

		const textModel = codeEditor.getModel();
		if (!textModel) {
			return; // require a live model
		}

		const pasteIsWholeContents = textModel.getLineCount() === e.range.endLineNumber && textModel.getLineMaxColumn(e.range.endLineNumber) === e.range.endColumn;
		if (!pasteIsWholeContents) {
			return; // document had existing content after the pasted text, don't override.
		}

		const currentLanguageId = textModel.getLanguageId();
		if (currentLanguageId !== PLAINTEXT_LANGUAGE_ID) {
			return; // require current languageId to be unspecific
		}

		let candidateLanguage: { id: string; source: 'event' | 'guess' } | undefined = undefined;

		// A languageId is provided via the paste event so text was copied using
		// VSCode. As such we trust this languageId and use it if specific
		if (e.languageId) {
			candidateLanguage = { id: e.languageId, source: 'event' };
		}

		// A languageId was not provided, so the data comes from outside VSCode
		// We can still try to guess a good languageId from the first line if
		// the paste changed the first line
		else {
			const guess = this.languageService.guessLanguageIdByFilepathOrFirstLine(textModel.uri, textModel.getLineContent(1).substr(0, ModelConstants.FIRST_LINE_DETECTION_LENGTH_LIMIT)) ?? undefined;
			if (guess) {
				candidateLanguage = { id: guess, source: 'guess' };
			}
		}

		// Finally apply languageId to model if specified
		if (candidateLanguage && candidateLanguage.id !== PLAINTEXT_LANGUAGE_ID) {
			if (this.input instanceof UntitledTextEditorInput && candidateLanguage.source === 'event') {
				// High confidence, set language id at TextEditorModel level to block future auto-detection
				this.input.setLanguageId(candidateLanguage.id);
			} else {
				textModel.setLanguage(this.languageService.createById(candidateLanguage.id));
			}

			const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
			textModel.detectIndentation(opts.insertSpaces, opts.tabSize);
		}
	}
}
