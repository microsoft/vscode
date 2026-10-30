/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentSandboxCertificate, withAgentSandboxCertificate, type IAgentSandboxCertificateStatus } from '../../common/meta/agentSandboxCertificate.js';

suite('Agent sandbox certificate metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const chat = 'another-host://opaque-chat';
	const status: IAgentSandboxCertificateStatus = { scopeId: 'host-profile', state: 'notInstalled', canInstall: true, requiresRotation: false };

	test('round trips optional status for opaque chat identities without replacing other metadata', () => {
		const initial = { unrelated: 'preserved', 'vscode.sandboxDiagnostics': ['Missing dependency'] };
		const first = withAgentSandboxCertificate(initial, chat, status);
		const both = withAgentSandboxCertificate(first, 'peer', { ...status, state: 'installed' });
		const cleared = withAgentSandboxCertificate(both, chat, undefined);
		assert.deepStrictEqual({
			first: readAgentSandboxCertificate({ _meta: first }, chat),
			firstUnchanged: readAgentSandboxCertificate({ _meta: first }, 'peer'),
			cleared: readAgentSandboxCertificate({ _meta: cleared }, chat),
			peer: readAgentSandboxCertificate({ _meta: cleared }, 'peer'),
			fullyCleared: withAgentSandboxCertificate(cleared, 'peer', undefined),
		}, {
			first: status, firstUnchanged: undefined, cleared: undefined, peer: { ...status, state: 'installed' }, fullyCleared: initial,
		});
	});

	test('ignores absent, malformed and future metadata', () => {
		const invalidEntries = [
			undefined, null, [], 'installed', {},
			{ ...status, scopeId: '' }, { ...status, scopeId: 1 },
			{ ...status, state: 'future' }, { ...status, canInstall: 'true' },
			{ ...status, requiresRotation: 1 }, { ...status, detail: 42 },
		];
		assert.deepStrictEqual([
			readAgentSandboxCertificate(undefined, chat),
			readAgentSandboxCertificate({ _meta: { 'vscode.sandboxCertificate': { version: 2, chats: { [chat]: status } } } }, chat),
			...invalidEntries.map(entry => readAgentSandboxCertificate({ _meta: { 'vscode.sandboxCertificate': { version: 1, chats: { [chat]: entry } } } }, chat)),
		], Array(invalidEntries.length + 2).fill(undefined));
	});

	test('preserves diagnostic detail as data and discards unrecognized fields', () => {
		const detail = '[untrusted](command:do-not-execute)';
		const meta = { 'vscode.sandboxCertificate': { version: 1, chats: { [chat]: { ...status, detail, command: 'do-not-execute' } } } };
		assert.deepStrictEqual(readAgentSandboxCertificate({ _meta: meta }, chat), { ...status, detail });
	});
});
