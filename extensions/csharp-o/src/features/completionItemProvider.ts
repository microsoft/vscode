/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {plain} from './documentation';
import AbstractSupport from './abstractProvider';
import * as proto from '../protocol';
import {createRequest} from '../typeConvertion';
import {CompletionItemProvider, CompletionItem, CompletionItemKind, Uri, CancellationToken, TextDocument, Range, Position} from 'vscode';

export default class OmniSharpCompletionItemProvider extends AbstractSupport implements CompletionItemProvider {

	public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): Promise<CompletionItem[]> {

		let wordToComplete = '';
		let range = document.getWordRangeAtPosition(position);
		if (range) {
			wordToComplete = document.getText(new Range(range.start, position));
		}

		let req = createRequest<proto.AutoCompleteRequest>(document, position);
		req.WordToComplete = wordToComplete;
		req.WantDocumentationForEveryCompletionResult = true;
		req.WantKind = true;

		return this._server.makeRequest<proto.AutoCompleteResponse[]>(proto.AutoComplete, req).then(values => {

			if (!values) {
				return;
			}

			let result: CompletionItem[] = [];
			let completions: { [c: string]: CompletionItem[] } = Object.create(null);

			// transform AutoCompleteResponse to CompletionItem and
			// group by code snippet
			for (let value of values) {
				let completion = new CompletionItem(value.CompletionText.replace(/\(|\)|<|>/g, ''));
				completion.detail = value.DisplayText;
				completion.documentation = plain(value.Description);
				completion.kind = _kinds[value.Kind] || CompletionItemKind.Property;

				let array = completions[completion.label];
				if (!array) {
					completions[completion.label] = [completion];
				} else {
					array.push(completion);
				}
			}

			// per suggestion group, select on and indicate overloads
			for (let key in completions) {

				let suggestion = completions[key][0],
					overloadCount = completions[key].length - 1;

				if (overloadCount === 0) {
					// remove non overloaded items
					delete completions[key];

				} else {
					// indicate that there is more
					suggestion.detail = `${suggestion.detail} (+ ${overloadCount} overload(s))`;
				}
				result.push(suggestion);
			}

			return result;
		});
	}
}

var _kinds: { [kind: string]: CompletionItemKind; } = Object.create(null);
_kinds['Variable'] = CompletionItemKind.Variable;
_kinds['Struct'] = CompletionItemKind.Interface;
_kinds['Interface'] = CompletionItemKind.Interface;
_kinds['Enum'] = CompletionItemKind.Enum;
_kinds['EnumMember'] = CompletionItemKind.Property;
_kinds['Property'] = CompletionItemKind.Property;
_kinds['Class'] = CompletionItemKind.Class;
_kinds['Field'] = CompletionItemKind.Field;
_kinds['EventField'] = CompletionItemKind.File;
_kinds['Method'] = CompletionItemKind.Method;
