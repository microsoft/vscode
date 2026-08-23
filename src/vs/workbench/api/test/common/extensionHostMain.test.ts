/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SerializedError, errorHandler, onUnexpectedError } from '../../../../base/common/errors.js';
import { isFirefox, isSafari } from '../../../../base/common/platform.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadErrorsShape, MainThreadExtensionServiceShape } from '../../common/extHost.protocol.js';
import { ExtensionPaths, IExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ErrorHandler } from '../../common/extensionHostMain.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ProxyIdentifier, Proxied } from '../../../services/extensions/common/proxyIdentifier.js';
import { IExtHostApiDeprecationService, NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtensionDescriptionRegistry, IActivationEventsReader } from '../../../services/extensions/common/extensionDescriptionRegistry.js';


suite('ExtensionHostMain#ErrorHandler - Wrapping prepareStackTrace can cause slowdown and eventual stack overflow #184926 ', function () {

	if (isFirefox || isSafari) {
		return;
	}

	const extensionsIndex = TernarySearchTree.forUris<IExtensionDescription>();
	const mainThreadExtensionsService = new class extends mock<MainThreadExtensionServiceShape>() implements MainThreadErrorsShape {
		override $onExtensionRuntimeError(extensionId: ExtensionIdentifier, data: SerializedError): void {

		}
		$onUnexpectedError(err: any | SerializedError): void {

		}
	};

	const basicActivationEventsReader: IActivationEventsReader = {
		readActivationEvents: (extensionDescription: IExtensionDescription): string[] => {
			return [];
		}
	};

	const collection = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IExtHostTelemetry, new class extends mock<IExtHostTelemetry>() {
			declare readonly _serviceBrand: undefined;
			override onExtensionError(extension: ExtensionIdentifier, error: Error): boolean {
				return true;
			}
		}],
		[IExtHostExtensionService, new class extends mock<IExtHostExtensionService & any>() {
			declare readonly _serviceBrand: undefined;
			getExtensionPathIndex() {
				return new class extends ExtensionPaths {
					override findSubstr(key: URI): IExtensionDescription | undefined {
						findSubstrCount++;
						return nullExtensionDescription;
					}

				}(extensionsIndex);
			}
			getExtensionRegistry() {
				return new class extends ExtensionDescriptionRegistry {
					override getExtensionDescription(extensionId: ExtensionIdentifier | string): IExtensionDescription | undefined {
						return nullExtensionDescription;
					}
				}(basicActivationEventsReader, []);
			}
		}],
		[IExtHostRpcService, new class extends mock<IExtHostRpcService>() {
			declare readonly _serviceBrand: undefined;
			override getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T> {
				// eslint-disable-next-line local/code-no-any-casts
				return <any>mainThreadExtensionsService;
			}
		}],
		[IExtHostApiDeprecationService, NullApiDeprecationService],
	);

	const originalPrepareStackTrace = Error.prepareStackTrace;
	const insta = new InstantiationService(collection, false);

	let existingErrorHandler: (e: any) => void;
	let findSubstrCount = 0;

	ensureNoDisposablesAreLeakedInTestSuite();

	suiteSetup(async function () {
		existingErrorHandler = errorHandler.getUnexpectedErrorHandler();
		await insta.invokeFunction(ErrorHandler.installFullHandler);
	});

	suiteTeardown(function () {
		errorHandler.setUnexpectedErrorHandler(existingErrorHandler);
	});

	setup(async function () {
		findSubstrCount = 0;
	});

	teardown(() => {
		Error.prepareStackTrace = originalPrepareStackTrace;
	});

	test('basics', function () {

		const err = new Error('test1');

		onUnexpectedError(err);

		assert.strictEqual(findSubstrCount, 1);

	});

	test('set/reset prepareStackTrace-callback', function () {

		const original = Error.prepareStackTrace;
		Error.prepareStackTrace = (_error, _stack) => 'stack';
		const probeErr = new Error();
		const stack = probeErr.stack;
		assert.ok(stack);
		Error.prepareStackTrace = original;
		assert.strictEqual(findSubstrCount, 1);

		// already checked
		onUnexpectedError(probeErr);
		assert.strictEqual(findSubstrCount, 1);

		// one more error
		const err = new Error('test2');
		onUnexpectedError(err);

		assert.strictEqual(findSubstrCount, 2);
	});

	test('wrap prepareStackTrace-callback', function () {

		function do_something_else(params: string) {
			return params;
		}

		const original = Error.prepareStackTrace;
		Error.prepareStackTrace = (...args) => {
			return do_something_else(original?.(...args));
		};
		const probeErr = new Error();
		const stack = probeErr.stack;
		assert.ok(stack);


		onUnexpectedError(probeErr);
		assert.strictEqual(findSubstrCount, 1);
	});

	test('prevent rewrapping', function () {

		let do_something_count = 0;
		function do_something(params: any) {
			do_something_count++;
		}

		Error.prepareStackTrace = (result, stack) => {
			do_something(stack);
			return 'fakestack';
		};

		for (let i = 0; i < 2_500; ++i) {
			Error.prepareStackTrace = Error.prepareStackTrace;
		}

		const probeErr = new Error();
		const stack = probeErr.stack;
		assert.strictEqual(stack, 'fakestack');

		onUnexpectedError(probeErr);
		assert.strictEqual(findSubstrCount, 1);

		const probeErr2 = new Error();
		onUnexpectedError(probeErr2);
		assert.strictEqual(findSubstrCount, 2);
		assert.strictEqual(do_something_count, 2);
	});


	suite('https://gist.github.com/thecrypticace/f0f2e182082072efdaf0f8e1537d2cce', function () {

		test('Restored, separate operations', () => {
			// Actual Test
			let original;

			// Operation 1
			original = Error.prepareStackTrace;
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			const err1 = new Error();
			assert.ok(err1.stack);
			assert.strictEqual(findSubstrCount, 1);
			Error.prepareStackTrace = original;

			// Operation 2
			original = Error.prepareStackTrace;
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);
			assert.strictEqual(findSubstrCount, 2);
			Error.prepareStackTrace = original;

			// Operation 3
			original = Error.prepareStackTrace;
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);
			assert.strictEqual(findSubstrCount, 3);
			Error.prepareStackTrace = original;

			// Operation 4
			original = Error.prepareStackTrace;
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);
			assert.strictEqual(findSubstrCount, 4);
			Error.prepareStackTrace = original;

			// Back to Operation 1
			assert.ok(err1.stack);
			assert.strictEqual(findSubstrCount, 4);
		});

		test('Never restored, separate operations', () => {
			// Operation 1
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);

			// Operation 2
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);

			// Operation 3
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);

			// Operation 4
			for (let i = 0; i < 12_500; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);
		});

		test('Restored, too many uses before restoration', async () => {
			const original = Error.prepareStackTrace;
			Error.prepareStackTrace = (_, stack) => stack;

			// Operation 1 — more uses of `prepareStackTrace`
			for (let i = 0; i < 10_000; ++i) { Error.prepareStackTrace = Error.prepareStackTrace; }
			assert.ok(new Error().stack);

			Error.prepareStackTrace = original;
		});
	});
});
