/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { createCommandUri } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { IActiveCodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { trimTrailingWhitespace } from '../../../../editor/common/commands/trimTrailingWhitespaceCommand.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { CodeActionProvider, CodeActionTriggerType } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from '../../../../editor/contrib/codeAction/browser/codeAction.js';
import { CodeActionKind, CodeActionTriggerSource } from '../../../../editor/contrib/codeAction/common/types.js';
import { FormattingMode, formatDocumentRangesWithSelectedProvider, formatDocumentWithSelectedProvider } from '../../../../editor/contrib/format/browser/format.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep, Progress } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from '../../../common/contributions.js';
import { SaveReason } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ITextFileEditorModel, ITextFileSaveParticipant, ITextFileSaveParticipantContext, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { getModifiedRanges } from '../../format/browser/formatModified.js';

export class TrimWhitespaceParticipant implements ITextFileSaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext): Promise<void> {
		if (!model.textEditorModel) {
			return;
		}

		const trimTrailingWhitespaceOption = this.configurationService.getValue<boolean>('files.trimTrailingWhitespace', { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource });
		const trimInRegexAndStrings = this.configurationService.getValue<boolean>('files.trimTrailingWhitespaceInRegexAndStrings', { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource });
		if (trimTrailingWhitespaceOption) {
			this.doTrimTrailingWhitespace(model.textEditorModel, context.reason === SaveReason.AUTO, trimInRegexAndStrings);
		}
	}

	private doTrimTrailingWhitespace(model: ITextModel, isAutoSaved: boolean, trimInRegexesAndStrings: boolean): void {
		let prevSelection: Selection[] = [];
		let cursors: Position[] = [];

		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			// Find `prevSelection` in any case do ensure a good undo stack when pushing the edit
			// Collect active cursors in `cursors` only if `isAutoSaved` to avoid having the cursors jump
			prevSelection = editor.getSelections();
			if (isAutoSaved) {
				cursors = prevSelection.map(s => s.getPosition());
				const snippetsRange = SnippetController2.get(editor)?.getSessionEnclosingRange();
				if (snippetsRange) {
					for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
						cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
					}
				}
			}
		}

		const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
		if (!ops.length) {
			return; // Nothing to do
		}

		model.pushEditOperations(prevSelection, ops, (_edits) => prevSelection);
	}
}

function findEditor(model: ITextModel, codeEditorService: ICodeEditorService): IActiveCodeEditor | null {
	let candidate: IActiveCodeEditor | null = null;

	if (model.isAttachedToEditor()) {
		for (const editor of codeEditorService.listCodeEditors()) {
			if (editor.hasModel() && editor.getModel() === model) {
				if (editor.hasTextFocus()) {
					return editor; // favour focused editor if there are multiple
				}

				candidate = editor;
			}
		}
	}

	return candidate;
}

export class FinalNewLineParticipant implements ITextFileSaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext): Promise<void> {
		if (!model.textEditorModel) {
			return;
		}

		if (this.configurationService.getValue('files.insertFinalNewline', { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource })) {
			this.doInsertFinalNewLine(model.textEditorModel);
		}
	}

	private doInsertFinalNewLine(model: ITextModel): void {
		const lineCount = model.getLineCount();
		const lastLine = model.getLineContent(lineCount);
		const lastLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(lastLine) === -1;

		if (!lineCount || lastLineIsEmptyOrWhitespace) {
			return;
		}

		const edits = [EditOperation.insert(new Position(lineCount, model.getLineMaxColumn(lineCount)), model.getEOL())];
		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			editor.executeEdits('insertFinalNewLine', edits, editor.getSelections());
		} else {
			model.pushEditOperations([], edits, () => null);
		}
	}
}

export class TrimFinalNewLinesParticipant implements ITextFileSaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext): Promise<void> {
		if (!model.textEditorModel) {
			return;
		}

