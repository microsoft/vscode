/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AsyncIterableObject } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CharCode } from '../../../../../base/common/charCode.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { isEqual } from '../../../../../base/common/resources.js';
import * as strings from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { IActiveCodeEditor, isCodeEditor, isDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { InlineChatController } from '../../../inlineChat/browser/inlineChatController.js';
import { insertCell } from '../../../notebook/browser/controller/cellOperations.js';
import { IActiveNotebookEditor, INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { CellKind, NOTEBOOK_EDITOR_ID } from '../../../notebook/common/notebookCommon.js';
import { ICodeMapperCodeBlock, ICodeMapperRequest, ICodeMapperResponse, ICodeMapperService } from '../../common/chatCodeMapperService.js';
import { ChatUserAction, IChatService } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ICodeBlockActionContext } from '../codeBlockPart.js';

export class InsertCodeBlockOperation {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
	}

	public async run(context: ICodeBlockActionContext) {
		const activeEditorControl = getEditableActiveCodeEditor(this.editorService);
		if (activeEditorControl) {
			await this.handleTextEditor(activeEditorControl, context);
		} else {
			const activeNotebookEditor = getActiveNotebookEditor(this.editorService);
			if (activeNotebookEditor) {
				await this.handleNotebookEditor(activeNotebookEditor, context);
			} else {
				this.notify(localize('insertCodeBlock.noActiveEditor', "To insert the code block, open a code editor or notebook editor and set the cursor at the location where to insert the code block."));
			}
		}
		notifyUserAction(this.chatService, context, {
			kind: 'insert',
			codeBlockIndex: context.codeBlockIndex,
			totalCharacters: context.code.length
		});
	}

	private async handleNotebookEditor(notebookEditor: IActiveNotebookEditor, codeBlockContext: ICodeBlockActionContext): Promise<boolean> {
		if (notebookEditor.isReadOnly) {
			this.notify(localize('insertCodeBlock.readonlyNotebook', "Cannot insert the code block to read-only notebook editor."));
			return false;
		}
		const focusRange = notebookEditor.getFocus();
		const next = Math.max(focusRange.end - 1, 0);
		insertCell(this.languageService, notebookEditor, next, CellKind.Code, 'below', codeBlockContext.code, true);
		return true;
	}

	private async handleTextEditor(codeEditor: IActiveCodeEditor, codeBlockContext: ICodeBlockActionContext): Promise<boolean> {
		const activeModel = codeEditor.getModel();
		if (isReadOnly(activeModel, this.textFileService)) {
			this.notify(localize('insertCodeBlock.readonly', "Cannot insert the code block to read-only code editor."));
			return false;
		}

		const range = codeEditor.getSelection() ?? new Range(activeModel.getLineCount(), 1, activeModel.getLineCount(), 1);
		const text = reindent(codeBlockContext.code, activeModel, range.startLineNumber);

		const edits = [new ResourceTextEdit(activeModel.uri, { range, text })];
		await this.bulkEditService.apply(edits);
		this.codeEditorService.listCodeEditors().find(editor => editor.getModel()?.uri.toString() === activeModel.uri.toString())?.focus();
		return true;
	}

	private notify(message: string) {
		//this.notificationService.notify({ severity: Severity.Info, message });
		this.dialogService.info(message);
	}
}

type IComputeEditsResult = { readonly editsProposed: boolean; readonly codeMapper?: string };

export class ApplyCodeBlockOperation {

