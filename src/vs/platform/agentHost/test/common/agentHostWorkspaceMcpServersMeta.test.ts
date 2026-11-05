/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostWorkspaceMcpServersCapabilityMetaKey, AgentHostWorkspaceMcpServersMetaKey, readCustomizationEnablement, readSessionWorkspaceMcpServers, supportsAgentHostWorkspaceMcpServers, withSessionWorkspaceMcpServers, type ISessionWorkspaceMcpServers } from '../../common/meta/agentHostWorkspaceMcpServersMeta.js';
import { CustomizationEnablementKind } from '../../common/state/protocol/channels-session/state.js';
import type { InitializeResult } from '../../common/state/protocol/common/commands.js';

suite('Agent Host workspace MCP servers meta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const decision: ISessionWorkspaceMcpServers = {
		enablement: [
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
			{ kind: CustomizationEnablementKind.Global, enabled: false },
		],
		enabled: true,
	};

	test('round-trips the class decision and preserves other slots', () => {
		const tagged = withSessionWorkspaceMcpServers({ other: 1 }, decision);

		assert.deepStrictEqual({
			read: readSessionWorkspaceMcpServers(tagged),
			other: tagged?.other,
			cleared: withSessionWorkspaceMcpServers(tagged, undefined),
			emptied: withSessionWorkspaceMcpServers(withSessionWorkspaceMcpServers(undefined, decision), undefined),
		}, {
			read: decision,
			other: 1,
			cleared: { other: 1 },
			emptied: undefined,
		});
	});

	test('rejects absent or malformed decisions instead of guessing', () => {
		assert.deepStrictEqual([
			readSessionWorkspaceMcpServers(undefined),
			readSessionWorkspaceMcpServers({}),
			readSessionWorkspaceMcpServers({ [AgentHostWorkspaceMcpServersMetaKey]: true }),
			readSessionWorkspaceMcpServers({ [AgentHostWorkspaceMcpServersMetaKey]: { enabled: 'true', enablement: [] } }),
			readSessionWorkspaceMcpServers({ [AgentHostWorkspaceMcpServersMetaKey]: { enabled: true, enablement: {} } }),
			readSessionWorkspaceMcpServers({ [AgentHostWorkspaceMcpServersMetaKey]: { enabled: true, enablement: [{ kind: 'universe', enabled: true }] } }),
			readSessionWorkspaceMcpServers({ [AgentHostWorkspaceMcpServersMetaKey]: { enabled: true, enablement: [{ kind: CustomizationEnablementKind.Workspace, enabled: true }] } }),
			readSessionWorkspaceMcpServers({ [AgentHostWorkspaceMcpServersMetaKey]: { enabled: false, enablement: [] } }),
		], [undefined, undefined, undefined, undefined, undefined, undefined, undefined, { enabled: false, enablement: [] }]);
	});

	test('validates wire enablement decisions, requiring a URI only for the Workspace scope', () => {
		assert.deepStrictEqual([
			readCustomizationEnablement({ kind: CustomizationEnablementKind.Global, enabled: true }),
			readCustomizationEnablement({ kind: CustomizationEnablementKind.Session, enabled: false }),
			readCustomizationEnablement({ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true }),
			readCustomizationEnablement({ kind: CustomizationEnablementKind.Workspace, uri: '', enabled: true }),
			readCustomizationEnablement({ kind: CustomizationEnablementKind.Global, enabled: 1 }),
			readCustomizationEnablement('global'),
		], [
			{ kind: CustomizationEnablementKind.Global, enabled: true },
			{ kind: CustomizationEnablementKind.Session, enabled: false },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
			undefined,
			undefined,
			undefined,
		]);
	});

	test('detects the capability only from an explicit true', () => {
		const initialized = (meta?: Record<string, unknown>): InitializeResult => ({ protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], ...(meta ? { _meta: meta } : {}) });

		assert.deepStrictEqual([
			supportsAgentHostWorkspaceMcpServers(undefined),
			supportsAgentHostWorkspaceMcpServers(initialized()),
			supportsAgentHostWorkspaceMcpServers(initialized({ [AgentHostWorkspaceMcpServersCapabilityMetaKey]: 'true' })),
			supportsAgentHostWorkspaceMcpServers(initialized({ [AgentHostWorkspaceMcpServersCapabilityMetaKey]: true })),
		], [false, false, false, true]);
	});
});
