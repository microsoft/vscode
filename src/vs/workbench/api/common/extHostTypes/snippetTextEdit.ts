/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { SnippetString } from './snippetString.js';
import { Position } from './position.js';
import { Range } from './range.js';

export class SnippetTextEdit implements vscode.SnippetTextEdit {

	static isSnippetTextEdit(thing: unknown): thing is SnippetTextEdit {
		if (thing instanceof SnippetTextEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<SnippetTextEdit>thing).range)
			&& SnippetString.isSnippetString((<SnippetTextEdit>thing).snippet);
	}

	static replace(range: Range, snippet: SnippetString): SnippetTextEdit {
		return new SnippetTextEdit(range, snippet);
	}

	static insert(position: Position, snippet: SnippetString): SnippetTextEdit {
		return SnippetTextEdit.replace(new Range(position, position), snippet);
	}

	range: Range;

	snippet: SnippetString;

	keepWhitespace?: boolean;

	constructor(range: Range, snippet: SnippetString) {
		this.range = range;
		this.snippet = snippet;
	}
}