	private inlineChatPreview: InlineChatPreview | undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IProgressService private readonly progressService: IProgressService
	) {
	}

	public async run(context: ICodeBlockActionContext): Promise<void> {
		if (this.inlineChatPreview && this.inlineChatPreview.isOpen()) {
			await this.dialogService.info(
				localize('overlap', "Another code change is being previewed. Please apply or discard the pending changes first."),
			);
			return;
		}

		let activeEditorControl = getEditableActiveCodeEditor(this.editorService);

		if (context.codemapperUri && !isEqual(activeEditorControl?.getModel().uri, context.codemapperUri)) {
			// If the code block is from a code mapper, first reveal the target file
			try {
				// If the file doesn't exist yet, create it
				if (!(await this.fileService.exists(context.codemapperUri))) {
					// TODO: try to find the file in the workspace

					await this.fileService.writeFile(context.codemapperUri, VSBuffer.fromString(''));
				}
				await this.editorService.openEditor({ resource: context.codemapperUri });

				activeEditorControl = getEditableActiveCodeEditor(this.editorService);
				if (activeEditorControl) {
					this.tryToRevealCodeBlock(activeEditorControl, context.code);
				}
			} catch (e) {
				this.logService.info('[ApplyCodeBlockOperation] error opening code mapper file', context.codemapperUri, e);
			}
		}

		let result: IComputeEditsResult | undefined = undefined;

		if (activeEditorControl) {
			await this.handleTextEditor(activeEditorControl, context);
		} else {
			const activeNotebookEditor = getActiveNotebookEditor(this.editorService);
			if (activeNotebookEditor) {
				result = await this.handleNotebookEditor(activeNotebookEditor, context);
			} else {
				this.notify(localize('applyCodeBlock.noActiveEditor', "To apply this code block, open a code or notebook editor."));
			}
		}
		notifyUserAction(this.chatService, context, {
			kind: 'apply',
			codeBlockIndex: context.codeBlockIndex,
			totalCharacters: context.code.length,
			codeMapper: result?.codeMapper,
			editsProposed: !!result?.editsProposed
		});
	}

	private async handleNotebookEditor(notebookEditor: IActiveNotebookEditor, codeBlockContext: ICodeBlockActionContext): Promise<IComputeEditsResult | undefined> {
		if (notebookEditor.isReadOnly) {
			this.notify(localize('applyCodeBlock.readonlyNotebook', "Cannot apply code block to read-only notebook editor."));
			return undefined;
		}
		const focusRange = notebookEditor.getFocus();
		const next = Math.max(focusRange.end - 1, 0);
		insertCell(this.languageService, notebookEditor, next, CellKind.Code, 'below', codeBlockContext.code, true);
		return undefined;
	}

	private async handleTextEditor(codeEditor: IActiveCodeEditor, codeBlockContext: ICodeBlockActionContext): Promise<IComputeEditsResult | undefined> {
		const activeModel = codeEditor.getModel();
		if (isReadOnly(activeModel, this.textFileService)) {
			this.notify(localize('applyCodeBlock.readonly', "Cannot apply code block to read-only file."));
			return undefined;
		}

		const resource = codeBlockContext.codemapperUri ?? activeModel.uri;
		const codeBlock = { code: codeBlockContext.code, resource, markdownBeforeBlock: undefined };

		const codeMapper = this.codeMapperService.providers[0]?.displayName;
		if (!codeMapper) {
			this.notify(localize('applyCodeBlock.noCodeMapper', "No code mapper available."));
			return undefined;
		}

		const editorToApply = await this.codeEditorService.openCodeEditor({ resource }, codeEditor);
		let result = false;
		if (editorToApply && editorToApply.hasModel()) {

			const cancellationTokenSource = new CancellationTokenSource();
			try {
				const iterable = await this.progressService.withProgress<AsyncIterable<TextEdit[]>>(
					{ location: ProgressLocation.Notification, delay: 500, sticky: true, cancellable: true },
					async progress => {
						progress.report({ message: localize('applyCodeBlock.progress', "Applying code block using {0}...", codeMapper) });
						const editsIterable = this.getEdits(codeBlock, cancellationTokenSource.token);
						return await this.waitForFirstElement(editsIterable);
					},
					() => cancellationTokenSource.cancel()
				);
				result = await this.applyWithInlinePreview(iterable, editorToApply, cancellationTokenSource);
			} catch (e) {
				if (!isCancellationError(e)) {
					this.notify(localize('applyCodeBlock.error', "Failed to apply code block: {0}", e.message));
				}
			} finally {
				cancellationTokenSource.dispose();
			}
		}
		return {
			editsProposed: result,
			codeMapper
		};
	}

	private getEdits(codeBlock: ICodeMapperCodeBlock, token: CancellationToken): AsyncIterable<TextEdit[]> {
		return new AsyncIterableObject<TextEdit[]>(async executor => {
			const request: ICodeMapperRequest = {
				codeBlocks: [codeBlock]
			};
			const response: ICodeMapperResponse = {
				textEdit: (target: URI, edit: TextEdit[]) => {
					executor.emitOne(edit);
				}
			};
			const result = await this.codeMapperService.mapCode(request, response, token);
			if (result?.errorMessage) {
				executor.reject(new Error(result.errorMessage));
			}
		});
	}

	private async waitForFirstElement<T>(iterable: AsyncIterable<T>): Promise<AsyncIterable<T>> {
		const iterator = iterable[Symbol.asyncIterator]();
		const firstResult = await iterator.next();

		if (firstResult.done) {
			return {
				async *[Symbol.asyncIterator]() {
					return;
				}
			};
		}

		return {
			async *[Symbol.asyncIterator]() {
				yield firstResult.value;
				yield* iterable;
			}
		};
	}

	private async applyWithInlinePreview(edits: AsyncIterable<TextEdit[]>, codeEditor: IActiveCodeEditor, tokenSource: CancellationTokenSource): Promise<boolean> {
		const inlineChatController = InlineChatController.get(codeEditor);
		if (inlineChatController) {
			let isOpen = true;
			const promise = inlineChatController.reviewEdits(edits, tokenSource.token);
			promise.finally(() => {
				isOpen = false;
				tokenSource.dispose();
			});
			this.inlineChatPreview = {
				promise,
				isOpen: () => isOpen,
				cancel: () => tokenSource.cancel(),
			};
			return true;

		}
		return false;
	}

	private tryToRevealCodeBlock(codeEditor: IActiveCodeEditor, codeBlock: string): void {
		const match = codeBlock.match(/(\S[^\n]*)\n/); // substring that starts with a non-whitespace character and ends with a newline
		if (match && match[1].length > 10) {
			const findMatch = codeEditor.getModel().findNextMatch(match[1], { lineNumber: 1, column: 1 }, false, false, null, false);
			if (findMatch) {
				codeEditor.revealRangeInCenter(findMatch.range);
			}
		}
	}

	private notify(message: string) {
		//this.notificationService.notify({ severity: Severity.Info, message });
		this.dialogService.info(message);
	}

}

