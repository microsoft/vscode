/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { compactCodiconsIn, getCompactCodicon } from '../../browser/chatIcons.js';

suite('ChatIcons', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses compact variants when registered', () => {
		assert.deepStrictEqual([
			getCompactCodicon(Codicon.warning).id,
			getCompactCodicon(ThemeIcon.modify(Codicon.loading, 'spin')).id,
			getCompactCodicon(Codicon.info).id,
		], [
			Codicon.warningCompact.id,
			ThemeIcon.modify(Codicon.loadingCompact, 'spin').id,
			Codicon.info.id,
		]);
	});

	test('updates rendered codicons', () => {
		const element = mainWindow.document.createElement('div');
		element.innerHTML = '<span class="codicon codicon-check"></span><span class="codicon codicon-info"></span>';

		compactCodiconsIn(element);

		assert.deepStrictEqual([...element.children].map(child => child.className), [
			'codicon codicon-check-compact',
			'codicon codicon-info',
		]);
	});
});
