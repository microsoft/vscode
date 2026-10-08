/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IConfirmation, IConfirmationResult } from '../../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { DevContainerGitCredentialForwardingSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { DevContainerGitCredentialForwarding } from '../../browser/devContainerGitCredentialForwarding.js';

suite('Dev Container Git credential forwarding consent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/project');
	const containerKey = ':devcontainer:first';

	function setup(mode: 'off' | 'prompt' | 'on' | undefined, answers: boolean[] = []) {
		const configuration = new TestConfigurationService({ [DevContainerGitCredentialForwardingSettingId]: mode });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const prompts: IConfirmation[] = [];
		const forwarding = store.add(new DevContainerGitCredentialForwarding(configuration, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				prompts.push(confirmation);
				return { confirmed: answers.shift() ?? false };
			}
		}(), new NullLogService()));
		return { configuration, prompts, forwarding };
	}

	async function changeMode(configuration: TestConfigurationService, mode: 'off' | 'prompt' | 'on'): Promise<void> {
		await configuration.setUserConfiguration(DevContainerGitCredentialForwardingSettingId, mode);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(key: string): boolean { return key === DevContainerGitCredentialForwardingSettingId; }
		}());
	}

	test('starting and reconnecting a container installs a gated helper without asking', async () => {
		const { prompts, forwarding } = setup(undefined, [true]);
		const states: boolean[] = [];
		const first = store.add(await forwarding.registerConnection(async enabled => { states.push(enabled); }));
		const startupPrompts = prompts.length;
		const allowed = await forwarding.request(workspace, containerKey, CancellationToken.None);
		first.dispose();
		store.add(await forwarding.registerConnection(async enabled => { states.push(enabled); }));
		const reconnected = await forwarding.request(workspace, containerKey, CancellationToken.None);
		assert.deepStrictEqual({
			startupPrompts, allowed, reconnected, states,
			prompts: prompts.length,
			disclosure: typeof prompts[0].detail === 'string' && prompts[0].detail.includes('all sessions and processes'),
		}, {
			startupPrompts: 0, allowed: true, reconnected: true, states: [true, true],
			prompts: 1, disclosure: true,
		});
	});

	test('off and on never ask and select the corresponding helper and access state', async () => {
		const results = [];
		for (const mode of ['off', 'on'] as const) {
			const { prompts, forwarding } = setup(mode);
			const states: boolean[] = [];
			store.add(await forwarding.registerConnection(async enabled => { states.push(enabled); }));
			const allowed = await forwarding.request(workspace, containerKey, CancellationToken.None);
			results.push({ mode, prompts: prompts.length, states, allowed });
		}
		assert.deepStrictEqual(results, [
			{ mode: 'off', prompts: 0, states: [false], allowed: false },
			{ mode: 'on', prompts: 0, states: [true], allowed: true },
		]);
	});

	test('a denial is reused without repeatedly prompting subsequent lookups', async () => {
		const { prompts, forwarding } = setup('prompt', [false]);
		const decisions = [];
		for (let i = 0; i < 3; i++) {
			decisions.push(await forwarding.request(workspace, containerKey, CancellationToken.None));
		}
		assert.deepStrictEqual({ decisions, prompts: prompts.length }, { decisions: [false, false, false], prompts: 1 });
	});

	test('decisions are specific to source host and actual container, and are not persisted', async () => {
		const { forwarding, prompts } = setup('prompt', [true, false, false]);
		const decisions = [
			await forwarding.request(workspace, 'host-one:devcontainer:first', CancellationToken.None),
			await forwarding.request(workspace, 'host-two:devcontainer:first', CancellationToken.None),
			await forwarding.request(workspace, 'host-one:devcontainer:replacement', CancellationToken.None),
		];
		const restored = setup('prompt', [false]);
		decisions.push(await restored.forwarding.request(workspace, 'host-one:devcontainer:first', CancellationToken.None));
		assert.deepStrictEqual({ prompts: prompts.length + restored.prompts.length, decisions }, { prompts: 4, decisions: [true, false, false, false] });
	});

	test('switching off revokes a live grant and switching back to prompt defers new consent until a lookup', async () => {
		const { forwarding, configuration, prompts } = setup('prompt', [true, false]);
		const states: boolean[] = [];
		const off = new DeferredPromise<void>();
		store.add(await forwarding.registerConnection(async enabled => {
			states.push(enabled);
			if (!enabled) { void off.complete(); }
		}));
		await forwarding.request(workspace, containerKey, CancellationToken.None);
		await changeMode(configuration, 'off');
		await off.p;
		const deniedWhileOff = await forwarding.request(workspace, containerKey, CancellationToken.None);
		await changeMode(configuration, 'prompt');
		const promptsBeforeLookup = prompts.length;
		const allowed = await forwarding.request(workspace, containerKey, CancellationToken.None);
		assert.deepStrictEqual({ states, deniedWhileOff, allowed, promptsBeforeLookup, prompts: prompts.length }, {
			states: [true, false, true], deniedWhileOff: false, allowed: false, promptsBeforeLookup: 1, prompts: 2,
		});
	});

	test('concurrent lookups share one pending dialog and cannot be approved before the answer', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const answer = new DeferredPromise<IConfirmationResult>();
		let prompts = 0;
		const forwarding = store.add(new DevContainerGitCredentialForwarding(configuration, new class extends mock<IDialogService>() {
			override confirm(): Promise<IConfirmationResult> { prompts++; return answer.p; }
		}(), new NullLogService()));
		let approved = 0;
		const lookups = [1, 2].map(() => forwarding.request(workspace, containerKey, CancellationToken.None).then(allowed => {
			if (allowed) { approved++; }
			return allowed;
		}));
		const before = { prompts, approved };
		await answer.complete({ confirmed: true });
		const decisions = await Promise.all(lookups);
		assert.deepStrictEqual({ before, prompts, approved, decisions }, {
			before: { prompts: 1, approved: 0 }, prompts: 1, approved: 2, decisions: [true, true],
		});
	});

	test('disconnecting or disabling while consent is pending never retains a late approval', async () => {
		for (const cancel of ['disconnect', 'off'] as const) {
			const configuration = new TestConfigurationService();
			store.add(configuration.onDidChangeConfigurationEmitter);
			const answer = new DeferredPromise<IConfirmationResult>();
			let prompts = 0;
			const forwarding = store.add(new DevContainerGitCredentialForwarding(configuration, new class extends mock<IDialogService>() {
				override confirm(): Promise<IConfirmationResult> {
					prompts++;
					return prompts === 1 ? answer.p : Promise.resolve({ confirmed: false });
				}
			}(), new NullLogService()));
			const tokenSource = store.add(new CancellationTokenSource());
			const request = forwarding.request(workspace, containerKey, tokenSource.token);
			const rejected = assert.rejects(request, /Canceled/);
			if (cancel === 'disconnect') {
				tokenSource.cancel();
			} else {
				await changeMode(configuration, 'off');
			}
			await rejected;
			await answer.complete({ confirmed: true });
			if (cancel === 'off') { await changeMode(configuration, 'prompt'); }
			const allowed = await forwarding.request(workspace, containerKey, CancellationToken.None);
			assert.deepStrictEqual({ cancel, allowed, prompts }, { cancel, allowed: false, prompts: 2 });
		}
	});
});
