/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
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
import { AGENTS_VIEW_PROVIDERS_RELEASE_DELAY, AgentsViewProvidersContribution, AgentsViewProvidersService } from '../../browser/agentsViewProviders.contribution.js';
import { IAgentsChatPartService } from '../../../../browser/agentsView/agentsChatPart.js';
import { IAgentsViewProvidersService } from '../../../../browser/agentsView/agentsViewProviders.js';
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
		}({ [ChatConfiguration.ChatViewSessionsListEnabled]: enabled });
	}

	test('reads only its setting and does nothing else while the setting is off', () => {
		const reads: string[] = [];
		// Any use of the instantiation service fails: with the setting off, the contribution creates and invokes nothing
		disposables.add(new AgentsViewProvidersContribution(configuration(false, reads), upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual(reads, [ChatConfiguration.ChatViewSessionsListEnabled]);
	});

	test('holds the providers while the Sessions view or the chat part shows, as the window restores too', async () => {
		const events: string[] = [];
		const state = { sessionsView: false, chatPart: true };
		const onDidChangeViewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		const onDidChangePartVisibility = disposables.add(new Emitter<{ partId: string; visible: boolean }>());
		const services = new Map<unknown, unknown>([
			[IViewsService, upcastPartial<IViewsService>({ onDidChangeViewVisibility: onDidChangeViewVisibility.event, isViewVisible: id => id === SessionsViewId && state.sessionsView })],
			[IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: onDidChangePartVisibility.event, isVisible: part => part === Parts.CHAT_PART && state.chatPart })],
			[ILifecycleService, upcastPartial<ILifecycleService>({ when: () => Promise.resolve() })],
			[IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => { events.push('acquire'); return toDisposable(() => events.push('release')); } })],
		]);
		const instantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R => fn(upcastPartial<ServicesAccessor>({ get: <T>(id: unknown): T => services.get(id) as T }), ...args),
		});
		const contribution = disposables.add(new AgentsViewProvidersContribution(configuration(true, []), instantiationService));
		const step = (label: string, action: () => void) => { events.push(`-- ${label}`); action(); };

		// The window restores with the chat part shown
		await Promise.resolve();
		step('Sessions view shows', () => { state.sessionsView = true; onDidChangeViewVisibility.fire({ id: SessionsViewId, visible: true }); });
		step('chat part hides', () => { state.chatPart = false; onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible: false }); });
		step('other views and parts', () => { onDidChangeViewVisibility.fire({ id: 'other', visible: true }); onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true }); });
		step('Sessions view hides', () => { state.sessionsView = false; onDidChangeViewVisibility.fire({ id: SessionsViewId, visible: false }); });
		step('chat part shows', () => { state.chatPart = true; onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible: true }); });
		contribution.dispose();

		assert.deepStrictEqual(events, [
			'acquire',
			'-- Sessions view shows',
			'-- chat part hides',
			'-- other views and parts',
			'-- Sessions view hides', 'release',
			'-- chat part shows', 'acquire',
			'release',
		]);
	});
});

suite('AgentsViewProvidersService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	// The composer controls come and go with the providers whose sessions they act on
	const providers = isWeb ? ['registerAgentsViewComposerControls', 'registerCopilotChatSessionsProviders'] : ['registerAgentsViewComposerControls', 'registerLocalAgentHostSessionsProvider', 'registerCopilotChatSessionsProviders'];

	function createService(composer: { open: boolean; idle: boolean }, events: string[]) {
		// Records the providers registered and released, instead of starting them
		const providersInstantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ..._args: TS): R => {
				events.push(`register ${fn.name}`);
				return upcastPartial<IDisposable>({ dispose: () => { events.push(`release ${fn.name}`); } }) as R;
			},
		});
		const instantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R => fn(upcastPartial<ServicesAccessor>({ get: <T>(): T => providersInstantiationService as T }), ...args),
		});
		const chatPart = upcastPartial<IAgentsChatPartService>({
			hasComposer: () => composer.open,
			// Closing an editor is asynchronous, as its group confirms it first
			closeIdleComposers: async () => {
				if (composer.open && composer.idle) {
					await timeout(10);
					composer.open = false;
					events.push('close idle composer');
				}
			},
		});
		return disposables.add(new AgentsViewProvidersService(instantiationService, chatPart));
	}

	test('registers the providers while held, and releases them a while after nothing holds them', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const service = createService({ open: false, idle: false }, events);
		const step = async (label: string, action: () => void | Promise<void>) => { events.push(`-- ${label}`); await action(); };

		let first: IDisposable | undefined;
		let second: IDisposable | undefined;
		await step('held twice', () => { first = service.acquire(); second = service.acquire(); });
		await step('one hold ends, the delay passes', async () => { first!.dispose(); await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY * 2); });
		await step('the other ends, almost the delay', async () => { second!.dispose(); await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY - 1); });
		await step('held again within the delay, then not', async () => { service.acquire().dispose(); await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY - 1); });
		await step('the delay passes', () => timeout(1));
		await step('held again', () => { first = service.acquire(); });
		first!.dispose();

		assert.deepStrictEqual(events, [
			'-- held twice', ...providers.map(name => `register ${name}`),
			'-- one hold ends, the delay passes',
			'-- the other ends, almost the delay',
			'-- held again within the delay, then not',
			'-- the delay passes', ...providers.map(name => `release ${name}`),
			'-- held again', ...providers.map(name => `register ${name}`),
		]);
	}));

	test('closes a new-session composer with nothing typed as the delay passes, and releases the providers then', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const service = createService({ open: true, idle: true }, events);

		service.acquire().dispose();
		// Released as the composer closes, not a delay later
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY + 20);

		assert.deepStrictEqual(events, [...providers.map(name => `register ${name}`), 'close idle composer', ...providers.map(name => `release ${name}`)]);
	}));

	test('held again while it closes an idle composer, it keeps the providers', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const service = createService({ open: true, idle: true }, events);

		service.acquire().dispose();
		// The delay passes and the composer starts closing, which takes a while
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY + 1);
		const hold = service.acquire();
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY);
		const whileHeld = [...events];
		hold.dispose();

		assert.deepStrictEqual(whileHeld, [...providers.map(name => `register ${name}`), 'close idle composer']);
	}));

	test('a new-session composer with input holds the providers until it is gone, as its draft is their session', () => runWithFakedTimers({}, async () => {
		const events: string[] = [];
		const composer = { open: true, idle: false };
		const service = createService(composer, events);

		service.acquire().dispose();
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY * 3);
		const whileComposer = [...events];
		composer.open = false;
		await timeout(AGENTS_VIEW_PROVIDERS_RELEASE_DELAY + 10);

		assert.deepStrictEqual({ whileComposer, after: events.slice(whileComposer.length) }, {
			whileComposer: providers.map(name => `register ${name}`),
			after: providers.map(name => `release ${name}`),
		});
	}));
});
