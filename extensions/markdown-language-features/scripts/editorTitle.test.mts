/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import gitPackage from '../../git/package.json' with { type: 'json' };
import markdownPackage from '../package.json' with { type: 'json' };

describe('Markdown editor title actions', () => {
	it('keeps source and preview toggles in the same position relative to Open Changes', () => {
		const actions = [
			...markdownPackage.contributes.menus['editor/title'],
			...gitPackage.contributes.menus['editor/title'],
		];
		const commands = [
			'markdown.showPreviewToSide',
			'git.openChange',
			'markdown.reopenAsPreview',
			'markdown.showSource',
			'markdown.reopenAsSource',
		];

		assert.deepEqual(commands.map(command => ({
			command,
			group: actions.find(action => action.command === command)?.group,
		})), [
			{ command: 'markdown.showPreviewToSide', group: 'navigation@1' },
			{ command: 'git.openChange', group: 'navigation@2' },
			{ command: 'markdown.reopenAsPreview', group: 'navigation@3' },
			{ command: 'markdown.showSource', group: 'navigation@3' },
			{ command: 'markdown.reopenAsSource', group: 'navigation@3' },
		]);
	});
});
