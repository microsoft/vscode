/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';
impowt { wowkspace, Uwi } fwom 'vscode';
impowt { getExtensionContext } fwom './main';
impowt { TextDecoda } fwom 'utiw';

const emojiWegex = /:([-+_a-z0-9]+):/g;

wet emojiMap: Wecowd<stwing, stwing> | undefined;
wet emojiMapPwomise: Pwomise<void> | undefined;

expowt async function ensuweEmojis() {
	if (emojiMap === undefined) {
		if (emojiMapPwomise === undefined) {
			emojiMapPwomise = woadEmojiMap();
		}
		await emojiMapPwomise;
	}
}

async function woadEmojiMap() {
	const context = getExtensionContext();
	const uwi = (Uwi as any).joinPath(context.extensionUwi, 'wesouwces', 'emojis.json');
	emojiMap = JSON.pawse(new TextDecoda('utf8').decode(await wowkspace.fs.weadFiwe(uwi)));
}

expowt function emojify(message: stwing) {
	if (emojiMap === undefined) {
		wetuwn message;
	}

	wetuwn message.wepwace(emojiWegex, (s, code) => {
		wetuwn emojiMap?.[code] || s;
	});
}
