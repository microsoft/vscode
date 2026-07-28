/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { workspace, Uri } from 'vscode';
import { getExtensionContext } from './main';
import { TextDecoder } from 'util';

const emojiRegex = /:([-+_a-z0-9]+):/g;

let emojiMap: Record<string, string> | undefined;
let emojiMapPromise: Promise<void> | undefined;

export async function ensureEmojis() {
	if (emojiMap === undefined) {
		if (emojiMapPromise === undefined) {
			emojiMapPromise = loadEmojiMap();
		}
		await emojiMapPromise;
	}
}

async function loadEmojiMap() {
	const context = getExtensionContext();
	const uri = Uri.joinPath(context.extensionUri, 'resources', 'emojis.json');
	emojiMap = JSON.parse(new TextDecoder('utf8').decode(await workspace.fs.readFile(uri)));
}

export function emojify(message: string) {
	if (emojiMap === undefined) {
		return message;
	}

	return message.replace(emojiRegex, (s, code) => {
		return emojiMap?.[code] || s;
	});
}
