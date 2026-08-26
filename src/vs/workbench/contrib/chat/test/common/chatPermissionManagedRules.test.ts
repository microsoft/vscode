/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	collectManagedPermissionRules,
	declaresAllowList,
	dedupeRulesByContent,
	readDeclaredBypassRestriction,
	readManagedPermissionsSlice,
} from '../../common/permissions/chatPermissionManagedRules.js';
import { ChatPermissionDomainId, ChatPermissionScope } from '../../common/permissions/chatPermissions.js';

suite('chatPermissionManagedRules', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the permissions slice only from a well-formed document', () => {
		assert.deepStrictEqual(
			[
				readManagedPermissionsSlice({ permissions: { deny: ['Shell(rm -rf *)'] } }),
				readManagedPermissionsSlice({ model: 'auto' }),
				readManagedPermissionsSlice({ permissions: 'nope' }),
				readManagedPermissionsSlice(undefined),
			],
			[{ deny: ['Shell(rm -rf *)'] }, undefined, undefined, undefined],
		);
	});

	test('converts each rule list into display rules tagged to the managed scope', () => {
		assert.deepStrictEqual(
			collectManagedPermissionRules({ deny: ['Shell(rm -rf *)'], ask: ['Domain(*.corp)'], allow: ['Read(src/**)'] }, 'server'),
			[
				{ id: 'server:deny:Shell(rm -rf *)', domain: ChatPermissionDomainId.Terminal, kind: 'Shell', argument: 'rm -rf *', effect: 'deny', scope: ChatPermissionScope.Managed, editable: false },
				{ id: 'server:ask:Domain(*.corp)', domain: ChatPermissionDomainId.Network, kind: 'Domain', argument: '*.corp', effect: 'ask', scope: ChatPermissionScope.Managed, editable: false },
				{ id: 'server:allow:Read(src/**)', domain: ChatPermissionDomainId.Files, kind: 'Read', argument: 'src/**', effect: 'allow', scope: ChatPermissionScope.Managed, editable: false },
			],
		);
	});

	test('skips entries the rule grammar cannot place, and tolerates malformed lists', () => {
		assert.deepStrictEqual(
			[
				collectManagedPermissionRules({ deny: ['GitHubMCP(delete_repo)', 'Shell(ok)', 42, 'Shell(unterminated'] }, 'file').map(rule => rule.id),
				collectManagedPermissionRules({ deny: 'not-an-array' }, 'file'),
				collectManagedPermissionRules(undefined, 'file'),
			],
			[['file:deny:Shell(ok)'], [], []],
		);
	});

	test('keeps one row when two channels deliver the same rule', () => {
		const rules = [
			...collectManagedPermissionRules({ deny: ['Shell(rm -rf *)'] }, 'server'),
			...collectManagedPermissionRules({ deny: ['Shell(rm -rf *)'], ask: ['Shell(git push *)'] }, 'file'),
		];

		assert.deepStrictEqual(
			dedupeRulesByContent(rules).map(rule => rule.id),
			['server:deny:Shell(rm -rf *)', 'file:ask:Shell(git push *)'],
		);
	});

	test('reads the declared bypass restriction, including the schema value the SDK types omit', () => {
		assert.deepStrictEqual(
			[
				readDeclaredBypassRestriction({ disableBypassPermissionsMode: 'disable' }),
				readDeclaredBypassRestriction({ disableBypassPermissionsMode: 'allow-auto-only' }),
				readDeclaredBypassRestriction({ disableBypassPermissionsMode: 'something-else' }),
				readDeclaredBypassRestriction(undefined),
			],
			['disable', 'allowAutoOnly', undefined, undefined],
		);
	});

	test('distinguishes a declared empty allow list from no allow list at all', () => {
		// An allow list that intersects away is not the same as one that was never authored.
		assert.deepStrictEqual(
			[declaresAllowList({ allow: [] }), declaresAllowList({ allow: ['Read(a)'] }), declaresAllowList({}), declaresAllowList(undefined)],
			[true, true, false, false],
		);
	});
});
