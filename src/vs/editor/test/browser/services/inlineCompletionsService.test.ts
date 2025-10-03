/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InlineCompletionsService, SnoozeInlineCompletion } from '../../../browser/services/inlineCompletionsService.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';

suite('InlineCompletionsService', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setSnoozeDuration sets snooze in milliseconds', function () {
		const configService = new TestConfigurationService();
		const contextKeyService = new ContextKeyService(configService);
		const service = new InlineCompletionsService(contextKeyService, NullTelemetryService);

		const fiveMinutesInMs = 5 * 60_000;
		service.setSnoozeDuration(fiveMinutesInMs);

		assert.ok(service.isSnoozing(), 'Service should be snoozing');
		assert.ok(service.snoozeTimeLeft > 0, 'Snooze time should be greater than 0');
		assert.ok(service.snoozeTimeLeft <= fiveMinutesInMs, 'Snooze time should be less than or equal to 5 minutes');

		service.dispose();
		contextKeyService.dispose();
	});

	test('snooze action converts minutes to milliseconds when numeric arg provided', async function () {
		const configService = new TestConfigurationService();
		const contextKeyService = new ContextKeyService(configService);
		const inlineCompletionsService = new InlineCompletionsService(contextKeyService, NullTelemetryService);

		class TestStorageService extends mock<IStorageService>() {
			override getNumber(key: string, scope: any, fallbackValue: number): number;
			override getNumber(key: string, scope: any): number | undefined;
			override getNumber(key: string, scope: any, fallbackValue?: number): number | undefined {
				return fallbackValue;
			}
			override store() { }
		}

		class TestQuickInputService extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(): Promise<T | undefined> {
				throw new Error('Should not be called when numeric arg is provided');
			}
		}

		const storageService = new TestStorageService();
		const quickInputService = new TestQuickInputService();

		const accessor: ServicesAccessor = {
			get(id: any) {
				if (id.toString() === 'IInlineCompletionsService') {
					return inlineCompletionsService;
				}
				if (id.toString() === 'storageService') {
					return storageService;
				}
				if (id.toString() === 'quickInputService') {
					return quickInputService;
				}
				throw new Error(`Unexpected service requested: ${id}`);
			}
		} as ServicesAccessor;

		const action = new SnoozeInlineCompletion();

		// Call with 5 minutes as the argument
		await action.run(accessor, 5);

		// Verify that the service is now snoozed
		assert.ok(inlineCompletionsService.isSnoozing(), 'Service should be snoozing after action is run');

		// Verify that the snooze time is approximately 5 minutes (in milliseconds)
		const expectedDurationMs = 5 * 60_000;
		const actualDurationMs = inlineCompletionsService.snoozeTimeLeft;

		// Allow for a small time difference due to execution time
		assert.ok(actualDurationMs > expectedDurationMs - 100, `Snooze time (${actualDurationMs}ms) should be close to ${expectedDurationMs}ms`);
		assert.ok(actualDurationMs <= expectedDurationMs, `Snooze time (${actualDurationMs}ms) should not exceed ${expectedDurationMs}ms`);

		inlineCompletionsService.dispose();
		contextKeyService.dispose();
	});

	test('snooze action with 0 prompts user for duration', async function () {
		const configService = new TestConfigurationService();
		const contextKeyService = new ContextKeyService(configService);
		const inlineCompletionsService = new InlineCompletionsService(contextKeyService, NullTelemetryService);

		class TestStorageService extends mock<IStorageService>() {
			override getNumber(key: string, scope: any, fallbackValue: number): number;
			override getNumber(key: string, scope: any): number | undefined;
			override getNumber(key: string, scope: any, fallbackValue?: number): number | undefined {
				return fallbackValue;
			}
			override store() { }
		}

		let pickWasCalled = false;
		class TestQuickInputService extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(): Promise<T | undefined> {
				pickWasCalled = true;
				return Promise.resolve(undefined);
			}
		}

		const storageService = new TestStorageService();
		const quickInputService = new TestQuickInputService();

		const accessor: ServicesAccessor = {
			get(id: any) {
				if (id.toString() === 'IInlineCompletionsService') {
					return inlineCompletionsService;
				}
				if (id.toString() === 'storageService') {
					return storageService;
				}
				if (id.toString() === 'quickInputService') {
					return quickInputService;
				}
				throw new Error(`Unexpected service requested: ${id}`);
			}
		} as ServicesAccessor;

		const action = new SnoozeInlineCompletion();

		// Call with 0 minutes as the argument
		await action.run(accessor, 0);

		// Verify that the quick pick was called because 0 is treated as falsy
		assert.ok(pickWasCalled, 'Quick pick should be called when 0 is passed (0 is falsy)');

		// Verify that the service is NOT snoozed (because user cancelled the pick)
		assert.ok(!inlineCompletionsService.isSnoozing(), 'Service should not be snoozing when user cancels');

		inlineCompletionsService.dispose();
		contextKeyService.dispose();
	});

	test('snooze action with 10 minutes', async function () {
		const configService = new TestConfigurationService();
		const contextKeyService = new ContextKeyService(configService);
		const inlineCompletionsService = new InlineCompletionsService(contextKeyService, NullTelemetryService);

		class TestStorageService extends mock<IStorageService>() {
			override getNumber(key: string, scope: any, fallbackValue: number): number;
			override getNumber(key: string, scope: any): number | undefined;
			override getNumber(key: string, scope: any, fallbackValue?: number): number | undefined {
				return fallbackValue;
			}
			override store() { }
		}

		class TestQuickInputService extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(): Promise<T | undefined> {
				throw new Error('Should not be called when numeric arg is provided');
			}
		}

		const storageService = new TestStorageService();
		const quickInputService = new TestQuickInputService();

		const accessor: ServicesAccessor = {
			get(id: any) {
				if (id.toString() === 'IInlineCompletionsService') {
					return inlineCompletionsService;
				}
				if (id.toString() === 'storageService') {
					return storageService;
				}
				if (id.toString() === 'quickInputService') {
					return quickInputService;
				}
				throw new Error(`Unexpected service requested: ${id}`);
			}
		} as ServicesAccessor;

		const action = new SnoozeInlineCompletion();

		// Call with 10 minutes as the argument
		await action.run(accessor, 10);

		// Verify that the service is snoozed
		assert.ok(inlineCompletionsService.isSnoozing(), 'Service should be snoozing');

		// Verify that the snooze time is approximately 10 minutes
		const expectedDurationMs = 10 * 60_000;
		const actualDurationMs = inlineCompletionsService.snoozeTimeLeft;

		assert.ok(actualDurationMs > expectedDurationMs - 100, `Snooze time should be close to ${expectedDurationMs}ms`);
		assert.ok(actualDurationMs <= expectedDurationMs, `Snooze time should not exceed ${expectedDurationMs}ms`);

		inlineCompletionsService.dispose();
		contextKeyService.dispose();
	});
});
