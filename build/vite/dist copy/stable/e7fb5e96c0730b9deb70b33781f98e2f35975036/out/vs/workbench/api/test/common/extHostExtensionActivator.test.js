/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { promiseWithResolvers, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { EmptyExtension, ExtensionActivationTimes, ExtensionsActivator } from '../../common/extHostExtensionActivator.js';
import { ExtensionDescriptionRegistry } from '../../../services/extensions/common/extensionDescriptionRegistry.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
suite('ExtensionsActivator', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const idA = new ExtensionIdentifier(`a`);
    const idB = new ExtensionIdentifier(`b`);
    const idC = new ExtensionIdentifier(`c`);
    test('calls activate only once with sequential activations', async () => {
        const disposables = new DisposableStore();
        const host = new SimpleExtensionsActivatorHost();
        const activator = createActivator(host, [
            desc(idA)
        ], [], disposables);
        await activator.activateByEvent('*', false);
        assert.deepStrictEqual(host.activateCalls, [idA]);
        await activator.activateByEvent('*', false);
        assert.deepStrictEqual(host.activateCalls, [idA]);
        disposables.dispose();
    });
    test('calls activate only once with parallel activations', async () => {
        const disposables = new DisposableStore();
        const extActivation = new ExtensionActivationPromiseSource();
        const host = new PromiseExtensionsActivatorHost([
            [idA, extActivation]
        ]);
        const activator = createActivator(host, [
            desc(idA, [], ['evt1', 'evt2'])
        ], [], disposables);
        const activate1 = activator.activateByEvent('evt1', false);
        const activate2 = activator.activateByEvent('evt2', false);
        extActivation.resolve();
        await activate1;
        await activate2;
        assert.deepStrictEqual(host.activateCalls, [idA]);
        disposables.dispose();
    });
    test('activates dependencies first', async () => {
        const disposables = new DisposableStore();
        const extActivationA = new ExtensionActivationPromiseSource();
        const extActivationB = new ExtensionActivationPromiseSource();
        const host = new PromiseExtensionsActivatorHost([
            [idA, extActivationA],
            [idB, extActivationB]
        ]);
        const activator = createActivator(host, [
            desc(idA, [idB], ['evt1']),
            desc(idB, [], ['evt1']),
        ], [], disposables);
        const activate = activator.activateByEvent('evt1', false);
        await timeout(0);
        assert.deepStrictEqual(host.activateCalls, [idB]);
        extActivationB.resolve();
        await timeout(0);
        assert.deepStrictEqual(host.activateCalls, [idB, idA]);
        extActivationA.resolve();
        await timeout(0);
        await activate;
        assert.deepStrictEqual(host.activateCalls, [idB, idA]);
        disposables.dispose();
    });
    test('Supports having resolved extensions', async () => {
        const disposables = new DisposableStore();
        const host = new SimpleExtensionsActivatorHost();
        const bExt = desc(idB);
        delete bExt.main;
        delete bExt.browser;
        const activator = createActivator(host, [
            desc(idA, [idB])
        ], [bExt], disposables);
        await activator.activateByEvent('*', false);
        assert.deepStrictEqual(host.activateCalls, [idA]);
        disposables.dispose();
    });
    test('Supports having external extensions', async () => {
        const disposables = new DisposableStore();
        const extActivationA = new ExtensionActivationPromiseSource();
        const extActivationB = new ExtensionActivationPromiseSource();
        const host = new PromiseExtensionsActivatorHost([
            [idA, extActivationA],
            [idB, extActivationB]
        ]);
        const bExt = desc(idB);
        bExt.api = 'none';
        const activator = createActivator(host, [
            desc(idA, [idB])
        ], [bExt], disposables);
        const activate = activator.activateByEvent('*', false);
        await timeout(0);
        assert.deepStrictEqual(host.activateCalls, [idB]);
        extActivationB.resolve();
        await timeout(0);
        assert.deepStrictEqual(host.activateCalls, [idB, idA]);
        extActivationA.resolve();
        await activate;
        assert.deepStrictEqual(host.activateCalls, [idB, idA]);
        disposables.dispose();
    });
    test('Error: activateById with missing extension', async () => {
        const disposables = new DisposableStore();
        const host = new SimpleExtensionsActivatorHost();
        const activator = createActivator(host, [
            desc(idA),
            desc(idB),
        ], [], disposables);
        let error = undefined;
        try {
            await activator.activateById(idC, { startup: false, extensionId: idC, activationEvent: 'none' });
        }
        catch (err) {
            error = err;
        }
        assert.strictEqual(typeof error === 'undefined', false);
        disposables.dispose();
    });
    test('Error: dependency missing', async () => {
        const disposables = new DisposableStore();
        const host = new SimpleExtensionsActivatorHost();
        const activator = createActivator(host, [
            desc(idA, [idB]),
        ], [], disposables);
        await activator.activateByEvent('*', false);
        assert.deepStrictEqual(host.errors.length, 1);
        assert.deepStrictEqual(host.errors[0][0], idA);
        disposables.dispose();
    });
    test('Error: dependency activation failed', async () => {
        const disposables = new DisposableStore();
        const extActivationA = new ExtensionActivationPromiseSource();
        const extActivationB = new ExtensionActivationPromiseSource();
        const host = new PromiseExtensionsActivatorHost([
            [idA, extActivationA],
            [idB, extActivationB]
        ]);
        const activator = createActivator(host, [
            desc(idA, [idB]),
            desc(idB)
        ], [], disposables);
        const activate = activator.activateByEvent('*', false);
        extActivationB.reject(new Error(`b fails!`));
        await activate;
        assert.deepStrictEqual(host.errors.length, 2);
        assert.deepStrictEqual(host.errors[0][0], idB);
        assert.deepStrictEqual(host.errors[1][0], idA);
        disposables.dispose();
    });
    test('issue #144518: Problem with git extension and vscode-icons', async () => {
        const disposables = new DisposableStore();
        const extActivationA = new ExtensionActivationPromiseSource();
        const extActivationB = new ExtensionActivationPromiseSource();
        const extActivationC = new ExtensionActivationPromiseSource();
        const host = new PromiseExtensionsActivatorHost([
            [idA, extActivationA],
            [idB, extActivationB],
            [idC, extActivationC]
        ]);
        const activator = createActivator(host, [
            desc(idA, [idB]),
            desc(idB),
            desc(idC),
        ], [], disposables);
        activator.activateByEvent('*', false);
        assert.deepStrictEqual(host.activateCalls, [idB, idC]);
        extActivationB.resolve();
        await timeout(0);
        assert.deepStrictEqual(host.activateCalls, [idB, idC, idA]);
        extActivationA.resolve();
        disposables.dispose();
    });
    class SimpleExtensionsActivatorHost {
        constructor() {
            this.activateCalls = [];
            this.errors = [];
        }
        onExtensionActivationError(extensionId, error, missingExtensionDependency) {
            this.errors.push([extensionId, error, missingExtensionDependency]);
        }
        actualActivateExtension(extensionId, reason) {
            this.activateCalls.push(extensionId);
            return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
        }
    }
    class PromiseExtensionsActivatorHost extends SimpleExtensionsActivatorHost {
        constructor(_promises) {
            super();
            this._promises = _promises;
        }
        actualActivateExtension(extensionId, reason) {
            this.activateCalls.push(extensionId);
            for (const [id, promiseSource] of this._promises) {
                if (id.value === extensionId.value) {
                    return promiseSource.promise;
                }
            }
            throw new Error(`Unexpected!`);
        }
    }
    class ExtensionActivationPromiseSource {
        constructor() {
            ({ promise: this.promise, resolve: this._resolve, reject: this._reject } = promiseWithResolvers());
        }
        resolve() {
            this._resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
        }
        reject(err) {
            this._reject(err);
        }
    }
    const basicActivationEventsReader = {
        readActivationEvents: (extensionDescription) => {
            return extensionDescription.activationEvents?.slice() ?? [];
        }
    };
    function createActivator(host, extensionDescriptions, otherHostExtensionDescriptions = [], disposables) {
        const registry = disposables.add(new ExtensionDescriptionRegistry(basicActivationEventsReader, extensionDescriptions));
        const globalRegistry = disposables.add(new ExtensionDescriptionRegistry(basicActivationEventsReader, extensionDescriptions.concat(otherHostExtensionDescriptions)));
        return disposables.add(new ExtensionsActivator(registry, globalRegistry, host, new NullLogService()));
    }
    function desc(id, deps = [], activationEvents = ['*']) {
        return {
            name: id.value,
            publisher: 'test',
            version: '0.0.0',
            engines: { vscode: '^1.0.0' },
            identifier: id,
            extensionLocation: URI.parse(`nothing://nowhere`),
            isBuiltin: false,
            isUnderDevelopment: false,
            isUserBuiltin: false,
            activationEvents,
            main: 'index.js',
            targetPlatform: "undefined" /* TargetPlatform.UNDEFINED */,
            extensionDependencies: deps.map(d => d.value),
            enabledApiProposals: undefined,
            preRelease: false,
        };
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEV4dGVuc2lvbkFjdGl2YXRvci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2NvbW1vbi9leHRIb3N0RXh0ZW5zaW9uQWN0aXZhdG9yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVqRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLG1CQUFtQixFQUF5QyxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQXNCLGNBQWMsRUFBRSx3QkFBd0IsRUFBRSxtQkFBbUIsRUFBNEIsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4SyxPQUFPLEVBQUUsNEJBQTRCLEVBQTJCLE1BQU0scUVBQXFFLENBQUM7QUFFNUksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXZFLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7SUFFakMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLEdBQUcsR0FBRyxJQUFJLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pDLE1BQU0sR0FBRyxHQUFHLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDekMsTUFBTSxHQUFHLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUV6QyxJQUFJLENBQUMsc0RBQXNELEVBQUUsS0FBSyxJ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