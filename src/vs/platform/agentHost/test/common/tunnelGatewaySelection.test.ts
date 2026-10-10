/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IDialogService, IPrompt } from '../../../dialogs/common/dialogs.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../common/remoteAgentHostLocationPreference.js';
import { ITunnelGatewayInventory } from '../../common/tunnelAgentHost.js';
import { resolveGatewaySelection } from '../../common/tunnelGatewaySelection.js';

function inventory(endpoints: ITunnelGatewayInventory['endpoints']): ITunnelGatewayInventory {
	return { userDataPath: '/data', endpoints };
}

const editorEndpoint = { type: 'editor', pid: 111, instanceId: 'editor-1', quality: 'insiders', endpointKind: 'socket', endpointLabel: '/tmp/editor-1.sock' } as const;
const standaloneEndpoint = { type: 'standalone', pid: 222, instanceId: 'standalone-2', tunnelName: 'my-tunnel', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9001' } as const;

interface IPreferenceServiceFixture {
	readonly service: IRemoteAgentHostLocationPreferenceService;
	readonly setCalls: { hostKey: string; preference: RemoteAgentHostLocationPreference }[];
}

function stubLocationPreferenceService(initial?: RemoteAgentHostLocationPreference): IPreferenceServiceFixture {
	const store = new Map<string, RemoteAgentHostLocationPreference>();
	if (initial) {
		store.set('tunnel:abc', initial);
	}
	const setCalls: { hostKey: string; preference: RemoteAgentHostLocationPreference }[] = [];
	const service: IRemoteAgentHostLocationPreferenceService = {
		_serviceBrand: undefined,
		onDidChangePreference: Event.None,
		getPreference: hostKey => store.get(hostKey),
		setPreference: (hostKey, preference) => {
			store.set(hostKey, preference);
			setCalls.push({ hostKey, preference });
		},
	};
	return { service, setCalls };
}

interface IDialogServiceFixture {
	readonly dialogService: IDialogService;
	readonly promptCalls: IPrompt<RemoteAgentHostLocationPreference>[];
}

function stubDialogService(result: RemoteAgentHostLocationPreference | undefined): IDialogServiceFixture {
	const promptCalls: IPrompt<RemoteAgentHostLocationPreference>[] = [];
	const dialogService = {
		prompt: async (options: IPrompt<RemoteAgentHostLocationPreference>) => {
			promptCalls.push(options);
			return { result };
		},
	} as unknown as IDialogService;
	return { dialogService, promptCalls };
}

suite('resolveGatewaySelection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a delegated instance short-circuits saved preferences and prompts', async () => {
		const { service, setCalls } = stubLocationPreferenceService('dedicated');
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product',
			inventory: { userDataPath: '/data', delegatedInstanceId: 'editor-1', endpoints: [editorEndpoint] },
			userInitiated: true,
		});

		assert.deepStrictEqual({ selection, promptCalls, setCalls }, {
			selection: { instanceId: 'editor-1' },
			promptCalls: [],
			setCalls: [],
		});
	});

	test('a first user-initiated delegated connection persists its editor location for future auto-connect', async () => {
		const { service, setCalls } = stubLocationPreferenceService();
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product',
			inventory: { userDataPath: '/data', delegatedInstanceId: 'editor-1', endpoints: [editorEndpoint] },
			userInitiated: true,
		});

		assert.deepStrictEqual({ selection, promptCalls, setCalls }, {
			selection: { instanceId: 'editor-1' },
			promptCalls: [],
			setCalls: [{ hostKey: 'tunnel:abc', preference: 'editor' }],
		});
	});

	test('saved "editor" preference + a live editor selects that editor without prompting or re-persisting', async () => {
		const { service, setCalls } = stubLocationPreferenceService('editor');
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
		});

		assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
		assert.strictEqual(promptCalls.length, 0);
		assert.strictEqual(setCalls.length, 0);
	});

	test('saved "editor" preference + a background (non-user-initiated) reconnect still selects the live editor (explicit consent)', async () => {
		const { service, setCalls } = stubLocationPreferenceService('editor');
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint]), userInitiated: false,
		});

		assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
		assert.strictEqual(promptCalls.length, 0);
		assert.strictEqual(setCalls.length, 0);
	});

	test('saved "editor" preference + no live editor falls back to dedicated without changing the preference', async () => {
		const { service, setCalls } = stubLocationPreferenceService('editor');
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([standaloneEndpoint]), userInitiated: true,
		});

		assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
		assert.strictEqual(promptCalls.length, 0);
		assert.strictEqual(setCalls.length, 0, 'an unavailable editor preference must not be overwritten');
	});

	test('saved "dedicated" preference never prompts, even when a live editor exists', async () => {
		const { service, setCalls } = stubLocationPreferenceService('dedicated');
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
		});

		assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
		assert.strictEqual(promptCalls.length, 0);
		assert.strictEqual(setCalls.length, 0);
	});

	test('no saved preference + no live editor persists the only available location after a manual connection', async () => {
		const { service, setCalls } = stubLocationPreferenceService();
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([standaloneEndpoint]), userInitiated: true,
		});

		assert.deepStrictEqual({ selection, promptCalls, setCalls }, {
			selection: { instanceId: 'standalone-2' },
			promptCalls: [],
			setCalls: [{ hostKey: 'tunnel:abc', preference: 'dedicated' }],
		});
	});

	test('no saved preference + a live editor + a background connection defers until a manual selection', async () => {
		const { service, setCalls } = stubLocationPreferenceService();
		const { dialogService, promptCalls } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: false,
		});

		assert.strictEqual(selection, undefined);
		assert.strictEqual(promptCalls.length, 0);
		assert.strictEqual(setCalls.length, 0);
	});

	test('no saved preference + a live editor + a user-initiated connection prompts the shared modal with the tunnel name and persists an "editor" choice', async () => {
		const { service, setCalls } = stubLocationPreferenceService();
		const { dialogService, promptCalls } = stubDialogService('editor');

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
		});

		assert.deepStrictEqual(selection, { instanceId: 'editor-1' });
		assert.strictEqual(promptCalls.length, 1);
		assert.match(promptCalls[0].message, /My Tunnel/);
		assert.deepStrictEqual((promptCalls[0] as unknown as { custom: { buttonDetails: string[] } }).custom.buttonDetails[1], 'Agents are available only while the remote Test Product window is open.');
		assert.deepStrictEqual(setCalls, [{ hostKey: 'tunnel:abc', preference: 'editor' }]);
	});

	test('no saved preference + a live editor + a user-initiated connection persists a "dedicated" choice and translates it to a concrete selection', async () => {
		const { service, setCalls } = stubLocationPreferenceService();
		const { dialogService } = stubDialogService('dedicated');

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
		});

		assert.deepStrictEqual(selection, { instanceId: 'standalone-2' });
		assert.deepStrictEqual(setCalls, [{ hostKey: 'tunnel:abc', preference: 'dedicated' }]);
	});

	test('cancelling the modal returns undefined and persists nothing', async () => {
		const { service, setCalls } = stubLocationPreferenceService();
		const { dialogService } = stubDialogService(undefined);

		const selection = await resolveGatewaySelection(service, dialogService, {
			hostKey: 'tunnel:abc', hostLabel: 'My Tunnel', productName: 'Test Product', inventory: inventory([editorEndpoint, standaloneEndpoint]), userInitiated: true,
		});

		assert.strictEqual(selection, undefined);
		assert.strictEqual(setCalls.length, 0);
	});
});
