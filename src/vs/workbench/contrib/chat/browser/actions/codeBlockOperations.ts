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
import { getCodeEditor, IActiveCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
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
import { reviewEdits } from '../../../inlineChat/browser/inlineChatController.js';
import { insertCell } from '../../../notebook/browser/controller/cellOperations.js';
import { IActiveNotebookEditor, INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { CellKind, NOTEBOOK_EDITOR_ID } from '../../../notebook/common/notebookCommon.js';
import { ICodeMapperCodeBlock, ICodeMapperRequest, ICodeMapperResponse, ICodeMapperService } from '../../common/chatCodeMapperService.js';
import { ChatUserAction, IChatService } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { ICodeBlockActionContext } from '../codeBlockPart.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';

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

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IProgressService private readonly progressService: IProgressService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookService private readonly notebookService: INotebookService,
	) {
	}

	public async run(context: ICodeBlockActionContext): Promise<void> {
		let activeEditorControl = getEditableActiveCodeEditor(this.editorService);

		const codemapperUri = await this.evaluateURIToUse(context.codemapperUri, activeEditorControl);
		if (!codemapperUri) {
			return;
		}

		if (codemapperUri && !isEqual(activeEditorControl?.getModel().uri, codemapperUri) && !this.notebookService.hasSupportedNotebooks(codemapperUri)) {
			// reveal the target file
			try {
				const editorPane = await this.editorService.openEditor({ resource: codemapperUri });
				const codeEditor = getCodeEditor(editorPane?.getControl());
				if (codeEditor && codeEditor.hasModel()) {
					this.tryToRevealCodeBlock(codeEditor, context.code);
					activeEditorControl = codeEditor;
				} else {
					this.notify(localize('applyCodeBlock.errorOpeningFile', "Failed to open {0} in a code editor.", codemapperUri.toString()));
					return;
				}
			} catch (e) {
				this.logService.info('[ApplyCodeBlockOperation] error opening code mapper file', codemapperUri, e);
				return;
			}
		}

		let result: IComputeEditsResult | undefined = undefined;

		if (activeEditorControl && !this.notebookService.hasSupportedNotebooks(codemapperUri)) {
			result = await this.handleTextEditor(activeEditorControl, context.chatSessionId, context.code);
		} else {
			const activeNotebookEditor = getActiveNotebookEditor(this.editorService);
			if (activeNotebookEditor) {
				result = await this.handleNotebookEditor(activeNotebookEditor, context.code);
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

	private async evaluateURIToUse(resource: URI | undefined, activeEditorControl: IActiveCodeEditor | undefined): Promise<URI | undefined> {
		if (resource && await this.fileService.exists(resource)) {
			return resource;
		}

		const activeEditorOption = activeEditorControl?.getModel().uri ? { label: localize('activeEditor', "Active editor '{0}'", this.labelService.getUriLabel(activeEditorControl.getModel().uri, { relative: true })), id: 'activeEditor' } : undefined;
		const untitledEditorOption = { label: localize('newUntitledFile', "New untitled editor"), id: 'newUntitledFile' };

		const options = [];
		if (resource) {
			// code block had an URI, but it doesn't exist
			options.push({ label: localize('createFile', "New file '{0}'", this.labelService.getUriLabel(resource, { relative: true })), id: 'createFile' });
			options.push(untitledEditorOption);
			if (activeEditorOption) {
				options.push(activeEditorOption);
			}
		} else {
			// code block had no URI
			if (activeEditorOption) {
				options.push(activeEditorOption);
			}
			options.push(untitledEditorOption);
		}

		const selected = options.length > 1 ? await this.quickInputService.pick(options, { placeHolder: localize('selectOption', "Select where to apply the code block") }) : options[0];
		if (selected) {
			switch (selected.id) {
				case 'createFile':
					if (resource) {
						try {
							await this.fileService.writeFile(resource, VSBuffer.fromString(''));
						} catch (error) {
							this.notify(localize('applyCodeBlock.fileWriteError', "Failed to create file: {0}", error.message));
							return URI.from({ scheme: 'untitled', path: resource.path });
						}
					}
					return resource;
				case 'newUntitledFile':
					return URI.from({ scheme: 'untitled', path: resource ? resource.path : 'Untitled-1' });
				case 'activeEditor':
					return activeEditorControl?.getModel().uri;
			}
		}
		return undefined;
	}

	private async handleNotebookEditor(notebookEditor: IActiveNotebookEditor, code: string): Promise<IComputeEditsResult | undefined> {
		if (notebookEditor.isReadOnly) {
			this.notify(localize('applyCodeBlock.readonlyNotebook', "Cannot apply code block to read-only notebook editor."));
			return undefined;
		}
		const focusRange = notebookEditor.getFocus();
		const next = Math.max(focusRange.end - 1, 0);
		insertCell(this.languageService, notebookEditor, next, CellKind.Code, 'below', code, true);
		return undefined;
	}

	private async handleTextEditor(codeEditor: IActiveCodeEditor, chatSessionId: string | undefined, code: string): Promise<IComputeEditsResult | undefined> {
		const activeModel = codeEditor.getModel();
		if (isReadOnly(activeModel, this.textFileService)) {
			this.notify(localize('applyCodeBlock.readonly', "Cannot apply code block to read-only file."));
			return undefined;
		}

		const codeBlock = { code, resource: activeModel.uri, chatSessionId, markdownBeforeBlock: undefined };

		const codeMapper = this.codeMapperService.providers[0]?.displayName;
		if (!codeMapper) {
			this.notify(localize('applyCodeBlock.noCodeMapper', "No code mapper available."));
			return undefined;
		}
		let editsProposed = false;
		const cancellationTokenSource = new CancellationTokenSource();
		try {
			const iterable = await this.progressService.withProgress<AsyncIterable<TextEdit[]>>(
				{ location: ProgressLocation.Notification, delay: 500, sticky: true, cancellable: true },
				async progress => {
					progress.report({ message: localize('applyCodeBlock.progress', "Applying code block using {0}...", codeMapper) });
					const editsIterable = this.getEdits(codeBlock, chatSessionId, cancellationTokenSource.token);
					return await this.waitForFirstElement(editsIterable);
				},
				() => cancellationTokenSource.cancel()
			);
			editsProposed = await this.applyWithInlinePreview(iterable, codeEditor, cancellationTokenSource);
		} catch (e) {
			if (!isCancellationError(e)) {
				this.notify(localize('applyCodeBlock.error', "Failed to apply code block: {0}", e.message));
			}
		} finally {
			cancellationTokenSource.dispose();
		}

		return {
			editsProposed,
			codeMapper
		};
	}

	private getEdits(codeBlock: ICodeMapperCodeBlock, chatSessionId: string | undefined, token: CancellationToken): AsyncIterable<TextEdit[]> {
		return new AsyncIterableObject<TextEdit[]>(async executor => {
			const request: ICodeMapperRequest = {
				codeBlocks: [codeBlock],
				chatSessionId
			};
			const response: ICodeMapperResponse = {
				textEdit: (target: URI, edit: TextEdit[]) => {
					executor.emitOne(edit);
				},
				notebookEdit(_resource, _edit) {
					//
				},
			};
			const result = await this.codeMapperService.mapCode(request, response, token);
			if (result?.errorMessage) {
				executor.reject(new Error(result.errorMessage));
			}
		});
	}

	private async waitForFirstElement<T>(iterable: AsyncIterable<T>): Promise<AsyncIterable<T>> {
		const iterator = iterable[Symbol.asyncIterator]();
		let result = await iterator.next();

		if (result.done) {
			return {
				async *[Symbol.asyncIterator]() {
					return;
				}
			};
		}

		return {
			async *[Symbol.asyncIterator]() {
				while (!result.done) {
					yield result.value;
					result = await iterator.next();
				}
			}
		};
	}

	private async applyWithInlinePreview(edits: AsyncIterable<TextEdit[]>, codeEditor: IActiveCodeEditor, tokenSource: CancellationTokenSource): Promise<boolean> {
		return this.instantiationService.invokeFunction(reviewEdits, codeEditor, edits, tokenSource.token);
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

	let codeEditor = getCodeEditor(editorService.activeTextEditorControl);
	if (!codeEditor) {
		for (const editor of editorService.visibleTextEditorControls) {
			codeEditor = getCodeEditor(editor);
			if (codeEditor) {
				break;
			}
		}
	}

	if (!codeEditor || !codeEditor.hasModel()) {
		return undefined;
	}
	return codeEditor;
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
