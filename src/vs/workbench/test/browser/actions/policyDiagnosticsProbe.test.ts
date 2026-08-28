/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostManagedSettingsDiagnostics } from '../../../../platform/agentHost/common/agentService.js';
import { collectAgentRuntimeSection, probePolicyDiagnostics } from '../../../browser/actions/policyDiagnosticsProbe.js';

suite('Policy diagnostics probe', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const diagnostics: readonly IAgentHostManagedSettingsDiagnostics[] = [
		{
			provider: 'copilot',
			snapshot: {
				source: 'server',
				serverManaged: true,
				deviceManaged: false,
				failClosed: true,
				bypassPermissionsDisabled: true,
				managedKeys: ['copilot.enabled'],
				settings: { 'copilot.enabled': true }
			}
		},
		{ provider: 'claude', error: 'sdk refused' }
	];

	test('renders the runtime section when the SDK answers', async () => {
		const section = await collectAgentRuntimeSection(async () => diagnostics, 1000);

		assert.strictEqual(section.summary, '2 providers, 1 failed');
		assert.ok(section.content.includes('#### copilot'));
		assert.ok(section.content.includes('Resolved settings snapshot'));
		assert.ok(section.content.includes('sdk refused'));
	});

	test('renders an unavailable runtime section when the SDK hangs', async () => {
		const never = new DeferredPromise<readonly IAgentHostManagedSettingsDiagnostics[]>();
		const section = await collectAgentRuntimeSection(() => never.p, 1);

		assert.strictEqual(section.summary, 'Timed out after 1ms');
		assert.ok(section.content.includes('is unavailable: Timed out after 1ms'));
		assert.ok(section.content.includes('The rest of this report was generated without it.'));

		never.complete([]);
	});

	test('renders an unavailable runtime section when the SDK fails', async () => {
		const section = await collectAgentRuntimeSection(async () => { throw new Error('sdk exploded'); }, 1000);

		assert.strictEqual(section.summary, 'Unavailable (sdk exploded)');
		assert.ok(section.content.includes('is unavailable: Unavailable \\(sdk exploded\\)'));
	});

	test('renders content when no provider exposes diagnostics', async () => {
		const section = await collectAgentRuntimeSection(async () => [], 1000);

		assert.deepStrictEqual(section, {
			summary: 'No provider diagnostics',
			content: '*No agent provider exposes managed-settings diagnostics.*\n\n'
		});
	});

	test('a resolved undefined value is not reported as a timeout', async () => {
		assert.deepStrictEqual(await probePolicyDiagnostics(async () => undefined, 1000), { kind: 'ok', value: undefined });
	});

	test('a synchronous throw is reported as an error', async () => {
		assert.deepStrictEqual(
			await probePolicyDiagnostics(() => { throw new Error('boom'); }, 1000),
			{ kind: 'error', message: 'boom' }
		);
	});
});
