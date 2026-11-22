/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as glob from '../../../../../base/common/glob.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { escapeGlobPattern, resolveResourcesForSearchIncludes } from '../../common/queryBuilder.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';

suite('QueryBuilderCommon', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let context: IWorkspaceContextService;

	setup(() => {
		const workspace = testWorkspace(URI.file(isWindows ? 'C:\\testWorkspace' : '/testWorkspace'));
		context = new TestContextService(workspace);
	});

	test('resolveResourcesForSearchIncludes passes through paths without special glob characters', () => {
		const actual = resolveResourcesForSearchIncludes([URI.file(isWindows ? 'C:\\testWorkspace\\pages\\blog' : '/testWorkspace/pages/blog')], context);
		assert.deepStrictEqual(actual, ['./pages/blog']);
	});

	test('resolveResourcesForSearchIncludes escapes paths with special characters', () => {
		const actual = resolveResourcesForSearchIncludes([URI.file(isWindows ? 'C:\\testWorkspace\\pages\\blog\\[postId]' : '/testWorkspace/pages/blog/[postId]')], context);
		assert.deepStrictEqual(actual, ['./pages/blog/[[]postId[]]']);
	});

	test('escapeGlobPattern properly escapes square brackets for literal matching', () => {
		// This test verifies the fix for issue #233049 where files with square brackets in names
		// were not found when using "Search Only in Open Editors"

		// Test file name with square brackets
		const fileName = 'file[test].txt';

		// Without escaping, the pattern treats [test] as a character class
		const unescapedResult = glob.match(fileName, fileName);
		assert.strictEqual(unescapedResult, false, 'Unescaped pattern should not match due to character class interpretation');

		// With escaping, the pattern matches literally
		const escapedPattern = escapeGlobPattern(fileName);
		const escapedResult = glob.match(escapedPattern, fileName);
		assert.strictEqual(escapedResult, true, 'Escaped pattern should match literally');
		assert.strictEqual(escapedPattern, 'file[[]test[]].txt', 'Pattern should have escaped brackets');
	});

	test('resolveResourcesForSearchIncludes escapes paths with curly braces', () => {
		const actual = resolveResourcesForSearchIncludes([URI.file(isWindows ? 'C:\\testWorkspace\\{{cookiecutter.name}}' : '/testWorkspace/{{cookiecutter.name}}')], context);
		assert.deepStrictEqual(actual, ['./[{][{]cookiecutter.name[}][}]']);
	});

	test('escapeGlobPattern properly escapes curly braces for literal matching', () => {
		// Folders like `{{cookiecutter.name}}` must not be read as (nested) brace expansion, see #194701
		const fileName = '{{cookiecutter.name}}/a{b,c}.txt';

		const escapedPattern = escapeGlobPattern(fileName);
		assert.strictEqual(escapedPattern, '[{][{]cookiecutter.name[}][}]/a[{]b,c[}].txt');
		assert.strictEqual(glob.match(escapedPattern, fileName), true, 'Escaped pattern should match literally');
		assert.strictEqual(glob.match(escapedPattern, 'cookiecutter.name/ab.txt'), false, 'Escaped pattern should not expand braces');
	});
});
