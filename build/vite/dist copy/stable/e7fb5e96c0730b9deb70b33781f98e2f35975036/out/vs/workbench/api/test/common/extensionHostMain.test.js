/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { errorHandler, onUnexpectedError } from '../../../../base/common/errors.js';
import { isFirefox, isSafari } from '../../../../base/common/platform.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { ExtensionPaths, IExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ErrorHandler } from '../../common/extensionHostMain.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IExtHostApiDeprecationService, NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { ExtensionDescriptionRegistry } from '../../../services/extensions/common/extensionDescriptionRegistry.js';
suite('ExtensionHostMain#ErrorHandler - Wrapping prepareStackTrace can cause slowdown and eventual stack overflow #184926 ', function () {
    if (isFirefox || isSafari) {
        return;
    }
    const extensionsIndex = TernarySearchTree.forUris();
    const mainThreadExtensionsService = new class extends mock() {
        $onExtensionRuntimeError(extensionId, data) {
        }
        $onUnexpectedError(err) {
        }
    };
    const basicActivationEventsReader = {
        readActivationEvents: (extensionDescription) => {
            return [];
        }
    };
    const collection = new ServiceCollection([ILogService, new NullLogService()], [IExtHostTelemetry, new class extends mock() {
            onExtensionError(extension, error) {
                return true;
            }
        }], [IExtHostExtensionService, new class extends mock() {
            getExtensionPathIndex() {
                return new class extends ExtensionPaths {
                    findSubstr(key) {
                        findSubstrCount++;
                        return nullExtensionDescription;
                    }
                }(extensionsIndex);
            }
            getExtensionRegistry() {
                return new class extends ExtensionDescriptionRegistry {
                    getExtensionDescription(extensionId) {
                        return nullExtensionDescription;
                    }
                }(basicActivationEventsReader, []);
            }
        }], [IExtHostRpcService, new class extends mock() {
            getProxy(identifier) {
                // eslint-disable-next-line local/code-no-any-casts
                return mainThreadExtensionsService;
            }
        }], [IExtHostApiDeprecationService, NullApiDeprecationService]);
    const originalPrepareStackTrace = Error.prepareStackTrace;
    const insta = new InstantiationService(collection, false);
    let existingErrorHandler;
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
        function do_something_else(params) {
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
        function do_something(params) {
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
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            const err1 = new Error();
            assert.ok(err1.stack);
            assert.strictEqual(findSubstrCount, 1);
            Error.prepareStackTrace = original;
            // Operation 2
            original = Error.prepareStackTrace;
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            assert.strictEqual(findSubstrCount, 2);
            Error.prepareStackTrace = original;
            // Operation 3
            original = Error.prepareStackTrace;
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            assert.strictEqual(findSubstrCount, 3);
            Error.prepareStackTrace = original;
            // Operation 4
            original = Error.prepareStackTrace;
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            assert.strictEqual(findSubstrCount, 4);
            Error.prepareStackTrace = original;
            // Back to Operation 1
            assert.ok(err1.stack);
            assert.strictEqual(findSubstrCount, 4);
        });
        test('Never restored, separate operations', () => {
            // Operation 1
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            // Operation 2
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            // Operation 3
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            // Operation 4
            for (let i = 0; i < 12_500; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
        });
        test('Restored, too many uses before restoration', async () => {
            const original = Error.prepareStackTrace;
            Error.prepareStackTrace = (_, stack) => stack;
            // Operation 1 — more uses of `prepareStackTrace`
            for (let i = 0; i < 10_000; ++i) {
                Error.prepareStackTrace = Error.prepareStackTrace;
            }
            assert.ok(new Error().stack);
            Error.prepareStackTrace = original;
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdE1haW4udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9jb21tb24vZXh0ZW5zaW9uSG9zdE1haW4udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFtQixZQUFZLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN6RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJGLE9BQU8sRUFBRSxjQUFjLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFN0YsT0FBTyxFQUFFLDZCQUE2QixFQUFFLHlCQUF5QixFQUFFLE1B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Q0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7WUFDaEQsY0FBYztZQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFBQyxLQUFLLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1lBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFN0IsY0FBYztZQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFBQyxLQUFLLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1lBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFN0IsY0FBYztZQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFBQyxLQUFLLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1lBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFN0IsY0FBYztZQUNkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFBQyxLQUFLLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1lBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDN0QsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1lBQ3pDLEtBQUssQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQztZQUU5QyxpREFBaUQ7WUFDakQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUFDLEtBQUssQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUMsaUJBQWlCLENBQUM7WUFBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUU3QixLQUFLLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9