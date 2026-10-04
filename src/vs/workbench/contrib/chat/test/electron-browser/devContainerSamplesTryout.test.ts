/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { IChannel, ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, DevContainerAgentHostEnabledSettingId, DevContainerDockerStatus, DevContainerSamplesEnabledSettingId, IDevContainerAgentHostDiagnostics } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { IOnboardingTryoutRunContext, IOnboardingTryoutService, OnboardingTryoutAvailability } from '../../../onboarding/common/onboardingTryout.js';
import { DEV_CONTAINER_SAMPLES_TRYOUT_ID } from '../../common/onboarding/devContainerSamplesTryout.js';
import { DevContainerSamplesTryoutPrerequisites } from '../../electron-browser/devContainerSamplesTryout.contribution.js';

suite('Dev Container samples prerequisites', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const settings = [RemoteAgentHostsEnabledSettingId, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId];

	function harness(options: {
		values?: Record<string, boolean | string>;
		dockerStatus?: () => Promise<DevContainerDockerStatus>;
		confirm?: () => Promise<{ confirmed: boolean }>;
		update?: () => Promise<void>;
	} = {}) {
		const messages: string[] = [];
		const errors: string[] = [];
		const confirmations: IConfirmation[] = [];
		const writes: { key: string; value: unknown; target: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides | undefined }[] = [];
		let availability: OnboardingTryoutAvailability = { kind: 'ready' };
		let policyDisabled = false;
		let dockerChecks = 0;
		const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown, target?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides) {
				writes.push({ key, value, target });
				await options.update?.();
				await this.setUserConfiguration(key, value);
			}
			override inspect<T>(key: string) {
				return { ...super.inspect<T>(key), ...(policyDisabled ? { policyValue: false as T } : {}) };
			}
		}(options.values);
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IOnboardingTryoutService, { getAvailability: () => availability });
		instantiation.stub(IAgentHostEnablementService, { managedSandboxEnforced });
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(IDialogService, new class extends mock<IDialogService>() {
			override async info(message: string) { messages.push(message); }
			override async error(message: string, detail?: string) { errors.push(`${message} ${detail}`); }
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				return options.confirm?.() ?? { confirmed: true };
			}
		}());
		const diagnostics: IDevContainerAgentHostDiagnostics = {
			getDockerStatus: async () => { dockerChecks++; return options.dockerStatus?.() ?? 'running'; },
		};
		instantiation.stub(ISharedProcessService, new class extends mock<ISharedProcessService>() {
			override getChannel(name: string): IChannel {
				assert.strictEqual(name, DEV_CONTAINER_AGENT_HOST_CHANNEL);
				const channel = ProxyChannel.fromService(diagnostics, store.add(new DisposableStore()));
				return { listen: (event, arg) => channel.listen(undefined, event, arg), call: (command, arg) => channel.call(undefined, command, arg) };
			}
		}());
		const prerequisites = store.add(instantiation.createInstance(DevContainerSamplesTryoutPrerequisites));
		const context: IOnboardingTryoutRunContext = { id: DEV_CONTAINER_SAMPLES_TRYOUT_ID, token: CancellationToken.None, store: store.add(new DisposableStore()) };
		return {
			prerequisites, context, configuration, messages, errors, confirmations, writes,
			get dockerChecks() { return dockerChecks; },
			hide() { availability = { kind: 'hidden' }; },
			disablePolicy() { policyDisabled = true; },
			requireSandbox() { managedSandboxEnforced.set(true, undefined); },
		};
	}

	for (const status of ['notInstalled', 'notRunning'] as const) {
		test(`${status} shows only an informational modal and stops`, async () => {
			const h = harness({ dockerStatus: async () => status });
			assert.deepStrictEqual({
				result: await h.prerequisites.check(h.context), messages: h.messages, confirmations: h.confirmations, writes: h.writes,
			}, {
				result: false,
				messages: [status === 'notInstalled'
					? 'Docker was not found. Dev Container samples require Docker to be installed and available on PATH.'
					: 'Docker is not running or is not accessible. Dev Container samples require a running Docker daemon.'],
				confirmations: [], writes: [],
			});
		});
	}

	test('confirms once and enables only disabled settings', async () => {
		const h = harness({ values: { [DevContainerAgentHostEnabledSettingId]: true } });
		assert.deepStrictEqual({
			result: await h.prerequisites.check(h.context), writes: h.writes, confirmations: h.confirmations.map(value => value.primaryButton),
		}, {
			result: true, confirmations: ['Enable and Continue'],
			writes: [RemoteAgentHostsEnabledSettingId, DevContainerSamplesEnabledSettingId].map(key => ({ key, value: true, target: ConfigurationTarget.USER })),
		});
	});

	test('enabled settings need no dialog or writes', async () => {
		const h = harness({ values: Object.fromEntries(settings.map(key => [key, true])) });
		assert.deepStrictEqual({ result: await h.prerequisites.check(h.context), confirmations: h.confirmations, writes: h.writes }, { result: true, confirmations: [], writes: [] });
	});

	test('declined settings confirmation stops without writes', async () => {
		const h = harness({ confirm: async () => ({ confirmed: false }) });
		assert.deepStrictEqual({ result: await h.prerequisites.check(h.context), writes: h.writes }, { result: false, writes: [] });
	});

	for (const sandbox of ['on', true, 'off', false] as const) {
		for (const settingsEnabled of [true, false]) {
			test(`sandbox ${sandbox}, settings enabled ${settingsEnabled}: warns without changing sandbox settings`, async () => {
				const h = harness({ values: {
					...Object.fromEntries(settings.map(key => [key, settingsEnabled])),
					[AgentSandboxSettingId.AgentSandboxEnabled]: sandbox,
				} });
				const warning = 'Sandboxing is currently not supported with Dev Container samples. Sandboxing will be disabled for the sample session only. Your sandboxing setting will remain unchanged.';
				const enabled = sandbox === 'on' || sandbox === true;
				const result = await h.prerequisites.check(h.context);
				assert.deepStrictEqual({
					result,
					confirmationCount: h.confirmations.length,
					warning: h.confirmations.some(confirmation => typeof confirmation.detail === 'string' && confirmation.detail.includes(warning)),
					button: h.confirmations[0]?.primaryButton,
					writtenKeys: h.writes.map(write => write.key),
					sandbox: h.configuration.getValue(AgentSandboxSettingId.AgentSandboxEnabled),
				}, {
					result: true,
					confirmationCount: enabled || !settingsEnabled ? 1 : 0,
					warning: enabled,
					button: !settingsEnabled ? 'Enable and Continue' : enabled ? 'Continue' : undefined,
					writtenKeys: settingsEnabled ? [] : settings,
					sandbox,
				});
			});
		}
	}

	test('cancelling the sandbox-only warning leaves all settings unchanged', async () => {
		const h = harness({
			values: { ...Object.fromEntries(settings.map(key => [key, true])), [AgentSandboxSettingId.AgentSandboxEnabled]: 'on' },
			confirm: async () => ({ confirmed: false }),
		});
		assert.deepStrictEqual({
			result: await h.prerequisites.check(h.context), writes: h.writes, sandbox: h.configuration.getValue(AgentSandboxSettingId.AgentSandboxEnabled),
		}, { result: false, writes: [], sandbox: 'on' });
	});

	for (const phase of ['docker', 'confirmation', 'write'] as const) {
		for (const change of ['cancel', 'dispose', 'hide', 'policy', 'sandboxPolicy'] as const) {
			test(`${change} during ${phase} stops subsequent effects`, async () => {
				const started = new DeferredPromise<void>();
				const release = new DeferredPromise<void>();
				const wait = async () => { started.complete(); await release.p; };
				const h = harness({
					dockerStatus: async () => { if (phase === 'docker') { await wait(); } return 'running'; },
					confirm: async () => { if (phase === 'confirmation') { await wait(); } return { confirmed: true }; },
					update: async () => { if (phase === 'write') { await wait(); } },
				});
				const cancellation = store.add(new CancellationTokenSource());
				const run = h.prerequisites.check({ ...h.context, token: cancellation.token });
				await started.p;
				if (change === 'cancel') { cancellation.cancel(); }
				else if (change === 'dispose') { h.context.store.dispose(); }
				else if (change === 'hide') { h.hide(); }
				else if (change === 'policy') { h.disablePolicy(); }
				else { h.requireSandbox(); }
				release.complete();
				assert.deepStrictEqual({ result: await run, writes: h.writes.length, messages: h.messages }, { result: false, writes: phase === 'write' ? 1 : 0, messages: [] });
			});
		}
	}

	test('policy denial informs without checking Docker or changing settings', async () => {
		const h = harness();
		h.disablePolicy();
		assert.deepStrictEqual({ result: await h.prerequisites.check(h.context), messages: h.messages, dockerChecks: h.dockerChecks, writes: h.writes }, {
			result: false, messages: ['Your organization has disabled a setting required by Dev Container samples.'], dockerChecks: 0, writes: [],
		});
	});

	test('mandatory managed sandboxing stops the tryout without offering a bypass', async () => {
		const h = harness();
		h.requireSandbox();
		assert.deepStrictEqual({
			result: await h.prerequisites.check(h.context), messages: h.messages, confirmations: h.confirmations, dockerChecks: h.dockerChecks, writes: h.writes,
		}, {
			result: false, messages: ['Dev Container samples currently do not support sandboxing, which is required by your organization.'],
			confirmations: [], dockerChecks: 0, writes: [],
		});
	});

	for (const phase of ['docker', 'write'] as const) {
		test(`${phase} errors are shown in a modal and stop the attempt`, async () => {
			const failure = async (): Promise<never> => { throw new Error('Operation failed'); };
			const h = harness(phase === 'docker' ? { dockerStatus: failure } : { update: failure });
			assert.deepStrictEqual({ result: await h.prerequisites.check(h.context), errors: h.errors }, { result: false, errors: ['Unable to prepare Dev Container samples. Operation failed'] });
		});
	}
});
