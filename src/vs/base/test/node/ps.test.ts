/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

function findName(cmd: string, isOldVersion: boolean): string {
	const TYPE = /--type=([a-zA-Z-]+)/;
	// find "--type=xxxx"
	let matches = TYPE.exec(cmd);
	// find all xxxx.js
	const JS = isOldVersion ? /[a-zA-Z-]+\.js/g : /[a-zA-Z-]+\.js\b/g;
	let result = '';
	do {
		matches = JS.exec(cmd);
		if (matches) {
			result += matches + ' ';
		}
	} while (matches);

	if (result) {
		if (cmd.indexOf('node ') < 0 && cmd.indexOf('node.exe') < 0) {
			return `electron-nodejs (${result})`;
		}
	}
	return cmd;
}

const processCmd = `/Users/yaxiaoliu666/.trae/extensions/bradlc.vscode-tailwindcss-0.14.29-universal/dist/tailwindServer.js ... VSCODE_L10N_BUNDLE_LOCATION=file:///Users/yaxiaoliu666/work/code/lib/vscode/extensions/json-language-features/l10n/bundle.l10n.zh-cn.json ...`;

suite('find all xxxx.js', () => {

	test('test old error regexp', () => {

		strictEqual(findName(processCmd, true), 'electron-nodejs (tailwindServer.js zh-cn.js )');
	});

	test('test correctly regexp', () => {

		strictEqual(findName(processCmd, false), 'electron-nodejs (tailwindServer.js )');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
