/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CompletionItem, TextDocument, Position, CompletionItemKind, CompletionItemProvider, CancellationToken } from 'vscode';

import { IConfiguration, defaultConfiguration } from './configuration';
import { ITypescriptServiceClient } from '../typescriptService';

import * as PConst from '../protocol.const';
import { CompletionEntry, CompletionsRequestArgs, CompletionsResponse, CompletionDetailsRequestArgs, CompletionDetailsResponse, CompletionEntryDetails } from '../protocol';
import * as Previewer from './previewer';

class MyCompletionItem extends CompletionItem {

	document: TextDocument;
	position: Position;

	constructor(entry: CompletionEntry) {
		super(entry.name);
		this.sortText = entry.sortText;
		this.kind = MyCompletionItem.convertKind(entry.kind);
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
				return CompletionItemKind.Module;
			case PConst.Kind.class:
				return CompletionItemKind.Class;
			case PConst.Kind.interface:
				return CompletionItemKind.Interface;
		}

		return CompletionItemKind.Property;
	}
}

export default class TypeScriptCompletionItemProvider implements CompletionItemProvider {

	public triggerCharacters = ['.'];
	public excludeTokens = ['string', 'comment', 'numeric'];
	public sortBy = [{ type: 'reference', partSeparator: '/' }];

	private client: ITypescriptServiceClient;
	private config: IConfiguration;

	constructor(client: ITypescriptServiceClient) {
		this.client = client;
		this.config = defaultConfiguration;
	}

	public setConfiguration(config: IConfiguration): void {
		this.config = config;
	}

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {
		let filepath = this.client.asAbsolutePath(document.uri);
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

			for (let i = 0; i < body.length; i++) {
				let element = body[i];
				let item = new MyCompletionItem(element);
				item.document = document;
				item.position = position;

				completionItems.push(item);
			}

			return completionItems;

		}, (err: CompletionsResponse) => {
			return [];
		});
	}

	/**
	 * This method extract parameters and functions for completion
	 * Mode: lambda will generate lambda expression for functions as parameter and
	 * anything else will keep place holder for function name.
	 * isNested: will keep track of nested functions in parameter
	 */
	private extractMethodParameters(displayParts: any, mode = "lambda", isNested = false) {
		let result = '';
		while (displayParts.length > 0) {
			let nextItem = displayParts.length > 1 ? displayParts[1].text : '';
			if (nextItem === '(') {
				let currentFunctionName = displayParts[0].text;
				displayParts = displayParts.slice(2);
				let openParentheses = 1;
				let innerParameters = [];
				while (openParentheses !== 0) {
					if (displayParts[0].text === '(') {
						openParentheses++;
					}
					else if (displayParts[0].text === ')') {
						openParentheses--;
					}
					else {
						innerParameters.push(displayParts.shift());
					}
					if (openParentheses === 0) {
						displayParts.shift();
						let comma = displayParts.length > 0 ? ', ' : ''
						if (mode === "lambda") {
							if (innerParameters.length === 0) {
								result += `()`;
							} else if (innerParameters.length === 1) {
								result += innerParameters[0].text.substr(0, 3);
							} else {
								result += this.extractMethodParameters(innerParameters, mode, true);
							}
							result += ` => {\n\t\t{{}}\n\t}${comma}`;

						} else {
							result += `{{${currentFunctionName}}}${comma} `;
						}
					}
				}
			} else {
				result += isNested ? displayParts.shift().text.substr(0, 3) : `{{${displayParts.shift().text}}}`;
				result += displayParts.length > 0 ? ', ' : '';

			}
		}
		return `(${result})`;

	}

	/**
	 * Filter everythings except parameterName and parenthesis
	 */
	private simplifyItems(displayParts: any) {

		let reachedFirstParameter = false;
		let simplified = displayParts
			.filter(part=> {
				if (!reachedFirstParameter)
					reachedFirstParameter = part.kind === 'parameterName'
				return reachedFirstParameter
			})
			.filter(part=>
				part.kind === 'parameterName' ||
				/(\(|\))+/ig.test(part.text)
			)
		//drop method close parenthesis
		simplified.pop();

		return simplified;
	}


	public resolveCompletionItem(item: CompletionItem, token: CancellationToken): any | Thenable<any> {
		if (item instanceof MyCompletionItem) {

			let args: CompletionDetailsRequestArgs = {
				file: this.client.asAbsolutePath(item.document.uri),
				line: item.position.line + 1,
				offset: item.position.character + 1,
				entryNames: [item.label]
			};
			return this.client.execute('completionEntryDetails', args, token).then((response) => {
				let details = response.body;
				let detail: CompletionEntryDetails = null;
				if (details && details.length > 0) {
					detail = details[0];
					item.documentation = Previewer.plain(detail.documentation);
					item.detail = Previewer.plain(detail.displayParts);
				}

				if (detail && this.config.useCodeSnippetsOnMethodSuggest !== "none" && item.kind === CompletionItemKind.Function) {
					let codeSnippet = detail.name;
					codeSnippet += this.extractMethodParameters(this.simplifyItems(detail.displayParts), this.config.useCodeSnippetsOnMethodSuggest)

					item.insertText = codeSnippet;
				}

				return item;

			}, (err: CompletionDetailsResponse) => {
				return item;
			});

		}
	}
}