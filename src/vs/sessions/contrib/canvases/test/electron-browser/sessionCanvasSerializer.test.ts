/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ISessionCanvasService, SessionCanvasInput } from '../../common/sessionCanvas.js';
import { SessionCanvasSerializer } from '../../electron-browser/sessionCanvasSerializer.js';

suite('SessionCanvasSerializer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const input = store.add(new SessionCanvasInput({
			providerId: 'host-advertised-provider',
			session: URI.parse('opaque-session:/exact'),
			chat: URI.parse('opaque-chat:/exact'),
			canvas: URI.parse('opaque-canvas:/exact'),
		}, {
			resource: URI.parse('opaque-canvas:/exact'),
			instanceId: 'instance',
			title: 'Private title',
			source: URI.parse('http://127.0.0.1:12345/private?token=secret'),
		}));
		input.setSerializationId('runtime-capability');
		const requests: string[] = [];
		const warnings: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionCanvasService, {
			restoreCanvasInput: serializationId => {
				requests.push(serializationId);
				return input;
			},
		});
		const serializer = new SessionCanvasSerializer(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		return { input, instantiationService, requests, serializer, warnings };
	}

	test('serializes only an opaque live-runtime capability', () => {
		const { input, instantiationService, requests, serializer } = createHarness();
		const serialized = serializer.serialize(input)!;
		const restored = serializer.deserialize(instantiationService, serialized);

		assert.deepStrictEqual({
			data: JSON.parse(serialized),
			containsProvider: serialized.includes(input.reference.providerId),
			containsSession: serialized.includes(input.reference.session.toString()),
			containsChat: serialized.includes(input.reference.chat.toString()),
			containsCanvas: serialized.includes(input.reference.canvas.toString()),
			containsSource: serialized.includes('127.0.0.1'),
			requests,
			canonical: restored === input,
		}, {
			data: { version: 1, id: 'runtime-capability' },
			containsProvider: false,
			containsSession: false,
			containsChat: false,
			containsCanvas: false,
			containsSource: false,
			requests: ['runtime-capability'],
			canonical: true,
		});
	});

	test('does not serialize a presentation before its live open is admitted', () => {
		const { input, serializer } = createHarness();
		const pending = store.add(new SessionCanvasInput(input.reference, input.canvas.get()));

		assert.strictEqual(serializer.serialize(pending), undefined);
	});

	test('rejects malformed and unsupported capabilities before consulting runtime authority', () => {
		const { instantiationService, requests, serializer, warnings } = createHarness();
		const results = [
			'not-json',
			'null',
			'[]',
			'{}',
			JSON.stringify({ version: 2, id: 'runtime-capability' }),
			JSON.stringify({ version: 1, id: '' }),
			JSON.stringify({ version: 1, id: 42 }),
		].map(value => serializer.deserialize(instantiationService, value));

		assert.deepStrictEqual({
			results,
			requests,
			warnings: warnings.length,
			warningsAreContentFree: warnings.every(warning => warning === '[SessionCanvasSerializer] Ignoring invalid canvas presentation'),
		}, {
			results: Array(7).fill(undefined),
			requests: [],
			warnings: 7,
			warningsAreContentFree: true,
		});
	});

	test('a valid capability has no authority in a fresh service instance', () => {
		const { input, instantiationService, serializer } = createHarness();
		instantiationService.stub(ISessionCanvasService, { restoreCanvasInput: () => undefined });

		assert.strictEqual(serializer.deserialize(instantiationService, serializer.serialize(input)!), undefined);
	});
});
