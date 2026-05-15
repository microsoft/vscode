/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isPatternInWord } from '../../../../base/common/filters.js';
import { Schemas } from '../../../../base/common/network.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { basename, isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IWordAtPosition, getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ISearchService } from '../../../../workbench/services/search/common/search.js';
import { searchFilesAndFolders } from '../../../../workbench/contrib/search/browser/searchChatContext.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../workbench/contrib/chat/common/widget/chatColors.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { IHistoryService } from '../../../../workbench/services/history/common/history.js';
import { isDiffEditorInput } from '../../../../workbench/common/editor.js';
import { isSupportedChatFileScheme } from '../../../../workbench/contrib/chat/common/constants.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';

const VARIABLE_LEADER = '#';

/**
 * Command ID used by completion items to attach a file/folder reference
 * to the sessions context attachments.
 */
const ADD_REFERENCE_COMMAND = 'sessions.chat.addVariableReference';

interface IReferenceArg {
	readonly attachments: NewChatContextAttachments;
	readonly entry: {
		readonly id: string;
		readonly name: string;
		readonly value: URI;
		readonly kind: 'file' | 'directory';
	};
}

CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg: IReferenceArg) => {
	arg.attachments.addAttachments({
		id: arg.entry.id,
		name: arg.entry.name,
		value: arg.entry.value,
		kind: arg.entry.kind,
	});
});

interface ICompletionRangeResult {
	insert: Range;
	replace: Range;
	varWord: IWordAtPosition | null;
}

function computeRange(model: ITextModel, position: Position, reg: RegExp): ICompletionRangeResult | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		return;
	}

	if (!varWord && position.column > 1) {
		const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
		if (textBefore !== ' ') {
			return;
		}
	}

	// Reject if there's a normal word right before our variable word
	if (varWord) {
		const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
		if (wordBefore.word) {
			return;
		}
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace, varWord };
}

/**
 * Provides `#file:` completions for files and folders in the sessions new-chat input,
 * following the same pattern as {@link SlashCommandHandler}.
 *
 * Completions are scoped to the workspace selected in the workspace picker dropdown,
 * matching the behaviour of the "Add Context..." attach button.
 * For local/remote workspaces the search service is used; for virtual filesystems
 * (e.g. `github-remote-file://`) the file service tree is walked directly.
 */
export class VariableCompletionHandler extends Disposable {

