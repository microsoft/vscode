/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../../services/lifecycle/common/lifecycle.js';
import { ChatConfiguration } from '../../../../../chat/common/constants.js';
import { SessionsViewId } from '../../../../browser/views/sessionsView.js';
import { AGENTS_VIEW_PROVIDERS_RELEASE_DELAY, AgentsViewProvidersContribution } from '../../browser/agentsViewProviders.contribution.js';
import { IAgentsChatPartService } from '../../../../browser/agentsView/agentsChatPart.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';

suite('AgentsViewProvidersContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function configuration(enabled: boolean, reads: string[]): IConfigurationService {
		return new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				reads.push(String(arg1));
				return super.getValue<T>(arg1, arg2);
			}
		}({ [ChatConfiguration.AgentsViewEnabled]: enabled });
	}

	test('reads only its setting and does nothing else while the setting is off', () => {
		const reads: string[] = [];
		// Any use of the instantiation service fails: with the setting off, the contribution creates and invokes nothing
		disposables.add(new AgentsViewProvidersContribution(configuration(false, reads), upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual(reads, [ChatConfiguration.AgentsViewEnabled]);
	});

	function createContribution(state: { sessionsView: boolean; chatPart: boolean; composer: boolean; composerIdle?: boolean }, events: string[]) {
		const onDidChangeViewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		const onDidChangePartVisibility = disposables.add(new Emitter<{ partId: string; visible: boolean }>());
		// Records the providers registered and released, instead of starting them
		const providersInstantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ..._args: TS): R => {
				events.push(`register ${fn.name}`);
				return upcastPartial<IDisposable>({ dispose: () => { events.push(`release ${fn.name}`); } }) as R;
			},
		});
		const services = new Map<unknown, unknown>([
			[IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: onDidChangeViewVisibility.event, isViewVisible: id => id === SessionsViewId && state.sessionsView })],
			[IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: onDidChangePartVisibility.event, isVisible: part => part === Parts.CHAT_PART && state.chatPart })],
			[ILifecycleService, upcastPartial<ILifecycleService>({ when: () => Promise.resolve() })],
			[IAgentsChatPartService, upcastPartial<IAgentsChatPartService>({
				hasComposer: () => state.composer,
				closeIdleComposers: () => {
					if (state.composer && state.composerIdle) {
						state.composer = false;
						events.push('close idle composer');
					}
				},
			})],
			[IInstantiationService, providersInstantiationService],
		]);
		const instantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R => fn(upcastPartial<ServicesAccessor>({
				get: <T>(id: unknown): T => services.get(id) as T,
			}), ...args),
		});
		const contribution = disposables.add(new AgentsViewProvidersContribution(configuration(true, []), instantiationService));
		return {
			contribution,
			showSessionsView: (visible: boolean) => { state.sessionsView = visible; onDidChangeViewVisibility.fire({ id: SessionsViewId, visible }); },
			showChatPart: (visible: boolean) => { state.chatPart = visible; onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible }); },
			other: () => { onDidChangeViewVisibility.fire({ id: 'other', visible: true }); onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true }); },
		};
	}

	const providers = isWeb ? ['registerCopilotChatSessionsProviders'] : ['registerLocalAgentHostSessionsProvider', 'registerCopilotChatSessionsProviders'];

	test('holds the providers while the Sessions view or the chat part shows, releases them a while after neither shows, and registers them again as either shows', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const state = { sessionsView: false, chatPart: false, composer: false };
		const { showSessionsView, showChatPart, other } = createContribution(state, events);
		await Promise.resolve();
		const step = async (label: string, action: () => void | Promise<void>) => { events.push(`-- ${label}`); await action(); };

		await step('other views and parts', () => other());
		await step('Sessions view shows', () => showSessionsView(true));
		await step('chat part shows', () => showChatPart(true));
		await step('Sessions view hides, the chat part still shows', async () => { showSessionsView(false); await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY * 2); });
		await step('chat part hides, almost the delay', async () => { showChatPart(false); await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY - 1); });
		await step('Sessions view shows again within the delay', () => showSessionsView(true));
		await step('Sessions view hides, the delay passes', async () => { showSessionsView(false); await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY); });
		await step('chat part shows again', () => showChatPart(true));

		assert.deepStrictEqual(events, [
			'-- other views and parts',
			'-- Sessions view shows', ...providers.map(name => `register ${name}`),
			'-- chat part shows',
			'-- Sessions view hides, the chat part still shows',
			'-- chat part hides, almost the delay',
			'-- Sessions view shows again within the delay',
			'-- Sessions view hides, the delay passes', ...providers.map(name => `release ${name}`),
			'-- chat part shows again', ...providers.map(name => `register ${name}`),
		]);
	}));

	test('a hidden chat part closes its new-session composer with nothing typed, so the providers go', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const { showChatPart } = createContribution({ sessionsView: false, chatPart: false, composer: true, composerIdle: true }, events);
		await Promise.resolve();

		showChatPart(true);
		showChatPart(false);
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY);

		assert.deepStrictEqual(events, [...providers.map(name => `register ${name}`), 'close idle composer', ...providers.map(name => `release ${name}`)]);
	}));

	test('holds the providers while the chat part has a new-session composer with input, whose draft is their session', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const state = { sessionsView: false, chatPart: false, composer: true };
		const { showChatPart } = createContribution(state, events);
		await Promise.resolve();

		showChatPart(true);
		showChatPart(false);
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY * 3);
		const whileComposer = [...events];
		state.composer = false;
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY);

		assert.deepStrictEqual({ whileComposer, after: events.slice(whileComposer.length) }, {
			whileComposer: providers.map(name => `register ${name}`),
			after: providers.map(name => `release ${name}`),
		});
	}));

	test('registers the providers as the window restores with the chat part shown', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		createContribution({ sessionsView: false, chatPart: true, composer: false }, events);
		await timeout(0);

		assert.deepStrictEqual(events, providers.map(name => `register ${name}`));
	}));
});
