/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { CopilotCommonTelemetryProperties } from '../../node/copilot/copilotCommonTelemetryProperties.js';

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

async function captureCommonProperties(
	telemetry: ITelemetryService,
	product: IProductService,
	method: string = 'session.create',
	params: object = { model: 'gpt-x' },
): Promise<ICapturedCall> {
	const captured: ICapturedCall[] = [];
	const { client } = createFakeClient(captured);
	new CopilotCommonTelemetryProperties(telemetry, product).wireCopilotCommonTelemetryProperties(client);
	await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(method, params);
	return captured[0];
}

suite('CopilotCommonTelemetryProperties', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the full set of common properties on session.create', async () => {
		const call = await captureCommonProperties(fakeTelemetry(), fakeProduct());
		assert.deepStrictEqual(call.params, {
			model: 'gpt-x',
			internalCorrelationIds: {
				vscode_version: '1.99.0',
				vscode_commit: 'deadbeefcafe',
				vscode_quality: 'insider',
				is_internal: 'true',
				machine_id: 'machine-xyz',
				sqm_id: 'sqm-123',
				dev_device_id: 'dev-device-456',
				session_id: 'session-abc',
			},
		});
	});

	test('drops undefined and empty values rather than emitting invalid entries', async () => {
		const call = await captureCommonProperties(
			fakeTelemetry({ msftInternal: undefined, sqmId: '', devDeviceId: undefined as unknown as string }),
			fakeProduct({ commit: undefined, quality: undefined }),
		);
		assert.deepStrictEqual((call.params as { internalCorrelationIds: Record<string, string> }).internalCorrelationIds, {
			vscode_version: '1.99.0',
			machine_id: 'machine-xyz',
			session_id: 'session-abc',
		});
	});

	test('encodes msftInternal as the string "false" when explicitly false', async () => {
		const call = await captureCommonProperties(fakeTelemetry({ msftInternal: false }), fakeProduct());
		assert.strictEqual(
			(call.params as { internalCorrelationIds: Record<string, string> }).internalCorrelationIds.is_internal,
			'false',
		);
	});

	test('injects common properties into session.resume params', async () => {
		const call = await captureCommonProperties(fakeTelemetry(), fakeProduct(), 'session.resume', { sessionId: 'abc' });
		assert.strictEqual((call.params as { sessionId: string }).sessionId, 'abc');
		assert.ok((call.params as { internalCorrelationIds: object }).internalCorrelationIds);
	});

	test('forwards extra positional arguments unchanged', async () => {
		const captured: ICapturedCall[] = [];
		const { client } = createFakeClient(captured);
		new CopilotCommonTelemetryProperties(fakeTelemetry(), fakeProduct()).wireCopilotCommonTelemetryProperties(client);

		await (client as unknown as { connection: IFakeConnection }).connection.sendRequest(
			'session.create',
			{ model: 'gpt-x' },
			'extra',
			42,
		);

		assert.deepStrictEqual(captured[0].rest, ['extra', 42]);
	});

	test('does not modify other RPC methods', async () => {
		const call = await captureCommonProperties(fakeTelemetry(), fakeProduct(), 'session.send', { prompt: 'hi' });
		assert.deepStrictEqual(call.params, { prompt: 'hi' });
	});

	test('does not inject anything when no common properties are available', async () => {
		const emptyTelemetry = fakeTelemetry({
			sessionId: '',
			machineId: '',
			sqmId: '',
			devDeviceId: '',
			msftInternal: undefined,
		});
		const emptyProduct = fakeProduct({ version: '', commit: undefined, quality: undefined });
		const call = await captureCommonProperties(emptyTelemetry, emptyProduct);
		assert.deepStrictEqual(call.params, { model: 'gpt-x' });
	});

	test('is a no-op when the client has no connection', () => {
		const { client } = createFakeClient([], null);
		new CopilotCommonTelemetryProperties(fakeTelemetry(), fakeProduct()).wireCopilotCommonTelemetryProperties(client);
		// Reaching here without throwing is the assertion.
	});
});
