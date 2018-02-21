/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Position, CompletionList, CompletionItemKind, TextEdit } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver-protocol/lib/protocol.workspaceFolders.proposed';
import * as path from 'path';
import * as fs from 'fs';
import uri from 'vscode-uri';
import { ICompletionParticipant } from 'vscode-html-languageservice/lib/htmlLanguageService';

export function getPathCompletionParticipant(
	document: TextDocument,
	position: Position,
	result: CompletionList,
	workspaceFolders: WorkspaceFolder[] | undefined
): ICompletionParticipant {
	return {
		onHtmlAttributeValue: ({ tag, attribute, value, range }) => {
			const pathTagAndAttribute: { [t: string]: string } = {
				a: 'href',
				script: 'src',
				img: 'src',
				link: 'href'
			};

			const isDir = (p: string) => fs.statSync(p).isDirectory();

			if (pathTagAndAttribute[tag] && pathTagAndAttribute[tag] === attribute) {
				const currPath = value.replace(/['"]/g, '');

				let resolvedDirPath;
				if (currPath[0] === ('/')) {
					if (!workspaceFolders || workspaceFolders.length === 0) {
						return;
					}
					for (let i = 0; i < workspaceFolders.length; i++) {
						if (document.uri.indexOf(workspaceFolders[i].uri) !== -1) {
							resolvedDirPath = path.resolve(uri.parse(workspaceFolders[i].uri).fsPath);
						}
					}
				} else {
					resolvedDirPath = path.resolve(uri.parse(document.uri).fsPath, '..', currPath);
				}

				if (resolvedDirPath && isDir(resolvedDirPath)) {
					const filesAndFolders = fs.readdirSync(resolvedDirPath);
					if (!result.items) {
						result.items = [];
					}
					for (let i = 0; i < filesAndFolders.length; i++) {
						const resolvedCompletionItemPath = path.resolve(resolvedDirPath, filesAndFolders[i]);
						const kind = isDir(resolvedCompletionItemPath)
							? CompletionItemKind.Folder
							: CompletionItemKind.File;
						result.items.push({
							label: filesAndFolders[i],
							kind,
							textEdit: TextEdit.replace(range, filesAndFolders[i])
						});
					}
				}
			}
		}
	};
}
