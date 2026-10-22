/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IServerToolExecutionContext } from '../../node/shared/agentServerToolHost.js';
import { createDeferralDemoServerToolGroups, DeferralDemoToolName, parseDeferralDemoMode, type DeferralDemoMode } from '../../node/shared/deferralDemoServerTools.js';

const sessionUri = 'copilot:/deferral-demo';

/** The `deferLoading` each demo tool resolves to for a session in {@link mode}. */
function sessionDeferLoading(mode: DeferralDemoMode): Record<string, boolean | undefined> {
	const [group] = createDeferralDemoServerToolGroups(mode);
	return Object.fromEntries(group.definitions.map(definition => [
		definition.name,
		(group.getDefinitionForSession?.(definition, sessionUri) ?? definition).deferLoading,
	]));
}

suite('deferralDemoServerTools', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the env var, defaulting to off', () => {
		assert.deepStrictEqual(
			[undefined, '', 'nope', '1', 'true', 'Deferred', ' eager '].map(parseDeferralDemoMode),
			['off', 'off', 'off', 'deferred', 'deferred', 'deferred', 'eager'],
		);
	});

	test('contributes nothing when off, so the default tool set and budget are unchanged', () => {
		assert.deepStrictEqual(createDeferralDemoServerToolGroups('off'), []);
	});

	test('static definitions never opt out, keeping them out of the eager baseline', () => {
		for (const mode of ['deferred', 'eager'] as const) {
			const [group] = createDeferralDemoServerToolGroups(mode);
			assert.deepStrictEqual(group.definitions.filter(definition => definition.deferLoading === false), [], mode);
		}
	});

	test('deferred mode leaves deferLoading unset (deferred on Copilot by default)', () => {
		assert.deepStrictEqual(sessionDeferLoading('deferred'), {
			[DeferralDemoToolName.LookupReleaseCodename]: undefined,
			[DeferralDemoToolName.PinSessionNote]: undefined,
		});
	});

	test('eager mode opts only the pin tool out per session', () => {
		assert.deepStrictEqual(sessionDeferLoading('eager'), {
			[DeferralDemoToolName.LookupReleaseCodename]: undefined,
			[DeferralDemoToolName.PinSessionNote]: false,
		});
	});

	test('executes the demo tools and validates their arguments', async () => {
		const [group] = createDeferralDemoServerToolGroups('deferred');
		const stateManager = {} as AgentHostStateManager;
		const context = { chatUri: sessionUri } as IServerToolExecutionContext;
		assert.deepStrictEqual({
			lookup: await group.execute(stateManager, context, DeferralDemoToolName.LookupReleaseCodename, { version: '1.105' }),
			pin: await group.execute(stateManager, context, DeferralDemoToolName.PinSessionNote, { note: 'ship it' }),
		}, {
			lookup: 'Demo codename for 1.105: "Deferred 1.105". This tool was loaded through tool search.',
			pin: 'Pinned demo note: ship it',
		});
		assert.throws(() => group.execute(stateManager, context, DeferralDemoToolName.PinSessionNote, {}), /requires a non-empty "note" string/);
	});
});
