/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CompletionItem, TextDocument, Position, CompletionItemKind, CompletionItemProvider, CancellationToken, WorkspaceConfiguration, TextEdit, Range, SnippetString, workspace, ProviderResult } from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';
import TypingsStatus from '../utils/typingsStatus';

import * as PConst from '../protocol.const';
import { CompletionEntry, CompletionsRequestArgs, CompletionDetailsRequestArgs, CompletionEntryDetails, FileLocationRequestArgs } from '../protocol';
import * as Previewer from './previewer';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

class MyCompletionItem extends CompletionItem {

	document: TextDocument;
	position: Position;

	constructor(position: Position, document: TextDocument, entry: CompletionEntry) {
		super(entry.name);
		this.sortText = entry.sortText;
		this.kind = MyCompletionItem.convertKind(entry.kind);
		this.position = position;
		this.document = document;
		if (entry.replacementSpan) {
			let span: protocol.TextSpan = entry.replacementSpan;
			// The indexing for the range returned by the server uses 1-based indexing.
			// We convert to 0-based indexing.
			this.textEdit = TextEdit.replace(new Range(span.start.line - 1, span.start.offset - 1, span.end.line - 1, span.end.offset - 1), entry.name);
		} else {
			const text = document.getText(new Range(position.line, Math.max(0, position.character - entry.name.length), position.line, position.character)).toLowerCase();
			const entryName = entry.name.toLowerCase();
			for (let i = entryName.length; i >= 0; --i) {
				if (text.endsWith(entryName.substr(0, i))) {
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
			case PConst.Kind.variable:
			case PConst.Kind.localVariable:
				return CompletionItemKind.Variable;
			case PConst.Kind.memberVariable:
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
				return CompletionItemKind.Field;
			case PConst.Kind.function:
			case PConst.Kind.memberFunction:
			case PConst.Kind.constructSignature:
			case PConst.Kind.callSignature:
			case PConst.Kind.indexSignature:
				return CompletionItemKind.Function;
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
}

interface Configuration {
	useCodeSnippetsOnMethodSuggest?: boolean;
}

namespace Configuration {
	export const useCodeSnippetsOnMethodSuggest = 'useCodeSnippetsOnMethodSuggest';
}

export default class TypeScriptCompletionItemProvider implements CompletionItemProvider {

	public triggerCharacters = ['.'];
	public excludeTokens = ['string', 'comment', 'numeric'];
	public sortBy = [{ type: 'reference', partSeparator: '/' }];

	private client: ITypescriptServiceClient;
	private typingsStatus: TypingsStatus;
	private config: Configuration;

	constructor(client: ITypescriptServiceClient, typingsStatus: TypingsStatus) {
		this.client = client;
		this.typingsStatus = typingsStatus;
		this.config = { useCodeSnippetsOnMethodSuggest: false };
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		// Use shared setting for js and ts
		let typeScriptConfig = workspace.getConfiguration('typescript');
		this.config.useCodeSnippetsOnMethodSuggest = typeScriptConfig.get(Configuration.useCodeSnippetsOnMethodSuggest, false);
	}

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
		if (this.typingsStatus.isAcquiringTypings) {
			return Promise.reject({
				label: localize('acquiringTypingsLabel', 'Acquiring typings...'),
				detail: localize('acquiringTypingsDetail', 'Acquiring typings definitions for IntelliSense.')
			});
		}

		let filepath = this.client.asAbsolutePath(document.uri);
		if (!filepath) {
			return Promise.resolve<CompletionItem[]>([]);
		}
		let args: CompletionsRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1
		};
		if (!args.file) {
			return Promise.resolve<CompletionItem[]>([]);
		}

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

			let completionItems: CompletionItem[] = [];
			let body = msg.body;
			if (body) {
				for (let i = 0; i < body.length; i++) {
					let element = body[i];
					let item = new MyCompletionItem(position, document, element);
					completionItems.push(item);
				}
			}

			return completionItems;
		}, (err) => {
			this.client.error(`'completions' request failed with error.`, err);
			return [];
		});
	}

	public resolveCompletionItem(item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem> {
		if (item instanceof MyCompletionItem) {
			const filepath = this.client.asAbsolutePath(item.document.uri);
			if (!filepath) {
				return null;
			}
			let args: CompletionDetailsRequestArgs = {
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
				item.documentation = Previewer.plain(detail.documentation);
				item.detail = Previewer.plain(detail.displayParts);

				if (detail && this.config.useCodeSnippetsOnMethodSuggest && (item.kind === CompletionItemKind.Function || item.kind === CompletionItemKind.Method)) {
					return this.isValidFunctionCompletionContext(filepath, item.position).then(shouldCompleteFunction => {
						if (shouldCompleteFunction) {
							item.insertText = this.snippetForFunctionCall(detail);
						}
						return item;
					});
				}

				return item;
			}, (err) => {
				this.client.error(`'completionEntryDetails' request failed with error.`, err);
				return item;
			});
		}
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
			console.log(info && info.kind);
			switch (info && info.kind) {
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
		let codeSnippet = detail.name;
		const suggestionArgumentNames: string[] = detail.displayParts
			.filter(part => part.kind === 'parameterName')
			.map((part, i) => `\${${i + 1}:${part.text}}`);

		if (suggestionArgumentNames.length > 0) {
			codeSnippet += '(' + suggestionArgumentNames.join(', ') + ')$0';
		} else {
			codeSnippet += '()';
		}

		return new SnippetString(codeSnippet);
	}
}
