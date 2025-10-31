/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../../editor/common/languages.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CharCode } from '../../../../../../base/common/charCode.js';
import { getWordAtText } from '../../../../../../editor/common/core/wordHelper.js';
import { chatVariableLeader } from '../../chatParserTypes.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';

/**
 * Provides autocompletion for the variables inside prompt bodies.
 * - #file: paths to files and folders in the workspace
 * - # tool names
 */
export class PromptBodyAutocompletion implements CompletionItemProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptBodyAutocompletion';

	/**
	 * List of trigger characters handled by this provider.
	 */
	public readonly triggerCharacters = [':', '.', '/', '\\'];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
	) {
	}

	/**
	 * The main function of this provider that calculates
	 * completion items based on the provided arguments.
	 */
	public async provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken): Promise<CompletionList | undefined> {
		const promptsType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptsType) {
			return undefined;
		}
		const reference = await this.findVariableReference(model, position, token);
		if (!reference) {
			return undefined;
		}
		const suggestions: CompletionItem[] = [];
		switch (reference.type) {
			case 'file':
				if (reference.contentRange.containsPosition(position)) {
					// inside the link range
					await this.collectFilePathCompletions(model, position, reference.contentRange, suggestions);
				} else {
					await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
				}
				break;
			case 'tool':
				if (reference.contentRange.containsPosition(position)) {
					if (promptsType === PromptsType.agent || promptsType === PromptsType.prompt) {
						await this.collectToolCompletions(model, position, reference.contentRange, suggestions);
					}
				} else {
					await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
				}
				break;
			default:
				await this.collectDefaultCompletions(model, reference.range, promptsType, suggestions);
		}
		return { suggestions };
	}

	private async collectToolCompletions(model: ITextModel, position: Position, toolRange: Range, suggestions: CompletionItem[]): Promise<void> {
		for (const toolName of this.languageModelToolsService.getQualifiedToolNames()) {
			suggestions.push({
				label: toolName,
				kind: CompletionItemKind.Value,
				filterText: toolName,
				insertText: toolName,
				range: toolRange,
			});
		}
	}


	private async collectFilePathCompletions(model: ITextModel, position: Position, pathRange: Range, suggestions: CompletionItem[]): Promise<void> {
		const pathUntilPosition = model.getValueInRange(pathRange.setEndPosition(position.lineNumber, position.column));
		const pathSeparator = pathUntilPosition.includes('/') || !pathUntilPosition.includes('\\') ? '/' : '\\';
		let parentFolderPath: string;
		if (pathUntilPosition.match(/[^\/]\.\.$/i)) { // ends with `..`
			parentFolderPath = pathUntilPosition + pathSeparator;
		} else {
			let i = pathUntilPosition.length - 1;
			while (i >= 0 && ![CharCode.Slash, CharCode.Backslash].includes(pathUntilPosition.charCodeAt(i))) {
				i--;
			}
			parentFolderPath = pathUntilPosition.substring(0, i + 1); // the segment up to the `/` or `\` before the position
		}

		const retriggerCommand = { id: 'editor.action.triggerSuggest', title: 'Suggest' };

		try {
			const currentFolder = extUri.resolvePath(dirname(model.uri), parentFolderPath);
			const { children } = await this.fileService.resolve(currentFolder);
			if (children) {
				for (const child of children) {
					const insertText = (parentFolderPath || ('.' + pathSeparator)) + child.name;
					suggestions.push({
						label: child.name + (child.isDirectory ? pathSeparator : ''),
						kind: child.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
						range: pathRange,
						insertText: insertText + (child.isDirectory ? pathSeparator : ''),
						filterText: insertText,
						command: child.isDirectory ? retriggerCommand : undefined
					});
				}
			}
		} catch (e) {
			// ignore errors accessing the folder location
		}

		suggestions.push({
			label: '..',
			kind: CompletionItemKind.Folder,
			insertText: parentFolderPath + '..' + pathSeparator,
			range: pathRange,
			filterText: parentFolderPath + '..',
			command: retriggerCommand
		});
	}

	/**
	 * Finds a file reference that suites the provided `position`.
	 */
	private async findVariableReference(model: ITextModel, position: Position, token: CancellationToken): Promise<{ contentRange: Range; type: string; range: Range } | undefined> {
		if (model.getLineContent(1).trimEnd() === '---') {
			let i = 2;
			while (i <= model.getLineCount() && model.getLineContent(i).trimEnd() !== '---') {
				i++;
			}
			if (i >= position.lineNumber) {
				// inside front matter
				return undefined;
			}
		}

		const reg = new RegExp(`${chatVariableLeader}[^\\s#]*`, 'g');
		const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
		if (!varWord) {
			return undefined;
		}
		const range = new Range(position.lineNumber, varWord.startColumn + 1, position.lineNumber, varWord.endColumn);
		const nameMatch = varWord.word.match(/^#(\w+:)?/);
		if (nameMatch) {
			const contentCol = varWord.startColumn + nameMatch[0].length;
			if (nameMatch[1] === 'file:') {
				return { type: 'file', contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
			} else if (nameMatch[1] === 'tool:') {
				return { type: 'tool', contentRange: new Range(position.lineNumber, contentCol, position.lineNumber, varWord.endColumn), range };
			}
		}
		return { type: '', contentRange: range, range };
	}

	private async collectDefaultCompletions(model: ITextModel, range: Range, promptFileType: PromptsType, suggestions: CompletionItem[]): Promise<void> {
		const labels = promptFileType === PromptsType.instructions ? ['file'] : ['file', 'tool'];
		labels.forEach(label => {
			suggestions.push({
				label: `${label}:`,
				kind: CompletionItemKind.Keyword,
				insertText: `${label}:`,
				range: range,
				command: { id: 'editor.action.triggerSuggest', title: 'Suggest' }
			});
		});
	}
}
