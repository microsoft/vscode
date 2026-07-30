/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ITunnelGatewayInventory } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { autoGatewaySelection, buildGatewayPickItems, pickGatewaySelection } from '../../electron-browser/tunnelAgentHostServiceImpl.js';

function inventory(endpoints: ITunnelGatewayInventory['endpoints']): ITunnelGatewayInventory {
	return { userDataPath: '/data', endpoints };
}

const editorEndpoint = { type: 'editor', pid: 111, instanceId: 'editor-1', quality: 'insiders', endpointKind: 'socket', endpointLabel: '/tmp/editor-1.sock' } as const;
const standaloneEndpoint = { type: 'standalone', pid: 222, instanceId: 'standalone-1', tunnelName: 'my-tunnel', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9001' } as const;
const secondStandaloneEndpoint = { type: 'standalone', pid: 333, instanceId: 'standalone-2', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9002' } as const;

suite('tunnelAgentHostServiceImpl - gateway picker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildGatewayPickItems', () => {
		test('builds one item per live endpoint plus a trailing "start new dedicated" item', () => {
			const items = buildGatewayPickItems(inventory([editorEndpoint, standaloneEndpoint]));
			assert.strictEqual(items.length, 3);
			assert.deepStrictEqual(items[0].selection, { instanceId: 'editor-1' });
			assert.deepStrictEqual(items[1].selection, { instanceId: 'standalone-1' });
			assert.deepStrictEqual(items[2].selection, { newDedicated: true });
		});

		test('endpoint labels/descriptions distinguish type, PID, quality, and address', () => {
			const items = buildGatewayPickItems(inventory([editorEndpoint, standaloneEndpoint]));
			assert.match(items[0].label, /Editor/);
			assert.match(items[0].label, /111/);
			assert.match(items[0].description ?? '', /insiders/);
			assert.match(items[0].description ?? '', /\/tmp\/editor-1\.sock/);

			assert.match(items[1].label, /Standalone/);
			assert.match(items[1].label, /222/);
			assert.match(items[1].description ?? '', /my-tunnel/);
			assert.match(items[1].description ?? '', /127\.0\.0\.1:9001/);
		});

		test('the trailing item is localized and carries no endpoint-specific description', () => {
			const items = buildGatewayPickItems(inventory([]));
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].label, 'Start New Dedicated Agent Host');
			assert.strictEqual(items[0].description, undefined);
		});

		test('never surfaces a connection token in any pick item', () => {
			const items = buildGatewayPickItems(inventory([editorEndpoint, standaloneEndpoint]));
			for (const item of items) {
				// `connectionToken` isn't part of `ITunnelGatewaySelection` —
				// assert via an untyped view rather than the `in` operator,
				// since `hasKey` only narrows keys actually declared on the type.
				const selection = item.selection as unknown as Record<string, unknown>;
				assert.strictEqual(selection.connectionToken, undefined);
			}
		});
	});

	suite('autoGatewaySelection', () => {
		test('reuses the first live standalone instance when one exists', () => {
			assert.deepStrictEqual(
				autoGatewaySelection(inventory([standaloneEndpoint, secondStandaloneEndpoint])),
				{ instanceId: 'standalone-1' },
			);
		});

		test('requests a new dedicated instance when no standalone exists', () => {
			assert.deepStrictEqual(autoGatewaySelection(inventory([])), { newDedicated: true });
		});
	});

	suite('pickGatewaySelection', () => {
		test('auto-selects deterministically without prompting when there are no editor entries', async () => {
			let pickCalled = false;
			const quickInputService = { pick: async () => { pickCalled = true; return undefined; } } as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([standaloneEndpoint]));
			assert.deepStrictEqual(selection, { instanceId: 'standalone-1' });
			assert.strictEqual(pickCalled, false, 'must not prompt when there is nothing to disambiguate');
		});

		test('requests a new dedicated instance without prompting when there are no live endpoints at all', async () => {
			let pickCalled = false;
			const quickInputService = { pick: async () => { pickCalled = true; return undefined; } } as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([]));
			assert.deepStrictEqual(selection, { newDedicated: true });
			assert.strictEqual(pickCalled, false);
		});

		test('prompts with every live endpoint plus "start new dedicated" when any editor entry exists, and returns the chosen selection', async () => {
			let offeredItems: readonly IQuickPickItem[] | undefined;
			const quickInputService = {
				pick: async (picks: readonly IQuickPickItem[]) => {
					offeredItems = picks;
					return picks[1]; // choose the standalone endpoint
				},
			} as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([editorEndpoint, standaloneEndpoint]));
			assert.deepStrictEqual(selection, { instanceId: 'standalone-1' });
			assert.strictEqual(offeredItems?.length, 3, 'editor + standalone + start-new-dedicated');
		});

		test('returns undefined when the user cancels the picker', async () => {
			const quickInputService = { pick: async () => undefined } as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([editorEndpoint]));
			assert.strictEqual(selection, undefined);
		});

		test('background/auto-connect (userInitiated: false) never prompts and never chooses an editor entry, even when editor entries exist', async () => {
			let pickCalled = false;
			const quickInputService = { pick: async () => { pickCalled = true; return undefined; } } as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([editorEndpoint, standaloneEndpoint]), { userInitiated: false });
			assert.deepStrictEqual(selection, { instanceId: 'standalone-1' }, 'must deterministically reuse the standalone, never the editor');
			assert.strictEqual(pickCalled, false, 'background connects must never invoke IQuickInputService');
		});

		test('background/auto-connect (userInitiated: false) requests newDedicated without prompting when only editor entries exist', async () => {
			let pickCalled = false;
			const quickInputService = { pick: async () => { pickCalled = true; return undefined; } } as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([editorEndpoint]), { userInitiated: false });
			assert.deepStrictEqual(selection, { newDedicated: true });
			assert.strictEqual(pickCalled, false, 'background connects must never invoke IQuickInputService');
		});

		test('explicit user-initiated connect still prompts when editor entries exist', async () => {
			let pickCalled = false;
			const quickInputService = {
				pick: async (picks: readonly IQuickPickItem[]) => { pickCalled = true; return picks[0]; },
			} as unknown as IQuickInputService;

			const selection = await pickGatewaySelection(quickInputService, inventory([editorEndpoint, standaloneEndpoint]), { userInitiated: true });
			assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
			assert.strictEqual(pickCalled, true, 'user-initiated connects must still offer the picker');
		});
	});
});