type InlineChatPreview = {
	isOpen(): boolean;
	cancel(): void;
	readonly promise: Promise<boolean>;
};

function notifyUserAction(chatService: IChatService, context: ICodeBlockActionContext, action: ChatUserAction) {
	if (isResponseVM(context.element)) {
		chatService.notifyUserAction({
			agentId: context.element.agent?.id,
			command: context.element.slashCommand?.name,
			sessionId: context.element.sessionId,
			requestId: context.element.requestId,
			result: context.element.result,
			action
		});
	}
}

function getActiveNotebookEditor(editorService: IEditorService): IActiveNotebookEditor | undefined {
	const activeEditorPane = editorService.activeEditorPane;
	if (activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
		const notebookEditor = activeEditorPane.getControl() as INotebookEditor;
		if (notebookEditor.hasModel()) {
			return notebookEditor;
		}
	}
	return undefined;
}

function getEditableActiveCodeEditor(editorService: IEditorService): IActiveCodeEditor | undefined {
	const activeCodeEditorInNotebook = getActiveNotebookEditor(editorService)?.activeCodeEditor;
	if (activeCodeEditorInNotebook && activeCodeEditorInNotebook.hasTextFocus() && activeCodeEditorInNotebook.hasModel()) {
		return activeCodeEditorInNotebook;
	}

	let activeEditorControl = editorService.activeTextEditorControl;
	if (isDiffEditor(activeEditorControl)) {
		activeEditorControl = activeEditorControl.getOriginalEditor().hasTextFocus() ? activeEditorControl.getOriginalEditor() : activeEditorControl.getModifiedEditor();
	}

	if (!isCodeEditor(activeEditorControl)) {
		return undefined;
	}

	if (!activeEditorControl.hasModel()) {
		return undefined;
	}
	return activeEditorControl;
}

function isReadOnly(model: ITextModel, textFileService: ITextFileService): boolean {
	// Check if model is editable, currently only support untitled and text file
	const activeTextModel = textFileService.files.get(model.uri) ?? textFileService.untitled.get(model.uri);
	return !!activeTextModel?.isReadonly();
}

function reindent(codeBlockContent: string, model: ITextModel, seletionStartLine: number): string {
	const newContent = strings.splitLines(codeBlockContent);
	if (newContent.length === 0) {
		return codeBlockContent;
	}

	const formattingOptions = model.getFormattingOptions();
	const codeIndentLevel = computeIndentation(model.getLineContent(seletionStartLine), formattingOptions.tabSize).level;

	const indents = newContent.map(line => computeIndentation(line, formattingOptions.tabSize));

	// find the smallest indent level in the code block
	const newContentIndentLevel = indents.reduce<number>((min, indent, index) => {
		if (indent.length !== newContent[index].length) { // ignore empty lines
			return Math.min(indent.level, min);
		}
		return min;
	}, Number.MAX_VALUE);

	if (newContentIndentLevel === Number.MAX_VALUE || newContentIndentLevel === codeIndentLevel) {
		// all lines are empty or the indent is already correct
		return codeBlockContent;
	}
	const newLines = [];
	for (let i = 0; i < newContent.length; i++) {
		const { level, length } = indents[i];
		const newLevel = Math.max(0, codeIndentLevel + level - newContentIndentLevel);
		const newIndentation = formattingOptions.insertSpaces ? ' '.repeat(formattingOptions.tabSize * newLevel) : '\t'.repeat(newLevel);
		newLines.push(newIndentation + newContent[i].substring(length));
	}
	return newLines.join('\n');
}

/**
 * Returns:
 *  - level: the line's the ident level in tabs
 *  - length: the number of characters of the leading whitespace
 */
export function computeIndentation(line: string, tabSize: number): { level: number; length: number } {
	let nSpaces = 0;
	let level = 0;
	let i = 0;
	let length = 0;
	const len = line.length;
	while (i < len) {
		const chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			nSpaces++;
			if (nSpaces === tabSize) {
				level++;
				nSpaces = 0;
				length = i + 1;
			}
		} else if (chCode === CharCode.Tab) {
			level++;
			nSpaces = 0;
			length = i + 1;
		} else {
			break;
		}
		i++;
	}
	return { level, length };
}
