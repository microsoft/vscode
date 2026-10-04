/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DEV_CONTAINER_SAMPLES_TRYOUT_ID, DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND } from '../../../../../workbench/contrib/chat/common/onboarding/devContainerSamplesTryout.js';
import { IOnboardingTryoutRunContext, IOnboardingTryoutService, OnboardingTryoutAvailability, onboardingTryoutPresentationRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingTryout.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposer, INewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { DevContainerSamplesTryoutContribution, DevContainerSamplesTryoutPresentation } from '../../electron-browser/devContainerSamplesTryout.js';

suite('Dev Container samples tryout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const settings = [RemoteAgentHostsEnabledSettingId, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId];

	function harness(options: {
		readonly values?: Record<string, boolean>;
		readonly confirm?: () => Promise<{ confirmed: boolean }>;
		readonly update?: (key: string) => Promise<void>;
		readonly open?: () => Promise<void>;
		readonly policyDisabled?: string;
	} = {}) {
		const writes: { key: string; value: unknown; target: ConfigurationTarget | undefined }[] = [];
		const confirmations: IConfirmation[] = [];
		let opened = 0;
		let picked = 0;
		let availability: OnboardingTryoutAvailability = { kind: 'ready' };
		const sessionResource = observableValue<URI | undefined>('session', undefined);
		const composer: INewSessionComposer = {
			sessionResource,
			hasInput: true,
			animatePrompt: async () => assert.fail('Must not edit prompt text'),
			showPromptOptions: () => assert.fail('Must not change prompt options'),
			showDevContainerSamples: () => { picked++; return true; },
		};
		const activeComposer = observableValue<INewSessionComposer | undefined>('composer', composer);
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown, target?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				writes.push({ key, value, target: typeof target === 'number' ? target : undefined });
				await options.update?.(key);
				await this.setUserConfiguration(key, value);
			}
			override inspect<T>(key: string) {
				return { ...super.inspect<T>(key), ...(key === options.policyDisabled ? { policyValue: false as T } : {}) };
			}
		}(options.values);
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				return options.confirm?.() ?? { confirmed: true };
			}
		}());
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openNewSession() {
				opened++;
				await options.open?.();
				return { session: undefined, trustDeclined: false };
			}
		}());
		instantiation.stub(INewSessionComposerService, { activeComposer });
		instantiation.stub(IOnboardingTryoutService, { getAvailability: () => availability });
		const presentation = store.add(instantiation.createInstance(DevContainerSamplesTryoutPresentation));
		const context: IOnboardingTryoutRunContext = {
			id: DEV_CONTAINER_SAMPLES_TRYOUT_ID,
			token: CancellationToken.None,
			store: store.add(new DisposableStore()),
		};
		return {
			presentation, context, configuration, writes, confirmations, activeComposer, sessionResource,
			get opened() { return opened; },
			get picked() { return picked; },
			setAvailability(value: OnboardingTryoutAvailability) { availability = value; },
		};
	}

	async function prepare(h: ReturnType<typeof harness>, token = CancellationToken.None) {
		const result = await h.presentation.prepare(undefined, { ...h.context, token });
		assert.strictEqual(result.kind, 'ready');
		if (result.kind !== 'ready') {
			assert.fail('Expected ready preparation');
		}
		return result;
	}

	test('registers lazily and accepts no release-note payload', async () => {
		let constructions = 0;
		const contribution = store.add(new DevContainerSamplesTryoutContribution(new class extends mock<TestInstantiationService>() {
			override createInstance<T>(): T { constructions++; throw new Error('Must stay lazy'); }
		}()));
		const presentation = onboardingTryoutPresentationRegistry.get(DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND)!;
		const scenario = { id: DEV_CONTAINER_SAMPLES_TRYOUT_ID, trigger: { kind: 'command' as const, commandId: 'test' }, presentation: { kind: DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND, payload: undefined } };
		assert.throws(() => presentation.getAvailability({ ...scenario, presentation: { ...scenario.presentation, payload: { setting: 'other.setting' } } }), /invalid presentation/);
		const availability = presentation.getAvailability(scenario);
		contribution.dispose();
		assert.deepStrictEqual({ constructions, availability, registered: onboardingTryoutPresentationRegistry.get(DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND) }, { constructions: 0, availability: { kind: 'ready' }, registered: undefined });
	});

	test('availability and preparation do not change settings or open the composer', async () => {
		const h = harness();
		h.presentation.getAvailability();
		await prepare(h);
		assert.deepStrictEqual({ writes: h.writes, confirmations: h.confirmations, opened: h.opened, picked: h.picked }, { writes: [], confirmations: [], opened: 0, picked: 0 });
	});

	test('confirms once, enables only disabled settings, and opens the active composer once', async () => {
		const h = harness({ values: { [DevContainerAgentHostEnabledSettingId]: true } });
		const preparation = await prepare(h);
		const first = await preparation.run();
		const repeated = await preparation.run();
		assert.deepStrictEqual({
			first, repeated, confirmations: h.confirmations.length,
			button: h.confirmations[0].primaryButton,
			writes: h.writes, opened: h.opened, picked: h.picked,
		}, {
			first: { kind: 'opened' }, repeated: { kind: 'cancelled' }, confirmations: 1,
			button: 'Enable and Continue',
			writes: [RemoteAgentHostsEnabledSettingId, DevContainerSamplesEnabledSettingId].map(key => ({ key, value: true, target: ConfigurationTarget.USER })),
			opened: 1, picked: 1,
		});
	});

	test('already-enabled settings are not rewritten and need no confirmation', async () => {
		const h = harness({ values: Object.fromEntries(settings.map(key => [key, true])) });
		await (await prepare(h)).run();
		assert.deepStrictEqual({ writes: h.writes, confirmations: h.confirmations.length, opened: h.opened, picked: h.picked }, { writes: [], confirmations: 0, opened: 1, picked: 1 });
	});

	test('declined setup leaves settings and drafts untouched', async () => {
		const h = harness({ confirm: async () => ({ confirmed: false }) });
		const result = await (await prepare(h)).run();
		assert.deepStrictEqual({ result, writes: h.writes, opened: h.opened, picked: h.picked }, { result: { kind: 'cancelled' }, writes: [], opened: 0, picked: 0 });
	});

	for (const action of ['cancel', 'hide', 'dispose'] as const) {
		test(`${action} during confirmation prevents late settings and picker changes`, async () => {
			const confirmation = new DeferredPromise<{ confirmed: boolean }>();
			const requested = new DeferredPromise<void>();
			const cancellation = store.add(new CancellationTokenSource());
			const h = harness({ confirm: () => { requested.complete(); return confirmation.p; } });
			const run = (await prepare(h, cancellation.token)).run();
			await requested.p;
			if (action === 'cancel') { cancellation.cancel(); }
			else if (action === 'dispose') { h.context.store.dispose(); }
			else { h.setAvailability({ kind: 'hidden' }); }
			confirmation.complete({ confirmed: true });
			const result = await run;
			assert.deepStrictEqual({ result: result.kind, writes: h.writes, opened: h.opened, picked: h.picked }, { result: action === 'hide' ? 'unavailable' : 'cancelled', writes: [], opened: 0, picked: 0 });
		});
	}

	test('cancellation during settings update suppresses subsequent writes and navigation', async () => {
		const update = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const cancellation = store.add(new CancellationTokenSource());
		const h = harness({ update: () => { started.complete(); return update.p; } });
		const run = (await prepare(h, cancellation.token)).run();
		await started.p;
		cancellation.cancel();
		update.complete();
		const result = await run;
		assert.deepStrictEqual({ result, writes: h.writes.map(write => write.key), opened: h.opened }, { result: { kind: 'cancelled' }, writes: [RemoteAgentHostsEnabledSettingId], opened: 0 });
	});

	test('policy-disabled and AI-disabled settings cannot be enabled', async () => {
		for (const options of [{ policyDisabled: DevContainerSamplesEnabledSettingId }, { values: { 'chat.disableAIFeatures': true } }]) {
			const h = harness(options);
			const result = await (await prepare(h)).run();
			assert.deepStrictEqual({ kind: result.kind, writes: h.writes, confirmations: h.confirmations.length, opened: h.opened }, { kind: 'unavailable', writes: [], confirmations: 0, opened: 0 });
		}
	});

	test('setting write errors surface instead of opening a misleading picker', async () => {
		const h = harness({ update: async () => { throw new Error('Settings are read-only'); } });
		await assert.rejects((await prepare(h)).run(), /Settings are read-only/);
		assert.strictEqual(h.opened, 0);
	});

	test('cancellation during navigation never opens the picker', async () => {
		const opened = new DeferredPromise<void>();
		const ready = new DeferredPromise<void>();
		const cancellation = store.add(new CancellationTokenSource());
		const h = harness({ values: Object.fromEntries(settings.map(key => [key, true])), open: () => { opened.complete(); return ready.p; } });
		const run = (await prepare(h, cancellation.token)).run();
		await opened.p;
		cancellation.cancel();
		ready.complete();
		const result = await run;
		assert.deepStrictEqual({ result, picked: h.picked }, { result: { kind: 'cancelled' }, picked: 0 });
	});

	test('does not target another composer when navigation exposes a different session', async () => {
		const h = harness({ values: Object.fromEntries(settings.map(key => [key, true])) });
		h.sessionResource.set(URI.parse('test:/another-session'), undefined);
		const result = await (await prepare(h)).run();
		assert.deepStrictEqual({ kind: result.kind, picked: h.picked }, { kind: 'unavailable', picked: 0 });
	});
});
