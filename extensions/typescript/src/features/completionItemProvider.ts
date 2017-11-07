/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItem, TextDocument, Position, CompletionItemKind, CompletionItemProvider, CancellationToken, TextEdit, Range, SnippetString, workspace, ProviderResult, CompletionContext, Uri, MarkdownString } from 'vscode';

import { ITypeScriptServiceClient } from '../typescriptService';
import TypingsStatus from '../utils/typingsStatus';

import * as PConst from '../protocol.const';
import { CompletionEntry, CompletionsRequestArgs, CompletionDetailsRequestArgs, CompletionEntryDetails, CodeAction } from '../protocol';
import * as Previewer from './previewer';
import { tsTextSpanToVsRange, vsPositionToTsFileLocation } from '../utils/convert';

import * as nls from 'vscode-nls';
import { applyCodeAction } from '../utils/codeAction';
import * as languageModeIds from '../utils/languageModeIds';
import { CommandManager } from '../utils/commandManager';

let localize = nls.loadMessageBundle();

class MyCompletionItem extends CompletionItem {
	public readonly source: string | undefined;
	constructor(
		public readonly position: Position,
		public readonly document: TextDocument,
		entry: CompletionEntry,
		enableDotCompletions: boolean,
		public readonly useCodeSnippetsOnMethodSuggest: boolean
	) {
		super(entry.name);
		this.source = entry.source;
		this.sortText = entry.sortText;
		this.kind = MyCompletionItem.convertKind(entry.kind);
		this.position = position;
		this.commitCharacters = MyCompletionItem.getCommitCharacters(enableDotCompletions, !useCodeSnippetsOnMethodSuggest, entry.kind);

		if (entry.replacementSpan) {
			let span: protocol.TextSpan = entry.replacementSpan;
			// The indexing for the range returned by the server uses 1-based indexing.
			// We convert to 0-based indexing.
			this.textEdit = TextEdit.replace(tsTextSpanToVsRange(span), entry.name);
		} else {
			// Try getting longer, prefix based range for completions that span words
			const wordRange = document.getWordRangeAtPosition(position);
			const text = document.getText(new Range(position.line, Math.max(0, position.character - entry.name.length), position.line, position.character)).toLowerCase();
			const entryName = entry.name.toLowerCase();
			for (let i = entryName.length; i >= 0; --i) {
				if (text.endsWith(entryName.substr(0, i)) && (!wordRange || wordRange.start.character > position.character - i)) {
					this.range = new Range(position.line, Math.max(0, position.character - i), position.line, position.character);
					break;
				}
			}
		}
	}

	private static convertKind(kind: string): CompletionItemKind {
		switch (kind) {
			case PConst.Kind.primitiveType:
			case PConst.Kind.keyword:
				return CompletionItemKind.Keyword;
			case PConst.Kind.const:
				return CompletionItemKind.Constant;
			case PConst.Kind.let:
			case PConst.Kind.variable:
			case PConst.Kind.localVariable:
			case PConst.Kind.alias:
				return CompletionItemKind.Variable;
			case PConst.Kind.memberVariable:
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
				return CompletionItemKind.Field;
			case PConst.Kind.function:
				return CompletionItemKind.Function;
			case PConst.Kind.memberFunction:
			case PConst.Kind.constructSignature:
			case PConst.Kind.callSignature:
			case PConst.Kind.indexSignature:
				return CompletionItemKind.Method;
			case PConst.Kind.enum:
				return CompletionItemKind.Enum;
			case PConst.Kind.module:
			case PConst.Kind.externalModuleName:
				return CompletionItemKind.Module;
			case PConst.Kind.class:
			case PConst.Kind.type:
				return CompletionItemKind.Class;
			case PConst.Kind.interface:
				return CompletionItemKind.Interface;
			case PConst.Kind.warning:
			case PConst.Kind.file:
			case PConst.Kind.script:
				return CompletionItemKind.File;
			case PConst.Kind.directory:
				return CompletionItemKind.Folder;
		}
		return CompletionItemKind.Property;
	}

	private static getCommitCharacters(enableDotCompletions: boolean, enableCallCompletions: boolean, kind: string): string[] | undefined {
		switch (kind) {
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
			case PConst.Kind.constructSignature:
			case PConst.Kind.callSignature:
			case PConst.Kind.indexSignature:
			case PConst.Kind.enum:
			case PConst.Kind.interface:
				return enableDotCompletions ? ['.'] : undefined;

			case PConst.Kind.module:
			case PConst.Kind.alias:
			case PConst.Kind.const:
			case PConst.Kind.let:
			case PConst.Kind.variable:
			case PConst.Kind.localVariable:
			case PConst.Kind.memberVariable:
			case PConst.Kind.class:
			case PConst.Kind.function:
			case PConst.Kind.memberFunction:
				return enableDotCompletions ? (enableCallCompletions ? ['.', '('] : ['.']) : undefined;
		}

		return undefined;
	}
}

