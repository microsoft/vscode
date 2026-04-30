/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import Sinon from 'sinon';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CompletionNotifier, CompletionRequestedEvent } from '../completionNotifier';
import { CompletionState, createCompletionState } from '../completionState';
import { TelemetryWithExp } from '../telemetry';
import { createLibTestingContext } from './context';
import { createTextDocument } from './textDocument';

suite('Completion Notifier', function () {
	let accessor: ServicesAccessor;
	let notifier: CompletionNotifier;
	let completionState: CompletionState;
	let telemetryData: TelemetryWithExp;

	let clock: Sinon.SinonFakeTimers;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		notifier = instantiationService.createInstance(CompletionNotifier);

		const textDocument = createTextDocument('file:///test.ts', 'typescript', 1, 'const x = ');
		const position = { line: 0, character: 10 };
		completionState = createCompletionState(textDocument, position);
		telemetryData = TelemetryWithExp.createEmptyConfigForTesting();

		clock = Sinon.useFakeTimers();
	});

	teardown(function () {
		clock.restore();
	});

	test('should notify about requests', function () {
		let notifiedEvent: CompletionRequestedEvent | undefined;
		const disposable = notifier.onRequest((event: CompletionRequestedEvent) => {
			notifiedEvent = event;
		});

		for (let i = 0; i < 3; i++) {
			const completionId = `test-completion-id-${i}`;
			notifier.notifyRequest(completionState, completionId, telemetryData);
			assert.ok(notifiedEvent, 'Expected event to be notified');
			assert.strictEqual(notifiedEvent.completionId, completionId);
			assert.strictEqual(notifiedEvent.completionState, completionState);
			assert.strictEqual(notifiedEvent.telemetryData, telemetryData);
			notifiedEvent = undefined; // Reset for each iteration
		}

		disposable.dispose();
	});

	test('should not propagate errors from listeners', function () {
		// The telemetryCatch wrapper should handle errors, so the test should not throw
		let errorThrown = false;
		const disposable = notifier.onRequest(() => {
			throw new Error('Test error from listener');
		});

		try {
			notifier.notifyRequest(completionState, 'test-completion-id', telemetryData);
			// If we reach here, the error was caught and handled properly
		} catch (error) {
			errorThrown = true;
		}

		assert.strictEqual(errorThrown, false, 'Error should be caught and not propagated');
		disposable.dispose();
	});

	test('should dispose listeners', function () {
		let requestCount = 0;

		const requestDisposable = notifier.onRequest(() => {
			requestCount++;
		});

		// Dispose listeners before making any requests
		requestDisposable.dispose();

		// Make a request - should not trigger any listeners
		notifier.notifyRequest(completionState, 'test-completion-id', telemetryData);

		assert.strictEqual(requestCount, 0, 'Request listener should be disposed');
	});
});