	private static readonly _wordPattern = /#[^\s]*/g; // MUST use g-flag
	private static readonly _decoType = 'sessions-variable-reference';
	private static _decosRegistered = false;

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _contextAttachments: NewChatContextAttachments,
		private readonly _getWorkspaceUri: () => URI | undefined,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ISearchService private readonly searchService: ISearchService,
		@ILabelService private readonly labelService: ILabelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IFileService private readonly fileService: IFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._registerFileCompletions();
		this._registerDecorations();
	}

	// --- File & Folder completions ---

	private _registerFileCompletions(): void {
		const uri = this._editor.getModel()?.uri;
		if (!uri) {
			return;
		}

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsVariableFileAndFolder',
			triggerCharacters: [VARIABLE_LEADER],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const workspaceUri = this._getWorkspaceUri();
				if (!workspaceUri) {
					return null;
				}

				const range = computeRange(model, position, VariableCompletionHandler._wordPattern);
				if (!range) {
					return null;
				}

				const result: CompletionList = { suggestions: [], incomplete: true };
				await this._addFileAndFolderEntries(workspaceUri, result, range, token);
				return result;
			}
		}));
	}

	private async _addFileAndFolderEntries(workspaceUri: URI, result: CompletionList, info: ICompletionRangeResult, token: CancellationToken): Promise<void> {
		const makeItem = (resource: URI, kind: FileKind, description?: string, boostPriority?: boolean): CompletionItem => {
			const nameLabel = this.labelService.getUriBasenameLabel(resource);
			const text = `${VARIABLE_LEADER}file:${nameLabel}`;
			const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
			const labelDescription = description
				? localize('fileEntryDescription', '{0} ({1})', uriLabel, description)
				: uriLabel;
			const sortText = boostPriority ? ' ' : '!';

			return {
				label: { label: nameLabel, description: labelDescription },
				filterText: `${nameLabel} ${VARIABLE_LEADER}${nameLabel} ${uriLabel}`,
				insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
				range: info,
				kind: kind === FileKind.FILE ? CompletionItemKind.File : CompletionItemKind.Folder,
				sortText,
				command: {
					id: ADD_REFERENCE_COMMAND,
					title: '',
					arguments: [{
						attachments: this._contextAttachments,
						entry: {
							id: resource.toString(),
							name: nameLabel,
							value: resource,
							kind: kind === FileKind.FILE ? 'file' : 'directory',
						},
					} satisfies IReferenceArg],
				}
			};
		};

		let pattern: string | undefined;
		if (info.varWord?.word && info.varWord.word.startsWith(VARIABLE_LEADER)) {
			pattern = info.varWord.word.toLowerCase().slice(1); // remove leading #
		}

		const seen = new ResourceSet();

		// HISTORY — always show recent files from editor history that are within the workspace
		let historyCount = 0;
		for (const [i, item] of this.historyService.getHistory().entries()) {
			const resource = isDiffEditorInput(item) ? item.modified.resource : item.resource;
			if (!resource || seen.has(resource) || !this.instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, resource.scheme))) {
				continue;
			}

			// Only include files within the selected workspace
			if (!isEqualOrParent(resource, workspaceUri)) {
				continue;
			}

			if (pattern) {
				const uriLabel = this.labelService.getUriLabel(resource, { relative: true }).toLowerCase();
				const baseName = this.labelService.getUriBasenameLabel(resource).toLowerCase();
				const combined = `${baseName} ${uriLabel}`;
				if (!isPatternInWord(pattern, 0, pattern.length, combined, 0, combined.length)) {
					continue;
				}
			}

			seen.add(resource);
			result.suggestions.push(makeItem(resource, FileKind.FILE, i === 0 ? localize('activeFile', 'Active file') : undefined, i === 0));
			if (++historyCount >= 5) {
				break;
			}
		}

		// SEARCH — always run to populate initial results (empty pattern returns scored files)
		if (workspaceUri.scheme === Schemas.file || workspaceUri.scheme === Schemas.vscodeRemote) {
			await this._addEntriesViaSearch(workspaceUri, pattern, seen, makeItem, result, token);
		} else {
			await this._addEntriesViaFileService(workspaceUri, pattern, seen, makeItem, result, token);
		}
	}

	/**
	 * Uses the search service to find files/folders — works for `file://` and `vscodeRemote` schemes.
	 */
	private async _addEntriesViaSearch(
		workspaceUri: URI,
		pattern: string | undefined,
		seen: ResourceSet,
		makeItem: (resource: URI, kind: FileKind, description?: string, boostPriority?: boolean) => CompletionItem,
		result: CompletionList,
		token: CancellationToken,
	): Promise<void> {
		try {
			const { files, folders } = await searchFilesAndFolders(workspaceUri, pattern || '', true, token, undefined, this.configurationService, this.searchService);

			for (const file of files) {
				if (!seen.has(file)) {
					seen.add(file);
					result.suggestions.push(makeItem(file, FileKind.FILE));
				}
			}
			for (const folder of folders) {
				if (!seen.has(folder)) {
					seen.add(folder);
					result.suggestions.push(makeItem(folder, FileKind.FOLDER));
				}
			}
		} catch {
			// search may fail or be cancelled
		}
	}

	/**
	 * Walks the file tree via IFileService — used for virtual filesystems
	 * (e.g. `github-remote-file://`) that don't support the search service.
	 */
	private async _addEntriesViaFileService(
		workspaceUri: URI,
		pattern: string | undefined,
		seen: ResourceSet,
		makeItem: (resource: URI, kind: FileKind, description?: string, boostPriority?: boolean) => CompletionItem,
		result: CompletionList,
		token: CancellationToken,
	): Promise<void> {
		const maxResults = 100;
		const maxDepth = 10;
		const patternLower = pattern?.toLowerCase();

		const collect = async (uri: URI, depth: number): Promise<void> => {
			if (result.suggestions.length >= maxResults || depth > maxDepth || token.isCancellationRequested) {
				return;
			}

			try {
				const stat = await this.fileService.resolve(uri);
				if (!stat.children) {
					return;
				}

				for (const child of stat.children) {
					if (result.suggestions.length >= maxResults || token.isCancellationRequested) {
						break;
					}
					if (child.isDirectory) {
						// Include matching folders as completions
						if (!seen.has(child.resource)) {
							const folderName = basename(child.resource).toLowerCase();
							if (!patternLower || folderName.includes(patternLower)) {
								seen.add(child.resource);
								result.suggestions.push(makeItem(child.resource, FileKind.FOLDER));
							}
						}
						await collect(child.resource, depth + 1);
					} else {
						if (!seen.has(child.resource)) {
							const fileName = child.name.toLowerCase();
							if (!patternLower || fileName.includes(patternLower)) {
								seen.add(child.resource);
								result.suggestions.push(makeItem(child.resource, FileKind.FILE));
							}
						}
					}
				}
			} catch {
				// ignore errors for individual directories
			}
		};

		await collect(workspaceUri, 0);
	}

	// --- Decorations ---

	private _registerDecorations(): void {
		if (!VariableCompletionHandler._decosRegistered) {
			VariableCompletionHandler._decosRegistered = true;
			this.codeEditorService.registerDecorationType('sessions-chat', VariableCompletionHandler._decoType, {
				color: themeColorFromId(chatSlashCommandForeground),
				backgroundColor: themeColorFromId(chatSlashCommandBackground),
				borderRadius: '3px',
			});
		}

		this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
		this._updateDecorations();
	}

	private _updateDecorations(): void {
		const model = this._editor.getModel();
		const value = model?.getValue() ?? '';

		const decos: IDecorationOptions[] = [];
		const regex = /#file:\S+/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(value)) !== null) {
			// Convert string offset to line/column position
			const startOffset = match.index;
			const endOffset = startOffset + match[0].length;
			const startPos = model!.getPositionAt(startOffset);
			const endPos = model!.getPositionAt(endOffset);

			decos.push({
				range: {
					startLineNumber: startPos.lineNumber,
					startColumn: startPos.column,
					endLineNumber: endPos.lineNumber,
					endColumn: endPos.column,
				},
			});
		}

		this._editor.setDecorationsByType('sessions-chat', VariableCompletionHandler._decoType, decos);
	}

}

