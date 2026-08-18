/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	formatPermissionRuleText,
	parsePermissionRuleText,
	splitPermissionPathArgument,
} from '../../common/permissions/chatPermissionRuleSyntax.js';
import { ChatPermissionDomainId } from '../../common/permissions/chatPermissions.js';

suite('chatPermissionRuleSyntax', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('splits rules into kind, argument and domain', () => {
		assert.deepStrictEqual(
			['Shell(npm run build)', 'PowerShell(Get-ChildItem)', 'Read(**/.env*)', 'Write(src/**)', 'Edit(src/**)', 'Domain(*.example.com)', 'Read']
				.map(parsePermissionRuleText),
			[
				{ kind: 'Shell', argument: 'npm run build', domain: ChatPermissionDomainId.Terminal },
				{ kind: 'PowerShell', argument: 'Get-ChildItem', domain: ChatPermissionDomainId.Terminal },
				{ kind: 'Read', argument: '**/.env*', domain: ChatPermissionDomainId.Files },
				{ kind: 'Write', argument: 'src/**', domain: ChatPermissionDomainId.Files },
				{ kind: 'Edit', argument: 'src/**', domain: ChatPermissionDomainId.Files },
				{ kind: 'Domain', argument: '*.example.com', domain: ChatPermissionDomainId.Network },
				{ kind: 'Read', domain: ChatPermissionDomainId.Files },
			],
		);
	});

	test('reports an unplaceable family rather than dropping it, and rejects malformed text', () => {
		assert.deepStrictEqual(
			['GitHubMCP(delete_repo)', 'Shell(unterminated', '', '   ', 'Shell()'].map(parsePermissionRuleText),
			[
				{ kind: 'GitHubMCP', argument: 'delete_repo', domain: undefined },
				undefined,
				undefined,
				undefined,
				undefined,
			],
		);
	});

	test('splits path arguments into their anchor and pattern', () => {
		assert.deepStrictEqual(
			['//etc/hosts', '~/Notes/**', './build/**', '/src/**', 'relative/**'].map(splitPermissionPathArgument),
			[
				{ root: 'filesystem', pattern: 'etc/hosts' },
				{ root: 'home', pattern: 'Notes/**' },
				{ root: 'workingDirectory', pattern: 'build/**' },
				{ root: 'workspace', pattern: 'src/**' },
				{ root: 'relative', pattern: 'relative/**' },
			],
		);
	});

	test('round-trips a rule back to its canonical text', () => {
		assert.deepStrictEqual(
			[formatPermissionRuleText('Shell', 'npm run build'), formatPermissionRuleText('Read', undefined)],
			['Shell(npm run build)', 'Read'],
		);
	});
});