interface Configuration {
	useCodeSnippetsOnMethodSuggest: boolean;
	nameSuggestions: boolean;
	quickSuggestionsForPaths: boolean;
	autoImportSuggestions: boolean;
}

namespace Configuration {
	export const useCodeSnippetsOnMethodSuggest = 'useCodeSnippetsOnMethodSuggest';
	export const nameSuggestions = 'nameSuggestions';
	export const quickSuggestionsForPaths = 'quickSuggestionsForPaths';
	export const autoImportSuggestions = 'autoImportSuggestions.enabled';

}

export default class TypeScriptCompletionItemProvider implements CompletionItemProvider {
	private readonly commandId: string;

	constructor(
		private client: ITypeScriptServiceClient,
		mode: string,
		private readonly typingsStatus: TypingsStatus,
		commandManager: CommandManager
	) {
		this.commandId = `_typescript.applyCompletionCodeAction.${mode}`;
		commandManager.registerCommand(this.commandId, this.applyCompletionCodeAction, this);
	}

	public async provideCompletionItems(
		document: TextDocument,
		position: Position,
		token: CancellationToken,
		context: CompletionContext
	): Promise<CompletionItem[]> {
		if (this.typingsStatus.isAcquiringTypings) {
			return Promise.reject<CompletionItem[]>({
				label: localize(
					{ key: 'acquiringTypingsLabel', comment: ['Typings refers to the *.d.ts typings files that power our IntelliSense. It should not be localized'] },
					'Acquiring typings...'),
				detail: localize(
					{ key: 'acquiringTypingsDetail', comment: ['Typings refers to the *.d.ts typings files that power our IntelliSense. It should not be localized'] },
					'Acquiring typings definitions for IntelliSense.')
			});
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const config = this.getConfiguration(document.uri);

		if (context.triggerCharacter === '"' || context.triggerCharacter === '\'') {
			if (!config.quickSuggestionsForPaths) {
				return [];
			}

			// make sure we are in something that looks like the start of an import
			const line = document.lineAt(position.line).text.slice(0, position.character);
			if (!line.match(/\b(from|import)\s*["']$/) && !line.match(/\b(import|require)\(['"]$/)) {
				return [];
			}
		}

		if (context.triggerCharacter === '/') {
			if (!config.quickSuggestionsForPaths) {
				return [];
			}

			// make sure we are in something that looks like an import path
			const line = document.lineAt(position.line).text.slice(0, position.character);
			if (!line.match(/\b(from|import)\s*["'][^'"]*$/) && !line.match(/\b(import|require)\(['"][^'"]*$/)) {
				return [];
			}
		}

		if (context.triggerCharacter === '@') {
			// make sure we are in something that looks like the start of a jsdoc comment
			const line = document.lineAt(position.line).text.slice(0, position.character);
			if (!line.match(/^\s*\*[ ]?@/) && !line.match(/\/\*\*+[ ]?@/)) {
				return [];
			}
		}

		try {
			const args = {
				...vsPositionToTsFileLocation(file, position),
				includeExternalModuleExports: config.autoImportSuggestions
			} as CompletionsRequestArgs;
			const msg = await this.client.execute('completions', args, token);
			// This info has to come from the tsserver. See https://github.com/Microsoft/TypeScript/issues/2831
			// let isMemberCompletion = false;
			// let requestColumn = position.character;
			// if (wordAtPosition) {
			// 	requestColumn = wordAtPosition.startColumn;
			// }
			// if (requestColumn > 0) {
			// 	let value = model.getValueInRange({
			// 		startLineNumber: position.line,
			// 		startColumn: requestColumn - 1,
			// 		endLineNumber: position.line,
			// 		endColumn: requestColumn
			// 	});
			// 	isMemberCompletion = value === '.';
			// }

			const completionItems: CompletionItem[] = [];
			const body = msg.body;
			if (body) {
				// Only enable dot completions in TS files for now
				let enableDotCompletions = document && (document.languageId === languageModeIds.typescript || document.languageId === languageModeIds.typescriptreact);

				// TODO: Workaround for https://github.com/Microsoft/TypeScript/issues/13456
				// Only enable dot completions when previous character is an identifier.
				// Prevents incorrectly completing while typing spread operators.
				if (position.character > 1) {
					const preText = document.getText(new Range(
						position.line, 0,
						position.line, position.character - 1));
					enableDotCompletions = preText.match(/[a-z_$\)\]\}]\s*$/ig) !== null;
				}

				for (const element of body) {
					if (element.kind === PConst.Kind.warning && !config.nameSuggestions) {
						continue;
					}
					if (!config.autoImportSuggestions && element.hasAction) {
						continue;
					}
					const item = new MyCompletionItem(position, document, element, enableDotCompletions, config.useCodeSnippetsOnMethodSuggest);
					completionItems.push(item);
				}
			}

			return completionItems;
		} catch {
			return [];
		}
	}

	public resolveCompletionItem(item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem> {
		if (!(item instanceof MyCompletionItem)) {
			return null;
		}

		const filepath = this.client.normalizePath(item.document.uri);
		if (!filepath) {
			return null;
		}
		const args: CompletionDetailsRequestArgs = {
			...vsPositionToTsFileLocation(filepath, item.position),
			entryNames: [
				item.source ? { name: item.label, source: item.source } : item.label
			]
		};
		return this.client.execute('completionEntryDetails', args, token).then((response) => {
			const details = response.body;
			if (!details || !details.length || !details[0]) {
				return item;
			}
			const detail = details[0];
			item.detail = Previewer.plain(detail.displayParts);
			const documentation = new MarkdownString();
			if (item.source) {
				let importPath = `'${item.source}'`;
				// Try to resolve the real import name that will be added
				if (detail.codeActions && detail.codeActions[0]) {
					const action = detail.codeActions[0];
					if (action.changes[0] && action.changes[0].textChanges[0]) {
						const textChange = action.changes[0].textChanges[0];
						const matchedImport = textChange.newText.match(/(['"])(.+?)\1/);
						if (matchedImport) {
							importPath = matchedImport[0];
							item.detail += ` — from ${matchedImport[0]}`;
						}
					}
				}
				documentation.appendMarkdown(localize('autoImportLabel', 'Auto import from {0}', importPath));
				documentation.appendMarkdown('\n\n');
			}

			Previewer.addmarkdownDocumentation(documentation, detail.documentation, detail.tags);
			item.documentation = documentation;

			if (detail.codeActions && detail.codeActions.length) {
				item.command = {
					title: '',
					command: this.commandId,
					arguments: [filepath, detail.codeActions]
				};
			}

			if (detail && item.useCodeSnippetsOnMethodSuggest && (item.kind === CompletionItemKind.Function || item.kind === CompletionItemKind.Method)) {
				return this.isValidFunctionCompletionContext(filepath, item.position).then(shouldCompleteFunction => {
					if (shouldCompleteFunction) {
						item.insertText = this.snippetForFunctionCall(detail);
					}
					return item;
				});
			}

			return item;
		}, () => {
			return item;
		});
	}

	private isValidFunctionCompletionContext(filepath: string, position: Position): Promise<boolean> {
		const args = vsPositionToTsFileLocation(filepath, position);
		// Workaround for https://github.com/Microsoft/TypeScript/issues/12677
		// Don't complete function calls inside of destructive assigments or imports
		return this.client.execute('quickinfo', args).then(infoResponse => {
			const info = infoResponse.body;
			switch (info && info.kind as string) {
				case 'var':
				case 'let':
				case 'const':
				case 'alias':
					return false;
				default:
					return true;
			}
		}, () => {
			return true;
		});
	}

	private snippetForFunctionCall(detail: CompletionEntryDetails): SnippetString {
		const suggestionArgumentNames: string[] = [];
		let parenCount = 0;
		for (let i = 0; i < detail.displayParts.length; ++i) {
			const part = detail.displayParts[i];
			// Only take top level paren names
			if (part.kind === 'parameterName' && parenCount === 1) {
				suggestionArgumentNames.push(`\${${i + 1}:${part.text}}`);
			} else if (part.kind === 'punctuation') {
				if (part.text === '(') {
					++parenCount;
				} else if (part.text === ')') {
					--parenCount;
				}
			}
		}

		let codeSnippet = detail.name;
		if (suggestionArgumentNames.length > 0) {
			codeSnippet += '(' + suggestionArgumentNames.join(', ') + ')$0';
		} else {
			codeSnippet += '()';
		}

		return new SnippetString(codeSnippet);
	}

	private async applyCompletionCodeAction(file: string, codeActions: CodeAction[]): Promise<boolean> {
		for (const action of codeActions) {
			if (!(await applyCodeAction(this.client, action, file))) {
				return false;
			}
		}
		return true;
	}


	private getConfiguration(resource: Uri): Configuration {
		// Use shared setting for js and ts
		const typeScriptConfig = workspace.getConfiguration('typescript', resource);
		return {
			useCodeSnippetsOnMethodSuggest: typeScriptConfig.get<boolean>(Configuration.useCodeSnippetsOnMethodSuggest, false),
			quickSuggestionsForPaths: typeScriptConfig.get<boolean>(Configuration.quickSuggestionsForPaths, true),
			autoImportSuggestions: typeScriptConfig.get<boolean>(Configuration.autoImportSuggestions, true),
			nameSuggestions: workspace.getConfiguration('javascript', resource).get(Configuration.nameSuggestions, true)
		};
	}
}
