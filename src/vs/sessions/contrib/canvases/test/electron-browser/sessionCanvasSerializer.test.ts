/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { getSessionCanvasReferenceKey, ISessionCanvasReference, ISessionCanvasService, SessionCanvasInput } from '../../common/sessionCanvas.js';
import { SessionCanvasSerializer } from '../../electron-browser/sessionCanvasSerializer.js';

suite('SessionCanvasSerializer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const reference: ISessionCanvasReference = {
			providerId: 'host-advertised-provider',
			session: URI.parse('opaque-session:/exact'),
			chat: URI.parse('opaque-chat:/exact'),
			canvas: URI.parse('opaque-canvas:/exact'),
		};
		const input = store.add(new SessionCanvasInput(reference, {
			resource: reference.canvas,
			instanceId: 'instance',
			title: 'Private title',
			source: URI.parse('http://127.0.0.1:12345/private?token=secret'),
		}));
		const requests: ISessionCanvasReference[] = [];
		const warnings: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionCanvasService, {
			restoreCanvasInput: reference => {
				requests.push(reference);
				return input;
			},
		});
		const serializer = new SessionCanvasSerializer(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		return { input, instantiationService, reference, requests, serializer, warnings };
	}

	test('serializes only the versioned exact identity and adopts the service canonical input', () => {
		const { input, instantiationService, reference, requests, serializer } = createHarness();
		const serialized = serializer.serialize(input)!;
		const restored = serializer.deserialize(instantiationService, serialized);
		assert.deepStrictEqual({
			data: JSON.parse(serialized),
			requests: requests.map(getSessionCanvasReferenceKey),
			canonical: restored === input,
			canReopen: input.canReopen(),
		}, {
			data: {
				version: 1,
				providerId: reference.providerId,
				session: reference.session.toString(),
				chat: reference.chat.toString(),
				canvas: reference.canvas.toString(),
			},
			requests: [getSessionCanvasReferenceKey(reference)],
			canonical: true,
			canReopen: false,
		});
	});

	test('rejects malformed and unsupported identities before consulting runtime authority', () => {
		const { input, instantiationService, requests, serializer, warnings } = createHarness();
		const valid = JSON.parse(serializer.serialize(input)!);
		const results = [
			'not-json', 'null', '[]', '{}',
			JSON.stringify({ ...valid, version: 2 }),
			JSON.stringify({ ...valid, providerId: '' }),
			JSON.stringify({ ...valid, session: '/schemeless' }),
			JSON.stringify({ ...valid, chat: 42 }),
			JSON.stringify({ ...valid, canvas: '' }),
		].map(value => serializer.deserialize(instantiationService, value));
		assert.deepStrictEqual({
			results, requests, warnings: warnings.length,
			warningsAreContentFree: warnings.every(warning => warning === '[SessionCanvasSerializer] Ignoring invalid canvas reference'),
		}, { results: Array(9).fill(undefined), requests: [], warnings: 9, warningsAreContentFree: true });
	});

	test('persisted identity is not authority when the runtime refuses restoration', () => {
		const { input, instantiationService, serializer } = createHarness();
		instantiationService.stub(ISessionCanvasService, { restoreCanvasInput: () => undefined });
		assert.strictEqual(serializer.deserialize(instantiationService, serializer.serialize(input)!), undefined);
	});
});
