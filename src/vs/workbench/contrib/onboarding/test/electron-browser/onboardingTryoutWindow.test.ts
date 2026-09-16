/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOnboardingTryoutScenario, IOnboardingTryoutService, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../common/onboardingTryout.js';
import { NativeOnboardingTryoutWindow } from '../../electron-browser/onboardingTryoutWindow.js';

class TestTryoutService extends mock<IOnboardingTryoutService>() {
	readonly tryouts = new Map<string, IOnboardingTryoutScenario>();
	windowOpener: Parameters<IOnboardingTryoutService['registerWindowOpener']>[0] | undefined;

	override getTryout(id: string): IOnboardingTryoutScenario | undefined {
		return this.tryouts.get(id);
	}

	override registerWindowOpener(opener: NonNullable<TestTryoutService['windowOpener']>) {
		assert.strictEqual(this.windowOpener, undefined);
		this.windowOpener = opener;
		return toDisposable(() => this.windowOpener = undefined);
	}
}

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly id: string; readonly args: readonly unknown[] }[] = [];
	error: Error | undefined;

	override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ id, args });
		if (this.error) {
			throw this.error;
		}
		return undefined;
	}
}

suite('NativeOnboardingTryoutWindow', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tryout: IOnboardingTryoutScenario = {
		id: 'test.agentsExample',
		trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID },
		tryout: { title: 'Example', description: 'An Agents window example.', targetWindow: 'agents' },
		presentation: { kind: 'test', payload: undefined },
	};

	function createWindow(isSessionsWindow = true, whenRestored = Promise.resolve()) {
		const instantiationService = store.add(new TestInstantiationService());
		const requests = store.add(new Emitter<readonly unknown[]>());
		const tryoutService = new TestTryoutService();
		tryoutService.tryouts.set(tryout.id, tryout);
		const commands = new TestCommandService();
		const nativeCalls: IOpenAgentsWindowOptions[] = [];
		const notificationErrors: (string | Error)[] = [];
		const loggedErrors: unknown[][] = [];
		instantiationService.stub(IOnboardingTryoutService, tryoutService);
		instantiationService.stub(ICommandService, commands);
		instantiationService.stub(INativeHostService, {
			openAgentsWindow: async options => { nativeCalls.push(options ?? {}); },
		});
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow });
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override error(error: string | Error) {
				notificationErrors.push(error);
				return super.error(error);
			}
		});
		instantiationService.stub(ILogService, store.add(new class extends NullLogService {
			override error(message: string | Error, ...args: unknown[]): void {
				loggedErrors.push([message, ...args]);
			}
		}));
		const createBridge = () => store.add(instantiationService.createInstance(NativeOnboardingTryoutWindow, requests.event, whenRestored));
		const bridge = createBridge();
		return { bridge, createBridge, requests, tryoutService, commands, nativeCalls, notificationErrors, loggedErrors, instantiationService };
	}

	test('registers a native opener that forwards only the registered identifier', async () => {
		const context = createWindow(false);
		assert.ok(context.tryoutService.windowOpener);

		await context.tryoutService.windowOpener(tryout.id, CancellationToken.None);
		context.bridge.dispose();

		assert.deepStrictEqual({
			nativeCalls: context.nativeCalls,
			commands: context.commands.calls,
			opener: context.tryoutService.windowOpener,
		}, {
			nativeCalls: [{ tryoutId: tryout.id }],
			commands: [],
			opener: undefined,
		});
	});

	test('does not dispatch a cancelled native open', async () => {
		const context = createWindow(false);
		assert.ok(context.tryoutService.windowOpener);

		await assert.rejects(context.tryoutService.windowOpener(tryout.id, CancellationToken.Cancelled), isCancellationError);
		assert.deepStrictEqual(context.nativeCalls, []);
	});

	test('propagates native open failures to the shared command', async () => {
		const context = createWindow(false);
		const error = new Error('Window could not be opened');
		context.instantiationService.stub(INativeHostService, 'openAgentsWindow', async () => { throw error; });
		assert.ok(context.tryoutService.windowOpener);

		await assert.rejects(context.tryoutService.windowOpener(tryout.id, CancellationToken.None), candidate => candidate === error);
	});

	test('queues an initial request until contributions have registered the destination example', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		context.tryoutService.tryouts.clear();

		context.requests.fire([tryout.id]);
		await timeout(0);
		const beforeRestore = context.commands.calls.length;
		context.tryoutService.tryouts.set(tryout.id, tryout);
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({
			beforeRestore,
			commands: context.commands.calls,
			errors: context.notificationErrors,
		}, {
			beforeRestore: 0,
			commands: [{ id: RUN_ONBOARDING_TRYOUT_COMMAND_ID, args: [tryout.id] }],
			errors: [],
		});
	});

	test('dispatches a reused-window request through the shared availability-checking command', async () => {
		const context = createWindow();
		context.requests.fire([tryout.id]);
		await timeout(0);

		assert.deepStrictEqual(context.commands.calls, [{ id: RUN_ONBOARDING_TRYOUT_COMMAND_ID, args: [tryout.id] }]);
	});

	test('does not replay a consumed initial request when the receiver is recreated', async () => {
		const context = createWindow();
		context.requests.fire([tryout.id]);
		await timeout(0);
		context.bridge.dispose();
		context.createBridge();
		await timeout(0);
		const commandsAfterReload = context.commands.calls.length;
		context.requests.fire([tryout.id]);
		await timeout(0);

		assert.deepStrictEqual({ commandsAfterReload, commands: context.commands.calls }, {
			commandsAfterReload: 1,
			commands: [
				{ id: RUN_ONBOARDING_TRYOUT_COMMAND_ID, args: [tryout.id] },
				{ id: RUN_ONBOARDING_TRYOUT_COMMAND_ID, args: [tryout.id] },
			],
		});
	});

	test('does not dispatch a pending initial request after the receiver is disposed', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		context.requests.fire([tryout.id]);
		context.bridge.dispose();
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({ commands: context.commands.calls, errors: context.notificationErrors }, { commands: [], errors: [] });
	});

	test('does not consume destination requests in a normal workbench window', async () => {
		const context = createWindow(false);
		context.requests.fire([tryout.id]);
		await timeout(0);

		assert.deepStrictEqual(context.commands.calls, []);
	});

	for (const { name, args } of [
		{ name: 'missing ID', args: [] },
		{ name: 'empty ID', args: [''] },
		{ name: 'non-string ID', args: [42] },
		{ name: 'command object', args: [{ id: tryout.id, command: 'arbitrary.command', arguments: [] }] },
		{ name: 'command URI', args: ['command:arbitrary.command'] },
		{ name: 'oversized ID', args: ['a'.repeat(129)] },
		{ name: 'extra arguments', args: [tryout.id, 'extra'] },
		{ name: 'unregistered ID', args: ['test.unknownExample'] },
	]) {
		test(`rejects and reports ${name} without dispatching a command`, async () => {
			const context = createWindow();
			context.requests.fire(args);
			await timeout(0);

			assert.deepStrictEqual({
				commands: context.commands.calls,
				notifications: context.notificationErrors.length,
				logs: context.loggedErrors.length,
			}, { commands: [], notifications: 1, logs: 1 });
		});
	}

	test('rejects an example registered for a different window', async () => {
		const context = createWindow();
		context.tryoutService.tryouts.set(tryout.id, { ...tryout, tryout: { ...tryout.tryout, targetWindow: undefined } });
		context.requests.fire([tryout.id]);
		await timeout(0);

		assert.deepStrictEqual({
			commands: context.commands.calls,
			notifications: context.notificationErrors.length,
			logs: context.loggedErrors.length,
		}, { commands: [], notifications: 1, logs: 1 });
	});

	test('rechecks registration after waiting for restore', async () => {
		const restored = new DeferredPromise<void>();
		const context = createWindow(true, restored.p);
		context.requests.fire([tryout.id]);
		context.tryoutService.tryouts.delete(tryout.id);
		await restored.complete();
		await timeout(0);

		assert.deepStrictEqual({
			commands: context.commands.calls,
			notifications: context.notificationErrors.length,
			logs: context.loggedErrors.length,
		}, { commands: [], notifications: 1, logs: 1 });
	});

	test('logs shared-command failures without duplicating its notifications', async () => {
		const context = createWindow();
		const error = new Error('Shared command failed');
		context.commands.error = error;
		context.requests.fire([tryout.id]);
		await timeout(0);

		assert.deepStrictEqual({
			errors: context.notificationErrors,
			logs: context.loggedErrors,
		}, {
			errors: [],
			logs: [['[OnboardingTryout] Native handoff failed', error]],
		});
	});
});
