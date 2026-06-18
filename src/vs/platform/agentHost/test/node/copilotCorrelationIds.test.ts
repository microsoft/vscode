/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { buildCopilotCorrelationIds, wireCopilotCorrelationIds } from '../../node/copilot/copilotCorrelationIds.js';

type SendRequest = (...args: unknown[]) => Promise<unknown>;

interface IFakeConnection {
	sendRequest: SendRequest;
}

interface ICapturedCall {
	method: unknown;
	params: unknown;
	rest: unknown[];
}

function createFakeClient(captured: ICapturedCall[], connection: IFakeConnection | null = { sendRequest: async () => undefined }): { client: CopilotClient; connection: IFakeConnection | null } {
	const conn: IFakeConnection | null = connection;
	if (conn) {
		const original = conn.sendRequest;
		conn.sendRequest = async (...args: unknown[]) => {
			captured.push({ method: args[0], params: args[1], rest: args.slice(2) });
			return original(...args);
		};
	}
	const client = { connection: conn } as unknown as CopilotClient;
	return { client, connection: conn };
}

function fakeTelemetry(overrides: Partial<ITelemetryService> = {}): ITelemetryService {
	return {
		_serviceBrand: undefined,
		telemetryLevel: TelemetryLevel.USAGE,
		sessionId: 'session-abc',
		machineId: 'machine-xyz',
		sqmId: 'sqm-123',
		devDeviceId: 'dev-device-456',
		firstSessionDate: '2024-01-01',
		msftInternal: true,
		sendErrorTelemetry: true,
		publicLog: () => undefined,
		publicLog2: () => undefined,
		publicLogError: () => undefined,
		publicLogError2: () => undefined,
		setExperimentProperty: () => undefined,
		setCommonProperty: () => undefined,
		...overrides,
	} as ITelemetryService;
}

function fakeProduct(overrides: Partial<IProductService> = {}): IProductService {
	return {
		_serviceBrand: undefined,
		version: '1.99.0',
		commit: 'deadbeefcafe',
		quality: 'insider',
		...overrides,
	} as IProductService;
}

suite('CopilotCorrelationIds', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildCopilotCorrelationIds', () => {
		test('emits the full set of common properties when available', () => {
			const props = buildCopilotCorrelationIds(fakeTelemetry(), fakeProduct());
			assert.deepStrictEqual(props, {
				vscode_version: '1.99.0',
				vscode_commit: 'deadbeefcafe',
				vscode_quality: 'insider',
				is_internal: 'true',
				machine_id: 'machine-xyz',
				sqm_id: 'sqm-123',
				dev_device_id: 'dev-device-456',
				session_id: 'session-abc',
			});
		});

		test('drops undefined and empty values rather than emitting invalid entries', () => {
			const props = buildCopilotCorrelationIds(
				fakeTelemetry({ msftInternal: undefined, sqmId: '', devDeviceId: undefined as unknown as string }),
				fakeProduct({ commit: undefined, quality: undefined }),
			);
			assert.deepStrictEqual(props, {
				vscode_version: '1.99.0',
				machine_id: 'machine-xyz',
				session_id: 'session-abc',
			});
		});

		test('encodes msftInternal as the string "false" when explicitly false', () => {
			const props = buildCopilotCorrelationIds(fakeTelemetry({ msftInternal: false }), fakeProduct());
			assert.strictEqual(props.is_internal, 'false');
		});

		test('drops values longer than 512 characters', () => {
			const longCommit = 'a'.repeat(513);
			const props = buildCopilotCorrelationIds(fakeTelemetry(), fakeProduct({ commit: longCommit }));
			assert.strictEqual(props.vscode_commit, undefined);
			assert.strictEqual(props.vscode_version, '1.99.0');
		});
	});

	suite('wireCopilotCorrelationIds', () => {
		test('injects internalCorrelationIds into session.create params', async () => {
			const captured: ICapturedCall[] = [];
			const { client } = createFakeClient(captured);
			const wire = wireCopilotCorrelationIds(client, () => ({ session_id: 's1' }));
			disposables.add(wire);

			await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(
				'session.create',
				{ model: 'gpt-x', clientName: 'vscode' },
			);

			assert.strictEqual(captured.length, 1);
			assert.deepStrictEqual(captured[0].params, {
				model: 'gpt-x',
				clientName: 'vscode',
				internalCorrelationIds: { session_id: 's1' },
			});
		});

		test('injects internalCorrelationIds into session.resume params', async () => {
			const captured: ICapturedCall[] = [];
			const { client } = createFakeClient(captured);
			disposables.add(wireCopilotCorrelationIds(client, () => ({ session_id: 's1' })));

			await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(
				'session.resume',
				{ sessionId: 'abc' },
			);

			assert.deepStrictEqual(captured[0].params, {
				sessionId: 'abc',
				internalCorrelationIds: { session_id: 's1' },
			});
		});

		test('forwards extra positional arguments unchanged', async () => {
			const captured: ICapturedCall[] = [];
			const { client } = createFakeClient(captured);
			disposables.add(wireCopilotCorrelationIds(client, () => ({ session_id: 's1' })));

			await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(
				'session.create',
				{ model: 'gpt-x' },
				'extra',
				42,
			);

			assert.deepStrictEqual(captured[0].rest, ['extra', 42]);
		});

		test('does not modify other RPC methods', async () => {
			const captured: ICapturedCall[] = [];
			const { client } = createFakeClient(captured);
			disposables.add(wireCopilotCorrelationIds(client, () => ({ session_id: 's1' })));

			await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(
				'session.send',
				{ prompt: 'hi' },
			);

			assert.deepStrictEqual(captured[0].params, { prompt: 'hi' });
		});

		test('does not inject anything when provider returns an empty map', async () => {
			const captured: ICapturedCall[] = [];
			const { client } = createFakeClient(captured);
			disposables.add(wireCopilotCorrelationIds(client, () => ({})));

			await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(
				'session.create',
				{ model: 'gpt-x' },
			);

			assert.deepStrictEqual(captured[0].params, { model: 'gpt-x' });
		});

		test('returns Disposable.None when the client has no connection', () => {
			const captured: ICapturedCall[] = [];
			const { client } = createFakeClient(captured, null);
			const wire = wireCopilotCorrelationIds(client, () => ({ session_id: 's1' }));
			// No-op disposable: calling dispose() must not throw.
			wire.dispose();
		});

		test('dispose restores the original sendRequest', async () => {
			const captured: ICapturedCall[] = [];
			const { client, connection } = createFakeClient(captured);
			const originalSendRequest = connection!.sendRequest;
			const wire = wireCopilotCorrelationIds(client, () => ({ session_id: 's1' }));
			wire.dispose();

			assert.strictEqual(connection!.sendRequest, originalSendRequest);

			await connection!.sendRequest('session.create', { model: 'gpt-x' });
			assert.deepStrictEqual(captured[0].params, { model: 'gpt-x' });
		});
	});
});
