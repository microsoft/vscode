/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { promoteActiveLanguage } from '../../browser/commands/configureSnippets.js';

suite('Configure Snippets', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	type TestPick = { label: string; filepath: URI };

	function file(name: string): TestPick {
		return { label: name, filepath: URI.file(`/snippets/${name}`) };
	}

	function lang(id: string): TestPick {
		return { label: id, filepath: URI.file(`/snippets/${id}.json`) };
	}

	function reorder(existing: TestPick[], future: TestPick[], activeLanguageId: string | undefined) {
		promoteActiveLanguage(existing, future, activeLanguageId);
		return { existing: existing.map(p => p.label), future: future.map(p => p.label) };
	}

	test('promotes the active language in both groups', () => {
		// existing file for python, and a new-language entry for python -> both jump to front
		const existing = [file('global.code-snippets'), file('javascript.json'), file('python.json')];
		const future = [lang('csharp'), lang('go'), lang('python')];

		assert.deepStrictEqual(reorder(existing, future, 'python'), {
			existing: ['python.json', 'global.code-snippets', 'javascript.json'],
			future: ['python', 'csharp', 'go']
		});
	});

	test('no-op cases: no active language, already first, or not present', () => {
		const existing = () => [file('javascript.json'), file('python.json')];
		const future = () => [lang('go'), lang('python')];

		// undefined active language leaves order untouched
		assert.deepStrictEqual(reorder(existing(), future(), undefined), {
			existing: ['javascript.json', 'python.json'],
			future: ['go', 'python']
		});

		// already first in the existing group -> untouched
		assert.deepStrictEqual(reorder(existing(), future(), 'javascript'), {
			existing: ['javascript.json', 'python.json'],
			future: ['go', 'python'] // no future entry for javascript, so future untouched too
		});

		// language absent from both groups -> untouched
		assert.deepStrictEqual(reorder(existing(), future(), 'rust'), {
			existing: ['javascript.json', 'python.json'],
			future: ['go', 'python']
		});
	});
});
