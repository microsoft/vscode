/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Position, CompletionList, CompletionItemKind } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver-protocol/lib/protocol.workspaceFolders.proposed';
import * as path from 'path';
import * as fs from 'fs';
import uri from 'vscode-uri';

export function getPathCompletionParticipant(
	document: TextDocument,
	position: Position,
	result: CompletionList,
	workspaceFolders: WorkspaceFolder[] | undefined
) {
	return {
		onHtmlAttributeValue: (tag, attributeName, attributeValue) => {
			const pathTagAndAttribute: { [t: string]: string } = {
				a: 'href',
				script: 'src',
				img: 'src',
				link: 'href'
			};

			const isDir = (p: string) => fs.statSync(p).isDirectory();

			if (pathTagAndAttribute[tag] && pathTagAndAttribute[tag] === attributeName) {
				const currPath = attributeValue.replace(/['"]/g, '');

				let resolvedPath;
				if (currPath.startsWith('/')) {
					if (!workspaceFolders || workspaceFolders.length === 0) {
						return;
					}
					for (let i = 0; i < workspaceFolders.length; i++) {
						if (document.uri.indexOf(workspaceFolders[i].uri) !== -1) {
							resolvedPath = path.resolve(uri.parse(workspaceFolders[i].uri).fsPath);
						}
					}
				} else {
					resolvedPath = path.resolve(uri.parse(document.uri).fsPath, '..', currPath);
				}

				if (resolvedPath && isDir(resolvedPath)) {
					const filesAndFolders = fs.readdirSync(resolvedPath);
					if (!result.items) {
						result.items = [];
					}
					for (let i = 0; i < filesAndFolders.length; i++) {
						const kind = isDir(path.resolve(resolvedPath, filesAndFolders[i]))
							? CompletionItemKind.Folder
							: CompletionItemKind.File;
						result.items.push({
							label: filesAndFolders[i],
							kind
						});
					}
				}
			}
		}
	};
}
