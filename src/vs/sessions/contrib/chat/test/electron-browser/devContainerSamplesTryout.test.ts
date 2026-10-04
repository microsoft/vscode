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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DEV_CONTAINER_SAMPLES_TRYOUT_ID, DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND } from '../../../../../workbench/contrib/chat/common/onboarding/devContainerSamplesTryout.js';
import { IOnboardingTryoutRunContext, IOnboardingTryoutService, OnboardingTryoutAvailability, onboardingTryoutPresentationRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingTryout.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposer, INewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { DevContainerSamplesTryoutContribution, DevContainerSamplesTryoutPresentation } from '../../electron-browser/devContainerSamplesTryout.js';

suite('Dev Container samples destination', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function harness(open?: () => Promise<void>) {
		let opened = 0;
		let picked = 0;
		let availability: OnboardingTryoutAvailability = { kind: 'ready' };
		const configuration = new TestConfigurationService(Object.fromEntries([RemoteAgentHostsEnabledSettingId, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId].map(key => [key, true])));
		store.add(configuration.onDidChangeConfigurationEmitter);
		const sessionResource = observableValue<URI | undefined>('session', undefined);
		const composer: INewSessionComposer = {
			sessionResource, hasInput: true,
			animatePrompt: async () => assert.fail('Must not edit the draft'),
			showPromptOptions: () => assert.fail('Must not change prompt options'),
			showDevContainerSamples: () => { picked++; return true; },
		};
		const activeComposer = observableValue<INewSessionComposer | undefined>('composer', composer);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(INewSessionComposerService, { activeComposer });
		instantiation.stub(IOnboardingTryoutService, { getAvailability: () => availability });
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override async openNewSession() { opened++; await open?.(); return { session: undefined, trustDeclined: false }; }
		}());
		const presentation = store.add(instantiation.createInstance(DevContainerSamplesTryoutPresentation));
		const context: IOnboardingTryoutRunContext = { id: DEV_CONTAINER_SAMPLES_TRYOUT_ID, token: CancellationToken.None, store: store.add(new DisposableStore()) };
		return {
			presentation, context, configuration, sessionResource,
			get opened() { return opened; }, get picked() { return picked; },
			setAvailability(value: OnboardingTryoutAvailability) { availability = value; },
		};
	}

	async function prepare(h: ReturnType<typeof harness>, token = CancellationToken.None) {
		const prepared = await h.presentation.prepare(undefined, { ...h.context, token });
		if (prepared.kind !== 'ready') { assert.fail('Expected ready'); }
		return prepared;
	}

	test('registers lazily and rejects release-note payloads', () => {
		let constructions = 0;
		store.add(new DevContainerSamplesTryoutContribution(new class extends mock<TestInstantiationService>() {
			override createInstance<T>(): T { constructions++; throw new Error('Must stay lazy'); }
		}()));
		const presentation = onboardingTryoutPresentationRegistry.get(DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND)!;
		const scenario = { id: DEV_CONTAINER_SAMPLES_TRYOUT_ID, trigger: { kind: 'command' as const, commandId: 'test' }, presentation: { kind: DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND, payload: undefined } };
		assert.throws(() => presentation.getAvailability({ ...scenario, presentation: { ...scenario.presentation, payload: {} } }), /invalid presentation/);
		assert.deepStrictEqual({ availability: presentation.getAvailability(scenario), constructions }, { availability: { kind: 'ready' }, constructions: 0 });
	});

	test('prepares without navigation, then opens the preserved composer', async () => {
		const h = harness();
		const prepared = await prepare(h);
		const before = [h.opened, h.picked];
		const result = await prepared.run();
		assert.deepStrictEqual({ before, result, after: [h.opened, h.picked] }, { before: [0, 0], result: { kind: 'opened' }, after: [1, 1] });
	});

	for (const state of ['cancel', 'dispose', 'disabled', 'hidden', 'wrongComposer'] as const) {
		test(`${state} during navigation cannot open the picker`, async () => {
			const started = new DeferredPromise<void>();
			const ready = new DeferredPromise<void>();
			const cancellation = store.add(new CancellationTokenSource());
			const h = harness(() => { started.complete(); return ready.p; });
			const run = (await prepare(h, cancellation.token)).run();
			await started.p;
			if (state === 'cancel') { cancellation.cancel(); }
			else if (state === 'dispose') { h.context.store.dispose(); }
			else if (state === 'disabled') { await h.configuration.setUserConfiguration(DevContainerSamplesEnabledSettingId, false); }
			else if (state === 'hidden') { h.setAvailability({ kind: 'hidden' }); }
			else { h.sessionResource.set(URI.parse('test:/another-session'), undefined); }
			ready.complete();
			const result = await run;
			assert.deepStrictEqual({ kind: result.kind, picked: h.picked }, { kind: state === 'cancel' || state === 'dispose' ? 'cancelled' : 'unavailable', picked: 0 });
		});
	}

	test('rechecks settings before navigation after handoff', async () => {
		const h = harness();
		await h.configuration.setUserConfiguration(DevContainerSamplesEnabledSettingId, false);
		const result = await (await prepare(h)).run();
		assert.deepStrictEqual({ kind: result.kind, opened: h.opened, picked: h.picked }, { kind: 'unavailable', opened: 0, picked: 0 });
	});
});
