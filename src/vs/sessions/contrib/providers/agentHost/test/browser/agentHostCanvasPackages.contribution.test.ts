/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentHostCanvasPackage, IAgentHostCanvasPackagesClient } from '../../../../../../platform/agentHost/common/agentHostCanvasPackages.js';
import {
	type ICanvasPackageSessionWorkspace,
	describeCanvasPackagesUnsupportedReason,
	formatCanvasPackageApprovalSummary,
	formatCanvasPackageSize,
	isCanvasPackageApprovalStale,
	resolveCanvasPackageApprovalTarget,
	shortenCanvasPackageRevision,
} from '../../browser/agentHostCanvasPackages.contribution.js';

suite('agentHostCanvasPackages.contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const client: IAgentHostCanvasPackagesClient = {
		list: async () => [],
		prepare: async () => { throw new Error('unused'); },
		approve: async () => { },
		revoke: async () => { },
		remove: async () => { },
	};

	const notApproved: Pick<IAgentHostCanvasPackage, 'revision' | 'approval'> = { revision: 'rev1', approval: undefined };
	const approvedWorkspace: Pick<IAgentHostCanvasPackage, 'revision' | 'approval'> = { revision: 'rev1', approval: { revision: 'rev1', workspaces: ['file:///a', 'file:///b'] } };
	const approvedHost: Pick<IAgentHostCanvasPackage, 'revision' | 'approval'> = { revision: 'rev1', approval: { revision: 'rev1' } };
	const staleApproval: Pick<IAgentHostCanvasPackage, 'revision' | 'approval'> = { revision: 'rev2', approval: { revision: 'rev1' } };

	suite('describeCanvasPackagesUnsupportedReason', () => {
		test('reports connection-unsupported when the client is absent, regardless of the setting', () => {
			assert.strictEqual(describeCanvasPackagesUnsupportedReason(undefined, true), 'connection-unsupported');
			assert.strictEqual(describeCanvasPackagesUnsupportedReason(undefined, false), 'connection-unsupported');
		});

		test('reports setting-disabled when the client exists but the enabling setting is off', () => {
			assert.strictEqual(describeCanvasPackagesUnsupportedReason(client, false), 'setting-disabled');
		});

		test('reports fully supported (undefined) when the client exists and the setting is on', () => {
			assert.strictEqual(describeCanvasPackagesUnsupportedReason(client, true), undefined);
		});
	});

	suite('formatCanvasPackageSize', () => {
		test('formats bytes, kilobytes, and megabytes', () => {
			assert.deepStrictEqual(
				[formatCanvasPackageSize(512), formatCanvasPackageSize(2048), formatCanvasPackageSize(5 * 1024 * 1024)],
				['512 B', '2 KB', '5.0 MB'],
			);
		});
	});

	suite('shortenCanvasPackageRevision', () => {
		test('truncates a SHA-256 to a short display prefix', () => {
			assert.strictEqual(shortenCanvasPackageRevision('0123456789abcdef0123456789abcdef'), '0123456789ab');
		});
	});

	suite('isCanvasPackageApprovalStale', () => {
		test('is false when unapproved or approved at the current revision', () => {
			assert.strictEqual(isCanvasPackageApprovalStale(notApproved), false);
			assert.strictEqual(isCanvasPackageApprovalStale(approvedWorkspace), false);
			assert.strictEqual(isCanvasPackageApprovalStale(approvedHost), false);
		});

		test('is true when the approved revision no longer matches the current one', () => {
			assert.strictEqual(isCanvasPackageApprovalStale(staleApproval), true);
		});
	});

	suite('formatCanvasPackageApprovalSummary', () => {
		test('shows shared-host scope for exact-workspace, host-wide, and stale approvals', () => {
			assert.deepStrictEqual(
				[notApproved, approvedWorkspace, approvedHost, staleApproval].map(formatCanvasPackageApprovalSummary),
				[
					'Not approved',
					'Approved for 2 workspace(s) on this local host (across profiles)',
					'Approved for all workspaces and profiles on this local host',
					'Approved for all workspaces and profiles on this local host at an older revision — review and re-approve',
				],
			);
		});
	});

	suite('resolveCanvasPackageApprovalTarget', () => {
		const a = URI.parse('file:///workspace/a');
		const b = URI.parse('file:///workspace/b');
		const sessionA: ICanvasPackageSessionWorkspace = { sessionId: 'session-a', folder: a };
		const sessionAAgain: ICanvasPackageSessionWorkspace = { sessionId: 'session-a', folder: a };
		const sessionAOtherFolder: ICanvasPackageSessionWorkspace = { sessionId: 'session-a', folder: b };
		const sessionB: ICanvasPackageSessionWorkspace = { sessionId: 'session-b', folder: b };

		test('host scope never depends on a captured or currently open workspace', () => {
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('host', undefined, undefined), { rejected: false, workspace: undefined });
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('host', sessionA, sessionB), { rejected: false, workspace: undefined });
		});

		test('workspace scope rejects when nothing was open to capture', () => {
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('workspace', undefined, sessionA), { rejected: true, reason: 'no-workspace-open' });
		});

		test('workspace scope rejects when no session is currently open at all', () => {
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('workspace', sessionA, undefined), { rejected: true, reason: 'workspace-changed' });
		});

		test('workspace scope resolves to the captured folder when the same session/folder is still current', () => {
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('workspace', sessionA, sessionAAgain), { rejected: false, workspace: a });
		});

		test('workspace scope rejects rather than silently retargeting when the current folder changed within the same session', () => {
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('workspace', sessionA, sessionAOtherFolder), { rejected: true, reason: 'workspace-changed' });
		});

		test('workspace scope rejects rather than silently retargeting when the active session changed entirely', () => {
			assert.deepStrictEqual(resolveCanvasPackageApprovalTarget('workspace', sessionA, sessionB), { rejected: true, reason: 'workspace-changed' });
		});
	});
});
