/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { rename } from '../../../../../editor/contrib/rename/browser/rename.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatModel } from '../../common/model/chatModel.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { errorResult, findLineNumber, findSymbolColumn, ISymbolToolInput, resolveToolUri } from './toolHelpers.js';

export const RenameToolId = 'vscode_renameSymbol';

interface IRenameToolInput extends ISymbolToolInput {
	newName: string;
}

const BaseModelDescription = `Rename a code symbol across the workspace using the language server's rename functionality. This performs a precise, semantics-aware rename that updates all references.

Input:
- "symbol": The exact current name of the symbol to rename.
- "newName": The new name for the symbol.
- "uri": A full URI (e.g. "file:///path/to/file.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "filePath": A workspace-relative file path (e.g. "src/utils/helpers.ts") of a file where the symbol appears. Provide either "uri" or "filePath".
- "lineContent": A substring of the line of code where the symbol appears. This is used to locate the exact position in the file. Must be the actual text from the file - do NOT fabricate it.

IMPORTANT: The file and line do NOT need to be the definition of the symbol. Any occurrence works - a usage, an import, a call site, etc. You can pick whichever occurrence is most convenient.

If the tool returns an error, retry with corrected input - ensure the file path is correct, the line content matches the actual file content, and the symbol name appears in that line.`;

export class RenameTool extends Disposable implements IToolImpl {

	private readonly _onDidUpdateToolData = this._store.add(new Emitter<void>());
	readonly onDidUpdateToolData = this._onDidUpdateToolData.event;

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IChatService private readonly _chatService: IChatService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		super();

