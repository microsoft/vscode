/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import 'mocha';
import * as path from 'path';

type MenuItem = {
	readonly command: string;
};

type Manifest = {
	readonly contributes: {
		readonly menus: {
			readonly 'editor/title': readonly MenuItem[];
			readonly 'modalEditor/editorTitle': readonly MenuItem[];
		};
	};
};

function getManifest(): Manifest {
	const packageJsonPath = path.resolve(__dirname, '../../package.json');
	return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function assertCommandOrder(menu: readonly MenuItem[], firstCommand: string, secondCommand: string) {
	const firstIndex = menu.findIndex(item => item.command === firstCommand);
	const secondIndex = menu.findIndex(item => item.command === secondCommand);

	assert.ok(firstIndex >= 0, `Expected to find ${firstCommand} in menu contribution`);
	assert.ok(secondIndex >= 0, `Expected to find ${secondCommand} in menu contribution`);
	assert.ok(firstIndex < secondIndex, `Expected ${firstCommand} to appear before ${secondCommand}`);
}

suite('markdown manifest', () => {
	test('puts reopen as preview before open preview to the side in source editor title menus', () => {
		const manifest = getManifest();

		assertCommandOrder(manifest.contributes.menus['editor/title'], 'markdown.reopenAsPreview', 'markdown.showPreviewToSide');
		assertCommandOrder(manifest.contributes.menus['modalEditor/editorTitle'], 'markdown.reopenAsPreview', 'markdown.showPreviewToSide');
	});
});