		if (this.configurationService.getValue('files.trimFinalNewlines', { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource })) {
			this.doTrimFinalNewLines(model.textEditorModel, context.reason === SaveReason.AUTO);
		}
	}

	/**
	 * returns 0 if the entire file is empty
	 */
	private findLastNonEmptyLine(model: ITextModel): number {
		for (let lineNumber = model.getLineCount(); lineNumber >= 1; lineNumber--) {
			const lineLength = model.getLineLength(lineNumber);
			if (lineLength > 0) {
				// this line has content
				return lineNumber;
			}
		}
		// no line has content
		return 0;
	}

	private doTrimFinalNewLines(model: ITextModel, isAutoSaved: boolean): void {
		const lineCount = model.getLineCount();

		// Do not insert new line if file does not end with new line
		if (lineCount === 1) {
			return;
		}

		let prevSelection: Selection[] = [];
		let cannotTouchLineNumber = 0;
		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			prevSelection = editor.getSelections();
			if (isAutoSaved) {
				for (let i = 0, len = prevSelection.length; i < len; i++) {
					const positionLineNumber = prevSelection[i].positionLineNumber;
					if (positionLineNumber > cannotTouchLineNumber) {
						cannotTouchLineNumber = positionLineNumber;
					}
				}
			}
		}

		const lastNonEmptyLine = this.findLastNonEmptyLine(model);
		const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
		const deletionRange = model.validateRange(new Range(deleteFromLineNumber, 1, lineCount, model.getLineMaxColumn(lineCount)));

		if (deletionRange.isEmpty()) {
			return;
		}

		model.pushEditOperations(prevSelection, [EditOperation.delete(deletionRange)], _edits => prevSelection);

		editor?.setSelections(prevSelection);
	}
}

class FormatOnSaveParticipant implements ITextFileSaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		// Nothing
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		if (!model.textEditorModel) {
			return;
		}
		if (context.reason === SaveReason.AUTO) {
			return undefined;
		}

		const textEditorModel = model.textEditorModel;
		const overrides = { overrideIdentifier: textEditorModel.getLanguageId(), resource: textEditorModel.uri };

		const nestedProgress = new Progress<{ displayName?: string; extensionId?: ExtensionIdentifier }>(provider => {
			progress.report({
				message: localize(
					{ key: 'formatting2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] },
					"Running '{0}' Formatter ([configure]({1})).",
					provider.displayName || provider.extensionId && provider.extensionId.value || '???',
					createCommandUri('workbench.action.openSettings', 'editor.formatOnSave').toString(),
				)
			});
		});

		const enabled = this.configurationService.getValue<boolean>('editor.formatOnSave', overrides);
		if (!enabled) {
			return undefined;
		}

		const editorOrModel = findEditor(textEditorModel, this.codeEditorService) || textEditorModel;
		const mode = this.configurationService.getValue<'file' | 'modifications' | 'modificationsIfAvailable'>('editor.formatOnSaveMode', overrides);

		if (mode === 'file') {
			await this.instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, nestedProgress, token);

		} else {
			const ranges = await this.instantiationService.invokeFunction(getModifiedRanges, isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel);
			if (ranges === null && mode === 'modificationsIfAvailable') {
				// no SCM, fallback to formatting the whole file iff wanted
				await this.instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, nestedProgress, token);

			} else if (ranges) {
				// formatted modified ranges
				await this.instantiationService.invokeFunction(formatDocumentRangesWithSelectedProvider, editorOrModel, ranges, FormattingMode.Silent, nestedProgress, token, false);
			}
		}
	}
}

