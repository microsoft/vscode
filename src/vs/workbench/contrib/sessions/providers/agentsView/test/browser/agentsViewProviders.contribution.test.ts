/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { AGENTS_VIEW_PROVIDERS_RELEASE_DELAY, AgentsViewProvidersService } from '../../browser/agentsViewProviders.contribution.js';
import { IEditorWindowComposerHolder, IEditorWindowSessionsPresenterService } from '../../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';

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
		const holder = upcastPartial<IEditorWindowComposerHolder>({
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
		return disposables.add(new AgentsViewProvidersService(instantiationService, upcastPartial<IEditorWindowSessionsPresenterService>({ hasComposer: () => holder.hasComposer(), closeIdleComposers: () => holder.closeIdleComposers() })));
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
