/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItem, TextDocument, Position, CompletionItemKind, CompletionItemProvider, CancellationToken, TextEdit, Range, SnippetString, workspace, ProviderResult } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';
import TypingsStatus from '../utils/typingsStatus';

import * as PConst from '../protocol.const';
import { CompletionEntry, CompletionsRequestArgs, CompletionDetailsRequestArgs, CompletionEntryDetails, FileLocationRequestArgs } from '../protocol';
import * as Previewer from './previewer';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

class MyCompletionItem extends CompletionItem {
	constructor(
		public position: Position,
		public document: TextDocument,
		entry: CompletionEntry,
		enableDotCompletions: boolean,
		enableCallCompletions: boolean
	) {
		super(entry.name);
		this.sortText = entry.sortText;
		this.kind = MyCompletionItem.convertKind(entry.kind);
		this.position = position;
		this.commitCharacters = MyCompletionItem.getCommitCharacters(enableDotCompletions, enableCallCompletions, entry.kind);
		if (entry.replacementSpan) {
			let span: protocol.TextSpan = entry.replacementSpan;
			// The indexing for the range returned by the server uses 1-based indexing.
			// We convert to 0-based indexing.
			this.textEdit = TextEdit.replace(new Range(span.start.line - 1, span.start.offset - 1, span.end.line - 1, span.end.offset - 1), entry.name);
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
			case PConst.Kind.externalModuleName:
				return ['"', '\''];

			case PConst.Kind.file:
			case PConst.Kind.directory:
				return ['"', '\''];

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
}

namespace Configuration {
	export const useCodeSnippetsOnMethodSuggest = 'useCodeSnippetsOnMethodSuggest';
	export const nameSuggestions = 'nameSuggestions';
}

export default class TypeScriptCompletionItemProvider implements CompletionItemProvider {

	private config: Configuration;

	constructor(
		private client: ITypescriptServiceClient,
		private typingsStatus: TypingsStatus
	) {
		this.config = {
			useCodeSnippetsOnMethodSuggest: false,
			nameSuggestions: true
		};
	}

	public updateConfiguration(): void {
		// Use shared setting for js and ts
		const typeScriptConfig = workspace.getConfiguration('typescript');
		this.config.useCodeSnippetsOnMethodSuggest = typeScriptConfig.get(Configuration.useCodeSnippetsOnMethodSuggest, false);

		const jsConfig = workspace.getConfiguration('javascript');
		this.config.nameSuggestions = jsConfig.get(Configuration.nameSuggestions, true);
	}

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
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
			return Promise.resolve<CompletionItem[]>([]);
		}
		const args: CompletionsRequestArgs = {
			file: file,
			line: position.line + 1,
			offset: position.character + 1
		};

		return this.client.execute('completions', args, token).then((msg) => {
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
				let enableDotCompletions = document && (document.languageId === 'typescript' || document.languageId === 'typescriptreact');

				// TODO: Workaround for https://github.com/Microsoft/TypeScript/issues/13456
				// Only enable dot completions when previous character is an identifier.
				// Prevents incorrectly completing while typing spread operators.
				if (position.character > 0) {
					const preText = document.getText(new Range(
						position.line, 0,
						position.line, position.character - 1));
					enableDotCompletions = preText.match(/[a-z_$\)\]\}]\s*$/ig) !== null;
				}

				for (const element of body) {
					if (element.kind === PConst.Kind.warning && !this.config.nameSuggestions) {
						continue;
					}
					const item = new MyCompletionItem(position, document, element, enableDotCompletions, !this.config.useCodeSnippetsOnMethodSuggest);
					completionItems.push(item);
				}
			}

			return completionItems;
		}, () => {
			return [];
		});
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
			file: filepath,
			line: item.position.line + 1,
			offset: item.position.character + 1,
			entryNames: [item.label]
		};
		return this.client.execute('completionEntryDetails', args, token).then((response) => {
			const details = response.body;
			if (!details || !details.length || !details[0]) {
				return item;
			}
			const detail = details[0];
			item.detail = Previewer.plain(detail.displayParts);

			item.documentation = Previewer.plainDocumentation(detail.documentation, detail.tags);

			if (detail && this.config.useCodeSnippetsOnMethodSuggest && (item.kind === CompletionItemKind.Function || item.kind === CompletionItemKind.Method)) {
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
		const args: FileLocationRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1
		};
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
}
