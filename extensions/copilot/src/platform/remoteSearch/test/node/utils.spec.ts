/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { formatScopingQuery } from '../../common/utils';

suite('formatScopingQuery', () => {
	test('should format a scoping query with only a repo', () => {
		const query = { repo: 'owner/repo' };
		const result = formatScopingQuery(query);
		assert.strictEqual(result, '(repo:owner/repo)');
	});

	test('should format a scoping query with multiple repos', () => {
		const query = { repo: ['owner/repo', 'owner/repo2'] };
		const result = formatScopingQuery(query);
		assert.strictEqual(result, '(repo:owner/repo OR repo:owner/repo2)');
	});

	test('should format a scoping query with a repo and a language', () => {
		const query = { repo: 'owner/repo', lang: ['typescript', 'javascript'] };
		const result = formatScopingQuery(query);
		assert.strictEqual(result, '(repo:owner/repo) (lang:typescript OR lang:javascript)');
	});

	test('should format a scoping query with a repo and a notLang', () => {
		const query = { repo: 'owner/repo', notLang: ['python', 'ruby'] };
		const result = formatScopingQuery(query);
		assert.strictEqual(result, '(repo:owner/repo) NOT (lang:python OR lang:ruby)');
	});

	test('should format a scoping query with a repo and a path', () => {
		const query = { repo: 'owner/repo', path: ['src', 'test'] };
		const result = formatScopingQuery(query);
		assert.strictEqual(result, '(repo:owner/repo) (path:src OR path:test)');
	});

	test('should format a scoping query with a repo and a notPath', () => {
		const query = { repo: 'owner/repo', notPath: ['node_modules', 'dist'] };
		const result = formatScopingQuery(query);
		assert.strictEqual(result, '(repo:owner/repo) NOT (path:node_modules OR path:dist)');
	});

	test('should format a scoping query with all options', () => {
		const query = {
			repo: 'owner/repo',
			lang: ['typescript', 'javascript'],
			notLang: ['python', 'ruby'],
			path: ['src', 'test'],
			notPath: ['node_modules', 'dist']
		};
		const result = formatScopingQuery(query);
		assert.strictEqual(
			result,
			'(repo:owner/repo) (lang:typescript OR lang:javascript) NOT (lang:python OR lang:ruby) (path:src OR path:test) NOT (path:node_modules OR path:dist)'
		);
	});
});
