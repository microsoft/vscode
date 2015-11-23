/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, ReferenceProvider, Location, TextDocument, Position, Range, CancellationToken } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptReferenceSupport implements ReferenceProvider {

	private client: ITypescriptServiceClient;

	public tokens:string[] = [];

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	public provideReferences(document: TextDocument, position: Position, options: { includeDeclaration: boolean }, token: CancellationToken): Promise<Location[]> {
		let args: Proto.FileLocationRequestArgs = {
			file: this.client.asAbsolutePath(document.uri),
			line: position.line + 1,
			offset: position.character + 1
		};
		if (!args.file) {
			return Promise.resolve<Location[]>([]);
		}
		return this.client.execute('references', args, token).then((msg) => {
			let result: Location[] = [];
			let refs = msg.body.refs;
			for (let i = 0; i < refs.length; i++) {
				let ref = refs[i];
				let url = this.client.asUrl(ref.file);
				let location = new Location(
					url,
					new Range(ref.start.line - 1, ref.start.offset - 1, ref.end.line - 1, ref.end.offset - 1)
				);
				result.push(location);
			}
			return result;
		}, () => {
			return [];
		});
	}
}