class CodeActionOnSaveParticipant extends Disposable implements ITextFileSaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IHostService private readonly hostService: IHostService,
		@IEditorService private readonly editorService: IEditorService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();

		this._register(this.hostService.onDidChangeFocus(() => { this.triggerCodeActionsCommand(); }));
		this._register(this.editorService.onDidActiveEditorChange(() => { this.triggerCodeActionsCommand(); }));
	}

	private async triggerCodeActionsCommand() {
		if (this.configurationService.getValue<boolean>('editor.codeActions.triggerOnFocusChange') && this.configurationService.getValue<string>('files.autoSave') === 'afterDelay') {
			const model = this.codeEditorService.getActiveCodeEditor()?.getModel();
			if (!model) {
				return undefined;
			}

			const settingsOverrides = { overrideIdentifier: model.getLanguageId(), resource: model.uri };
			const setting = this.configurationService.getValue<{ [kind: string]: string | boolean } | string[]>('editor.codeActionsOnSave', settingsOverrides);

			if (!setting) {
				return undefined;
			}

			if (Array.isArray(setting)) {
				return undefined;
			}

			const settingItems: string[] = Object.keys(setting).filter(x => setting[x] && setting[x] === 'always' && CodeActionKind.Source.contains(new HierarchicalKind(x)));

			const cancellationTokenSource = new CancellationTokenSource();

			const codeActionKindList = [];
			for (const item of settingItems) {
				codeActionKindList.push(new HierarchicalKind(item));
			}

			// run code actions based on what is found from setting === 'always', no exclusions.
			await this.applyOnSaveActions(model, codeActionKindList, [], Progress.None, cancellationTokenSource.token);
		}
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		if (!model.textEditorModel) {
			return;
		}

		const textEditorModel = model.textEditorModel;
		const settingsOverrides = { overrideIdentifier: textEditorModel.getLanguageId(), resource: textEditorModel.uri };

		// Convert boolean values to strings
		const setting = this.configurationService.getValue<{ [kind: string]: string | boolean } | string[]>('editor.codeActionsOnSave', settingsOverrides);
		if (!setting) {
			return undefined;
		}

		if (context.reason === SaveReason.AUTO) {
			return undefined;
		}

		if (context.reason !== SaveReason.EXPLICIT && Array.isArray(setting)) {
			return undefined;
		}

		const settingItems: string[] = Array.isArray(setting)
			? setting
			: Object.keys(setting).filter(x => setting[x] && setting[x] !== 'never');

		const codeActionsOnSave = this.createCodeActionsOnSave(settingItems);

		if (!Array.isArray(setting)) {
			codeActionsOnSave.sort((a, b) => {
				if (CodeActionKind.SourceFixAll.contains(a)) {
					if (CodeActionKind.SourceFixAll.contains(b)) {
						return 0;
					}
					return -1;
				}
				if (CodeActionKind.SourceFixAll.contains(b)) {
					return 1;
				}
				return 0;
			});
		}

		if (!codeActionsOnSave.length) {
			return undefined;
		}
		const excludedActions = Array.isArray(setting)
			? []
			: Object.keys(setting)
				.filter(x => setting[x] === 'never' || false)
				.map(x => new HierarchicalKind(x));

		progress.report({ message: localize('codeaction', "Quick Fixes") });

		const filteredSaveList = Array.isArray(setting) ? codeActionsOnSave : codeActionsOnSave.filter(x => setting[x.value] === 'always' || ((setting[x.value] === 'explicit' || setting[x.value] === true) && context.reason === SaveReason.EXPLICIT));

		await this.applyOnSaveActions(textEditorModel, filteredSaveList, excludedActions, progress, token);
	}

	private createCodeActionsOnSave(settingItems: readonly string[]): HierarchicalKind[] {
		const kinds = settingItems.map(x => new HierarchicalKind(x));

		// Remove subsets
		return kinds.filter(kind => {
			return kinds.every(otherKind => otherKind.equals(kind) || !otherKind.contains(kind));
		});
	}

	private async applyOnSaveActions(model: ITextModel, codeActionsOnSave: readonly HierarchicalKind[], excludes: readonly HierarchicalKind[], progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		const getActionProgress = new class implements IProgress<CodeActionProvider> {
			private _names = new Set<string>();
			private _report(): void {
				progress.report({
					message: localize(
						{ key: 'codeaction.get2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] },
						"Getting code actions from {0} ([configure]({1})).",
						[...this._names].map(name => `'${name}'`).join(', '),
						createCommandUri('workbench.action.openSettings', 'editor.codeActionsOnSave').toString()
					)
				});
			}
			report(provider: CodeActionProvider) {
				if (provider.displayName && !this._names.has(provider.displayName)) {
					this._names.add(provider.displayName);
					this._report();
				}
			}
		};

		for (const codeActionKind of codeActionsOnSave) {
			const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, getActionProgress, token);

			if (token.isCancellationRequested) {
				actionsToRun.dispose();
				return;
			}

			try {
				for (const action of actionsToRun.validActions) {
					progress.report({ message: localize('codeAction.apply', "Applying code action '{0}'.", action.action.title) });
					await this.instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
					if (token.isCancellationRequested) {
						return;
					}
				}
			} catch {
				// Failure to apply a code action should not block other on save actions
			} finally {
				actionsToRun.dispose();
			}
		}
	}

	private getActionsToRun(model: ITextModel, codeActionKind: HierarchicalKind, excludes: readonly HierarchicalKind[], progress: IProgress<CodeActionProvider>, token: CancellationToken) {
		return getCodeActions(this.languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
			type: CodeActionTriggerType.Auto,
			triggerAction: CodeActionTriggerSource.OnSave,
			filter: { include: codeActionKind, excludes: excludes, includeSourceActions: true },
		}, progress, token);
	}
}

export class SaveParticipantsContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super();

		this.registerSaveParticipants();
	}

	private registerSaveParticipants(): void {
		this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
		this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
		this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
		this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(FinalNewLineParticipant)));
		this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