		this._store.add(Event.debounce(
			this._languageFeaturesService.renameProvider.onDidChange,
			() => { },
			2000
		)((() => this._onDidUpdateToolData.fire())));
	}

	getToolData(): IToolData {
		const languageIds = this._languageFeaturesService.renameProvider.registeredLanguageIds;

		let modelDescription = BaseModelDescription;
		if (languageIds.has('*')) {
			modelDescription += '\n\nSupported for all languages.';
		} else if (languageIds.size > 0) {
			const sorted = [...languageIds].sort();
			modelDescription += `\n\nCurrently supported for: ${sorted.join(', ')}.`;
		} else {
			modelDescription += '\n\nNo languages currently have rename providers registered.';
		}

		return {
			id: RenameToolId,
			toolReferenceName: 'rename',
			canBeReferencedInPrompt: false,
			icon: ThemeIcon.fromId(Codicon.rename.id),
			displayName: localize('tool.rename.displayName', 'Rename Symbol'),
			userDescription: localize('tool.rename.userDescription', 'Rename a symbol across the workspace'),
			modelDescription,
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.has('config.chat.tools.renameTool.enabled'),
			inputSchema: {
				type: 'object',
				properties: {
					symbol: {
						type: 'string',
						description: 'The exact current name of the symbol to rename.'
					},
					newName: {
						type: 'string',
						description: 'The new name for the symbol.'
					},
					uri: {
						type: 'string',
						description: 'A full URI of a file where the symbol appears (e.g. "file:///path/to/file.ts"). Provide either "uri" or "filePath".'
					},
					filePath: {
						type: 'string',
						description: 'A workspace-relative file path where the symbol appears (e.g. "src/utils/helpers.ts"). Provide either "uri" or "filePath".'
					},
					lineContent: {
						type: 'string',
						description: 'A substring of the line of code where the symbol appears. Used to locate the exact position. Must be actual text from the file.'
					}
				},
				required: ['symbol', 'newName', 'lineContent']
			}
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const input = context.parameters as IRenameToolInput;
		return {
			invocationMessage: localize('tool.rename.invocationMessage', 'Renaming `{0}` to `{1}`', input.symbol, input.newName),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const input = invocation.parameters as IRenameToolInput;

		// --- resolve URI ---
		const uri = resolveToolUri(input, this._workspaceContextService);
		if (!uri) {
			return errorResult('Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify the file.');
		}

		// --- open text model ---
		const ref = await this._textModelService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;

			if (!this._languageFeaturesService.renameProvider.has(model)) {
				return errorResult(`No rename provider available for this file's language. The rename tool may not support this language.`);
			}

			// --- find line containing lineContent ---
			const lineNumber = findLineNumber(model, input.lineContent);
			if (lineNumber === undefined) {
				return errorResult(`Could not find line content "${input.lineContent}" in ${uri.toString()}. Provide the exact text from the line where the symbol appears.`);
			}

			// --- find symbol in that line ---
			const lineText = model.getLineContent(lineNumber);
			const column = findSymbolColumn(lineText, input.symbol);
			if (column === undefined) {
				return errorResult(`Could not find symbol "${input.symbol}" in the matched line. Ensure the symbol name is correct and appears in the provided line content.`);
			}

			const position = new Position(lineNumber, column);

			// --- perform rename ---
			const renameResult = await rename(this._languageFeaturesService.renameProvider, model, position, input.newName);

			if (renameResult.rejectReason) {
				return errorResult(`Rename rejected: ${renameResult.rejectReason}`);
			}

			if (renameResult.edits.length === 0) {
				return errorResult(`Rename produced no edits.`);
			}

			// --- apply edits via chat response stream ---
			if (invocation.context) {
				const chatModel = this._chatService.getSession(invocation.context.sessionResource) as ChatModel | undefined;
				const request = chatModel?.getRequests().at(-1);

				if (chatModel && request) {
					// Group text edits by URI
					const editsByUri = new ResourceMap<TextEdit[]>();
					for (const edit of renameResult.edits) {
						if (ResourceTextEdit.is(edit)) {
							let edits = editsByUri.get(edit.resource);
							if (!edits) {
								edits = [];
								editsByUri.set(edit.resource, edits);
							}
							edits.push(edit.textEdit);
						}
					}

					// Push edits through the chat response stream
					for (const [editUri, edits] of editsByUri) {
						chatModel.acceptResponseProgress(request, {
							kind: 'textEdit',
							uri: editUri,
							edits: [],
						});
						chatModel.acceptResponseProgress(request, {
							kind: 'textEdit',
							uri: editUri,
							edits,
						});
						chatModel.acceptResponseProgress(request, {
							kind: 'textEdit',
							uri: editUri,
							edits: [],
							done: true,
						});
					}

					return this._successResult(input, editsByUri.size, renameResult.edits.length);
				}
			}

			// Fallback: apply via bulk edit service when no chat context is available
			await this._bulkEditService.apply(renameResult);
			const fileCount = new ResourceSet(renameResult.edits.filter(ResourceTextEdit.is).map(e => e.resource)).size;
			return this._successResult(input, fileCount, renameResult.edits.length);

		} finally {
			ref.dispose();
		}
	}

	private _successResult(input: IRenameToolInput, fileCount: number, editCount: number): IToolResult {
		const text = editCount === 1
			? localize('tool.rename.oneEdit', "Renamed `{0}` to `{1}` - 1 edit in {2} file.", input.symbol, input.newName, fileCount)
			: localize('tool.rename.edits', "Renamed `{0}` to `{1}` - {2} edits across {3} files.", input.symbol, input.newName, editCount, fileCount);
		const result = createToolSimpleTextResult(text);
		result.toolResultMessage = new MarkdownString(text);
		return result;
	}

}



export class RenameToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.renameTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const renameTool = this._store.add(instantiationService.createInstance(RenameTool));

		let registration: IDisposable | undefined;
		const registerRenameTool = () => {
			registration?.dispose();
			toolsService.flushToolUpdates();
			const toolData = renameTool.getToolData();
			registration = toolsService.registerTool(toolData, renameTool);
		};
		registerRenameTool();
		this._store.add(renameTool.onDidUpdateToolData(registerRenameTool));
		this._store.add({
			dispose: () => {
				registration?.dispose();
			}
		});
	}
}
