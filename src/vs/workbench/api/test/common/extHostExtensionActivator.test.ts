/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promiseWithResolvers, timeout } from '../../../../base/common/async.js';
import { Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ActivatedExtension, EmptyExtension, ExtensionActivationTimes, ExtensionsActivator, IExtensionsActivatorHost } from '../../common/extHostExtensionActivator.js';
import { ExtensionDescriptionRegistry, IActivationEventsReader } from '../../../services/extensions/common/extensionDescriptionRegistry.js';
import { ExtensionActivationReason, MissingExtensionDependency } from '../../../services/extensions/common/extensions.js';

suite('ExtensionsActivator', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const idA = new ExtensionIdentifier(`a`);
	const idB = new ExtensionIdentifier(`b`);
	const idC = new ExtensionIdentifier(`c`);

	test('calls activate only once with sequential activations', async () => {
		const host = new SimpleExtensionsActivatorHost();
		const activator = createActivator(host, [
			desc(idA)
		]);

		await activator.activateByEvent('*', false);
		assert.deepStrictEqual(host.activateCalls, [idA]);

		await activator.activateByEvent('*', false);
		assert.deepStrictEqual(host.activateCalls, [idA]);
	});

	test('calls activate only once with parallel activations', async () => {
		const extActivation = new ExtensionActivationPromiseSource();
		const host = new PromiseExtensionsActivatorHost([
			[idA, extActivation]
		]);
		const activator = createActivator(host, [
			desc(idA, [], ['evt1', 'evt2'])
		]);

		const activate1 = activator.activateByEvent('evt1', false);
		const activate2 = activator.activateByEvent('evt2', false);

		extActivation.resolve();

		await activate1;
		await activate2;

		assert.deepStrictEqual(host.activateCalls, [idA]);
	});

	test('activates dependencies first', async () => {
		const extActivationA = new ExtensionActivationPromiseSource();
		const extActivationB = new ExtensionActivationPromiseSource();
		const host = new PromiseExtensionsActivatorHost([
			[idA, extActivationA],
			[idB, extActivationB]
		]);
		const activator = createActivator(host, [
			desc(idA, [idB], ['evt1']),
			desc(idB, [], ['evt1']),
		]);

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
	});

	test('Supports having resolved extensions', async () => {
		const host = new SimpleExtensionsActivatorHost();
		const bExt = desc(idB);
		delete (<Mutable<IExtensionDescription>>bExt).main;
		delete (<Mutable<IExtensionDescription>>bExt).browser;
		const activator = createActivator(host, [
			desc(idA, [idB])
		], [bExt]);

		await activator.activateByEvent('*', false);
		assert.deepStrictEqual(host.activateCalls, [idA]);
	});

	test('Supports having external extensions', async () => {
		const extActivationA = new ExtensionActivationPromiseSource();
		const extActivationB = new ExtensionActivationPromiseSource();
		const host = new PromiseExtensionsActivatorHost([
			[idA, extActivationA],
			[idB, extActivationB]
		]);
		const bExt = desc(idB);
		(<Mutable<IExtensionDescription>>bExt).api = 'none';
		const activator = createActivator(host, [
			desc(idA, [idB])
		], [bExt]);

		const activate = activator.activateByEvent('*', false);

		await timeout(0);
		assert.deepStrictEqual(host.activateCalls, [idB]);
		extActivationB.resolve();

		await timeout(0);
		assert.deepStrictEqual(host.activateCalls, [idB, idA]);
		extActivationA.resolve();

		await activate;
		assert.deepStrictEqual(host.activateCalls, [idB, idA]);
	});

	test('Error: activateById with missing extension', async () => {
		const host = new SimpleExtensionsActivatorHost();
		const activator = createActivator(host, [
			desc(idA),
			desc(idB),
		]);

		let error: Error | undefined = undefined;
		try {
			await activator.activateById(idC, { startup: false, extensionId: idC, activationEvent: 'none' });
		} catch (err) {
			error = err;
		}

		assert.strictEqual(typeof error === 'undefined', false);
	});

	test('Error: dependency missing', async () => {
		const host = new SimpleExtensionsActivatorHost();
		const activator = createActivator(host, [
			desc(idA, [idB]),
		]);

		await activator.activateByEvent('*', false);

		assert.deepStrictEqual(host.errors.length, 1);
		assert.deepStrictEqual(host.errors[0][0], idA);
	});

	test('Error: dependency activation failed', async () => {
		const extActivationA = new ExtensionActivationPromiseSource();
		const extActivationB = new ExtensionActivationPromiseSource();
		const host = new PromiseExtensionsActivatorHost([
			[idA, extActivationA],
			[idB, extActivationB]
		]);
		const activator = createActivator(host, [
			desc(idA, [idB]),
			desc(idB)
		]);

		const activate = activator.activateByEvent('*', false);
		extActivationB.reject(new Error(`b fails!`));

		await activate;
		assert.deepStrictEqual(host.errors.length, 2);
		assert.deepStrictEqual(host.errors[0][0], idB);
		assert.deepStrictEqual(host.errors[1][0], idA);
	});

	test('issue #144518: Problem with git extension and vscode-icons', async () => {
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
		]);

		activator.activateByEvent('*', false);
		assert.deepStrictEqual(host.activateCalls, [idB, idC]);

		extActivationB.resolve();
		await timeout(0);

		assert.deepStrictEqual(host.activateCalls, [idB, idC, idA]);
		extActivationA.resolve();
	});

	class SimpleExtensionsActivatorHost implements IExtensionsActivatorHost {
		public readonly activateCalls: ExtensionIdentifier[] = [];
		public readonly errors: [ExtensionIdentifier, Error | null, MissingExtensionDependency | null][] = [];

		onExtensionActivationError(extensionId: ExtensionIdentifier, error: Error | null, missingExtensionDependency: MissingExtensionDependency | null): void {
			this.errors.push([extensionId, error, missingExtensionDependency]);
		}

		actualActivateExtension(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
			this.activateCalls.push(extensionId);
			return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
		}
	}

	class PromiseExtensionsActivatorHost extends SimpleExtensionsActivatorHost {

		constructor(
			private readonly _promises: [ExtensionIdentifier, ExtensionActivationPromiseSource][]
		) {
			super();
		}

		override actualActivateExtension(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
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
		private readonly _resolve: (value: ActivatedExtension) => void;
		private readonly _reject: (err: Error) => void;
		public readonly promise: Promise<ActivatedExtension>;

		constructor() {
			({ promise: this.promise, resolve: this._resolve, reject: this._reject } = promiseWithResolvers<ActivatedExtension>());
		}

		public resolve(): void {
			this._resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
		}

		public reject(err: Error): void {
			this._reject(err);
		}
	}

	const basicActivationEventsReader: IActivationEventsReader = {
		readActivationEvents: (extensionDescription: IExtensionDescription): string[] => {
			return extensionDescription.activationEvents ?? [];
		}
	};

	function createActivator(host: IExtensionsActivatorHost, extensionDescriptions: IExtensionDescription[], otherHostExtensionDescriptions: IExtensionDescription[] = []): ExtensionsActivator {
		const registry = new ExtensionDescriptionRegistry(basicActivationEventsReader, extensionDescriptions);
		const globalRegistry = new ExtensionDescriptionRegistry(basicActivationEventsReader, extensionDescriptions.concat(otherHostExtensionDescriptions));
		return new ExtensionsActivator(registry, globalRegistry, host, new NullLogService());
	}

	function desc(id: ExtensionIdentifier, deps: ExtensionIdentifier[] = [], activationEvents: string[] = ['*']): IExtensionDescription {
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
			targetPlatform: TargetPlatform.UNDEFINED,
			extensionDependencies: deps.map(d => d.value),
			enabledApiProposals: undefined,
			preRelease: false,
		};
	}

});
