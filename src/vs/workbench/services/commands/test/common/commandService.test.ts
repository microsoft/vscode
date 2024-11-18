/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { CommandService } from '../../common/commandService.js';
import { NullExtensionService } from '../../../extensions/common/extensions.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';

suite('CommandService', function () {

	let commandRegistration: IDisposable;

	setup(function () {
		commandRegistration = CommandsRegistry.registerCommand('foo', function () { });
	});

	teardown(function () {
		commandRegistration.dispose();
	});

	test('activateOnCommand', () => {

		let lastEvent: string;

		const service = new CommandService(new InstantiationService(), new class extends NullExtensionService {
			override activateByEvent(activationEvent: string): Promise<void> {
				lastEvent = activationEvent;
				return super.activateByEvent(activationEvent);
			}
		}, new NullLogService());

		return service.executeCommand('foo').then(() => {
			assert.ok(lastEvent, 'onCommand:foo');
			return service.executeCommand('unknownCommandId');
		}).then(() => {
			assert.ok(false);
		}, () => {
			assert.ok(lastEvent, 'onCommand:unknownCommandId');
		});
	});

	test('fwd activation error', async function () {

		const extensionService = new class extends NullExtensionService {
			override activateByEvent(activationEvent: string): Promise<void> {
				return Promise.reject(new Error('bad_activate'));
			}
		};

		const service = new CommandService(new InstantiationService(), extensionService, new NullLogService());

		await extensionService.whenInstalledExtensionsRegistered();

		return service.executeCommand('foo').then(() => assert.ok(false), err => {
			assert.strictEqual(err.message, 'bad_activate');
		});
	});

	test('!onReady, but executeCommand', function () {

		let callCounter = 0;
		const reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);

		const service = new CommandService(new InstantiationService(), new class extends NullExtensionService {
			override whenInstalledExtensionsRegistered() {
				return new Promise<boolean>(_resolve => { /*ignore*/ });
			}
		}, new NullLogService());

		service.executeCommand('bar');
		assert.strictEqual(callCounter, 1);
		reg.dispose();
	});

	test('issue #34913: !onReady, unknown command', function () {

		let callCounter = 0;
		let resolveFunc: Function;
		const whenInstalledExtensionsRegistered = new Promise<boolean>(_resolve => { resolveFunc = _resolve; });

		const service = new CommandService(new InstantiationService(), new class extends NullExtensionService {
			override whenInstalledExtensionsRegistered() {
				return whenInstalledExtensionsRegistered;
			}
		}, new NullLogService());

		const r = service.executeCommand('bar');
		assert.strictEqual(callCounter, 0);

		const reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);
		resolveFunc!(true);

		return r.then(() => {
			reg.dispose();
			assert.strictEqual(callCounter, 1);
		});
	});

	test('Stop waiting for * extensions to activate when trigger is satisfied #62457', function () {

		let callCounter = 0;
		const disposable = new DisposableStore();
		const events: string[] = [];
		const service = new CommandService(new InstantiationService(), new class extends NullExtensionService {

			override activateByEvent(event: string): Promise<void> {
				events.push(event);
				if (event === '*') {
					return new Promise(() => { }); //forever promise...
				}
				if (event.indexOf('onCommand:') === 0) {
					return new Promise(resolve => {
						setTimeout(() => {
							const reg = CommandsRegistry.registerCommand(event.substr('onCommand:'.length), () => {
								callCounter += 1;
							});
							disposable.add(reg);
							resolve();
						}, 0);
					});
				}
				return Promise.resolve();
			}

		}, new NullLogService());

		return service.executeCommand('farboo').then(() => {
			assert.strictEqual(callCounter, 1);
			assert.deepStrictEqual(events.sort(), ['*', 'onCommand:farboo'].sort());
		}).finally(() => {
			disposable.dispose();
		});
	});

	test('issue #71471: wait for onCommand activation even if a command is registered', () => {
		const expectedOrder: string[] = ['registering command', 'resolving activation event', 'executing command'];
		const actualOrder: string[] = [];
		const disposables = new DisposableStore();
		const service = new CommandService(new InstantiationService(), new class extends NullExtensionService {

			override activateByEvent(event: string): Promise<void> {
				if (event === '*') {
					return new Promise(() => { }); //forever promise...
				}
				if (event.indexOf('onCommand:') === 0) {
					return new Promise(resolve => {
						setTimeout(() => {
							// Register the command after some time
							actualOrder.push('registering command');
							const reg = CommandsRegistry.registerCommand(event.substr('onCommand:'.length), () => {
								actualOrder.push('executing command');
							});
							disposables.add(reg);

							setTimeout(() => {
								// Resolve the activation event after some more time
								actualOrder.push('resolving activation event');
								resolve();
							}, 10);
						}, 10);
					});
				}
				return Promise.resolve();
			}

		}, new NullLogService());

		return service.executeCommand('farboo2').then(() => {
			assert.deepStrictEqual(actualOrder, expectedOrder);
		}).finally(() => {
			disposables.dispose();
		});
	});

	test('issue #142155: execute commands synchronously if possible', async () => {
		const actualOrder: string[] = [];

		const disposables = new DisposableStore();
		disposables.add(CommandsRegistry.registerCommand(`bizBaz`, () => {
			actualOrder.push('executing command');
		}));
		const extensionService = new class extends NullExtensionService {
			override activationEventIsDone(_activationEvent: string): boolean {
				return true;
			}
		};
		const service = new CommandService(new InstantiationService(), extensionService, new NullLogService());

		await extensionService.whenInstalledExtensionsRegistered();

		try {
			actualOrder.push(`before call`);
			const promise = service.executeCommand('bizBaz');
			actualOrder.push(`after call`);
			await promise;
			actualOrder.push(`resolved`);
			assert.deepStrictEqual(actualOrder, [
				'before call',
				'executing command',
				'after call',
				'resolved'
			]);
		} finally {
			disposables.dispose();
		}
	});
});
