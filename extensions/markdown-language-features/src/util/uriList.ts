/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from './arrays';
import * as vscode from 'vscode';

function splitUriList(str: string): string[] {
	return str.split('\r\n');
}

function parseUriList(str: string): string[] {
	return splitUriList(str)
		.filter(value => !value.startsWith('#')) // Remove comments
		.map(value => value.trim());
}

export class UriList {

	static from(str: string): UriList {
		return new UriList(coalesce(parseUriList(str).map(line => {
			try {
				return { uri: vscode.Uri.parse(line), str: line };
			} catch {
				// Uri parse failure
				return undefined;
			}
		})));
	}

	private constructor(
		public readonly entries: ReadonlyArray<{ readonly uri: vscode.Uri; readonly str: string }>
	) { }
}
