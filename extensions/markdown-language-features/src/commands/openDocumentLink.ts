/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownEngine } from '../markdownEngine';
import { openDocumentLink } from '../util/openDocumentLink';

type UriComponents = {
	readonly scheme?: string;
	readonly path: string;
	readonly fragment?: string;
	readonly authority?: string;
	readonly query?: string;
};

export interface OpenDocumentLinkArgs {
	readonly parts: UriComponents;
	readonly fragment: string;
	readonly fromResource: UriComponents;
}

export class OpenDocumentLinkCommand implements Command {
	private static readonly id = '_markdown.openDocumentLink';
	public readonly id = OpenDocumentLinkCommand.id;

	public static createCommandUri(
		fromResource: vscode.Uri,
		path: vscode.Uri,
		fragment: string,
	): vscode.Uri {
		const toJson = (uri: vscode.Uri): UriComponents => {
			return {
				scheme: uri.scheme,
				authority: uri.authority,
				path: uri.path,
				fragment: uri.fragment,
				query: uri.query,
			};
		};
		return vscode.Uri.parse(`command:${OpenDocumentLinkCommand.id}?${encodeURIComponent(JSON.stringify(<OpenDocumentLinkArgs>{
			parts: toJson(path),
			fragment,
			fromResource: toJson(fromResource),
		}))}`);
	}

	public constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async execute(args: OpenDocumentLinkArgs) {
		const fromResource = vscode.Uri.parse('').with(args.fromResource);
		const targetResource = reviveUri(args.parts).with({ fragment: args.fragment });
		return openDocumentLink(this.engine, targetResource, fromResource);
	}
}

function reviveUri(parts: any) {
	if (parts.scheme === 'file') {
		return vscode.Uri.file(parts.path);
	}
	return vscode.Uri.parse('').with(parts);
}
