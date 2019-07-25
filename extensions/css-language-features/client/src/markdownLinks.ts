/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

export function filterLinks(value: string, whiteList: string[]) {
	return value.replace(/\[([^\[\]]+)\]\(([^)]+)\)/g, (_, linkName: string, linkValue: string) => {
		try {
			const parsedUri = Uri.parse(linkValue);
			const domain = parsedUri.scheme + '://' + parsedUri.authority;

			if (whiteList.includes(domain)) {
				return `[${linkName}](${linkValue})`;
			} else {
				return `[${linkName}](command:css.askLinkPermission?${encodeURIComponent(
					JSON.stringify({ domain, linkValue })
				)})`;
			}
		} catch (err) {
			return `[${linkName}]()`;
		}
	});
}
