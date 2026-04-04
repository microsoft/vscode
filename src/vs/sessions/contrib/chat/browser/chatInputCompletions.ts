/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IChatAgentService } from '../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { chatAgentLeader, chatVariableLeader } from '../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getExcludes, ISearchConfiguration, ISearchService, QueryType } from '../../../../workbench/services/search/common/search.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';

/**
 * Regex matching a `@agent` or `#variable` word.
 */
const LeaderWord = /[@#][\w:-]*/g;

/**
 * Regex matching a `#file:…` or `@file:…` word (allows path characters).
 */
const FileWord = /[@#][^\s]*/g;

/**
 * Command ID for adding a file reference as an attachment on completion accept.
 */
const ADD_FILE_REFERENCE_COMMAND_ID = 'sessions.chat.addFileReference';

/**
 * Registers `@` (agent) and `#` (file/context) completion providers for the
 * sessions new-chat input editor. This is the sessions-layer counterpart of
 * the workbench's `AgentCompletions` and `BuiltinDynamicCompletions`.
 */
export class ChatInputCompletions extends Disposable {

	private _cacheKey?: { key: string; time: number };

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _contextAttachments: NewChatContextAttachments,
		private readonly _getWorkspaceFolderUri: () => URI | undefined,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILabelService private readonly labelService: ILabelService,
		@ISearchService private readonly searchService: ISearchService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._registerAgentCompletions();
		this._registerFileCompletions();
	}

	// --- @ Agent completions ---

	private _registerAgentCompletions(): void {
		const uri = this._editor.getModel()?.uri;
		if (!uri) {
			return;
		}

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsAgentCompletions',
			triggerCharacters: [chatAgentLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const range = this._computeCompletionRanges(model, position, LeaderWord);
				if (!range) {
					return null;
				}

				// Only allow agent references at the start of input
				const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
				if (textBefore.trim() !== '') {
					return null;
				}

				const chatSessionContributions = this.chatSessionsService.getAllChatSessionContributions();
				const chatSessionAgentIds = new Set(chatSessionContributions.map(c => c.type));

				const agents = this.chatAgentService.getAgents()
					.filter(a => !a.isDefault)
					.filter(a => !chatSessionAgentIds.has(a.id));

				const suggestions: CompletionItem[] = agents.map((agent, i) => {
					const agentLabel = `${chatAgentLeader}${agent.name}`;
					return {
						label: { label: agentLabel, description: agent.description },
						filterText: agentLabel,
						insertText: `${agentLabel} `,
						documentation: agent.description,
						range,
						kind: CompletionItemKind.Text,
						sortText: `${chatAgentLeader}${agent.name}`,
					};
				});

				// Also include agent slash commands
				for (const agent of agents) {
					for (const cmd of agent.slashCommands) {
						const agentLabel = `${chatAgentLeader}${agent.name}`;
						const label = `${agentLabel} /${cmd.name}`;
						suggestions.push({
							label: { label, description: cmd.description },
							filterText: `${agentLabel}${cmd.name}`,
							insertText: `${label} `,
							documentation: cmd.description,
							range,
							kind: CompletionItemKind.Text,
							sortText: `x${chatAgentLeader}${agent.name}${cmd.name}`,
						});
					}
				}

				return { suggestions };
			}
		}));
	}

	// --- # File/context completions ---

	private _registerFileCompletions(): void {
		const uri = this._editor.getModel()?.uri;
		if (!uri) {
			return;
		}

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsFileCompletions',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const range = this._computeCompletionRanges(model, position, FileWord);
				if (!range) {
					return null;
				}

				const result: CompletionList = { suggestions: [], incomplete: true };
				await this._addFileEntries(result, range, token);

				// Always show a "browse files" fallback if no file results were found
				if (result.suggestions.length === 0) {
					result.suggestions.push({
						label: { label: `${chatVariableLeader}file:`, description: localize('browseFiles', "Search workspace files") },
						filterText: `${chatVariableLeader}file ${chatVariableLeader}`,
						insertText: `${chatVariableLeader}file:`,
						range,
						kind: CompletionItemKind.Text,
						sortText: 'z',
						command: { id: 'editor.action.triggerSuggest', title: '' },
					});
				}

				return result;
			}
		}));
	}

	private async _addFileEntries(
		result: CompletionList,
		range: { insert: Range; replace: Range; varWord: { word: string; startColumn: number; endColumn: number } | null },
		token: CancellationToken,
	): Promise<void> {
		const folderUri = this._getWorkspaceFolderUri();
		if (!folderUri) {
			return;
		}

		const makeCompletionItem = (resource: URI, kind: FileKind): CompletionItem => {
			const name = this.labelService.getUriBasenameLabel(resource);
			const text = `${chatVariableLeader}file:${name}`;
			const uriLabel = this.labelService.getUriLabel(resource, { relative: true });

			return {
				label: { label: name, description: uriLabel },
				filterText: `${name} ${chatVariableLeader}${name} ${uriLabel}`,
				insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
				range,
				kind: kind === FileKind.FILE ? CompletionItemKind.File : CompletionItemKind.Folder,
				sortText: '!',
				command: {
					id: ADD_FILE_REFERENCE_COMMAND_ID,
					title: '',
					arguments: [this._contextAttachments, resource, name, kind],
				},
			};
		};

		// Extract search pattern from the typed word (strip leading # and optional "file:" prefix)
		let pattern = '';
		if (range.varWord?.word) {
			let raw = range.varWord.word;
			if (raw.startsWith(chatVariableLeader)) {
				raw = raw.slice(1);
			}
			if (raw.toLowerCase().startsWith('file:')) {
				raw = raw.slice(5);
			}
			pattern = raw;
		}

		// For local/remote URIs, use the search service
		if (folderUri.scheme === Schemas.file || folderUri.scheme === Schemas.vscodeRemote) {
			const cacheKey = this._getOrCreateCacheKey();
			if (token.isCancellationRequested) {
				return;
			}
			const excludePattern = getExcludes(this.configurationService.getValue<ISearchConfiguration>({ resource: folderUri }));

			try {
				const fileResults = await this.searchService.fileSearch({
					folderQueries: [{ folder: folderUri, disregardIgnoreFiles: false }],
					type: QueryType.File,
					filePattern: pattern,
					excludePattern,
					sortByScore: true,
					maxResults: 30,
					cacheKey: cacheKey.key,
				}, token);

				for (const file of fileResults.results) {
					result.suggestions.push(makeCompletionItem(file.resource, FileKind.FILE));
				}
			} catch {
				// Search may fail
			}
		} else {
			// For virtual filesystems (e.g. github-remote-file://), walk via IFileService
			const patternLower = pattern.toLowerCase();
			try {
				await this._collectFilesViaFileService(folderUri, patternLower, result, makeCompletionItem, 30, 10, token);
			} catch {
				// File service walk may fail
			}
		}
	}

	private async _collectFilesViaFileService(
		uri: URI,
		pattern: string,
		result: CompletionList,
		makeItem: (resource: URI, kind: FileKind) => CompletionItem,
		maxResults: number,
		maxDepth: number,
		token?: CancellationToken,
		depth = 0,
	): Promise<void> {
		if (result.suggestions.length >= maxResults || depth > maxDepth || token?.isCancellationRequested) {
			return;
		}

		try {
			const stat = await this.fileService.resolve(uri);
			if (!stat.children) {
				return;
			}
			for (const child of stat.children) {
				if (result.suggestions.length >= maxResults || token?.isCancellationRequested) {
					return;
				}
				const name = basename(child.resource).toLowerCase();
				if (!pattern || name.includes(pattern)) {
					result.suggestions.push(makeItem(child.resource, child.isDirectory ? FileKind.FOLDER : FileKind.FILE));
				}
				if (child.isDirectory) {
					await this._collectFilesViaFileService(child.resource, pattern, result, makeItem, maxResults, maxDepth, token, depth + 1);
				}
			}
		} catch {
			// Ignore errors
		}
	}

	private _getOrCreateCacheKey(): { key: string; time: number } {
		if (this._cacheKey && Date.now() - this._cacheKey.time > 60_000) {
			this.searchService.clearCache(this._cacheKey.key);
			this._cacheKey = undefined;
		}
		if (!this._cacheKey) {
			this._cacheKey = { key: generateUuid(), time: Date.now() };
		}
		this._cacheKey.time = Date.now();
		return this._cacheKey;
	}

	// --- Shared helpers ---

	private _computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp): { insert: Range; replace: Range; varWord: { word: string; startColumn: number; endColumn: number } | null } | undefined {
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
}

CommandsRegistry.registerCommand(ADD_FILE_REFERENCE_COMMAND_ID, (_accessor, attachments: NewChatContextAttachments, resource: URI, name: string, kind: FileKind) => {
	attachments.addAttachment({
		kind: kind === FileKind.FILE ? 'file' : 'directory',
		id: resource.toString(),
		value: resource,
		name,
	});
});
