/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type { DocumentLinkMiddleware } from 'vscode-languageclient';
import { getFragmentFromLinkText } from '../util/linkFragment';

export function createDocumentLinkMiddleware(): DocumentLinkMiddleware {
	const fragments = new WeakMap<vscode.DocumentLink, string>();

	return {
		async provideDocumentLinks(document, token, next) {
			const links = await next(document, token);
			for (const link of links ?? []) {
				if (!link.target) {
					const fragment = getFragmentFromLinkText(document.getText(link.range));
					if (fragment) {
						fragments.set(link, fragment);
					}
				}
			}
			return links;
		},
		async resolveDocumentLink(link, token, next) {
			const fragment = fragments.get(link);
			const resolved = await next(link, token);
			// Keep resolved line/heading navigation and command targets (such as folders) intact.
			if (!token.isCancellationRequested && fragment && resolved?.target && !resolved.target.fragment && resolved.target.scheme !== 'command') {
				resolved.target = resolved.target.with({ fragment });
			}
			return resolved;
		},
	};
}
