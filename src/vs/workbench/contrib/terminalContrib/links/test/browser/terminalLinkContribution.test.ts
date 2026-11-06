/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IDetachedTerminalInstance, ITerminalExternalLinkProvider, ITerminalInstance, IXtermTerminal } from '../../../../terminal/browser/terminal.js';
import { IDetachedCompatibleTerminalContributionContext, ITerminalContributionContext } from '../../../../terminal/browser/terminalExtensions.js';
import { TerminalWidgetManager } from '../../../../terminal/browser/widgets/widgetManager.js';
import { ITerminalProcessInfo, ITerminalProcessManager } from '../../../../terminal/common/terminal.js';
import { ITerminalLinkProviderService } from '../../browser/links.js';
import { TerminalLinkContribution } from '../../browser/terminalLinkContribution.js';
import { TerminalLinkManager } from '../../browser/terminalLinkManager.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';

function listenerCount<T>(emitter: Emitter<T>): number {
	return (emitter as unknown as { _size: number })._size ?? 0;
}

suite('TerminalLinkContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let onDidAddLinkProvider: Emitter<ITerminalExternalLinkProvider>;
	let onDidRemoveLinkProvider: Emitter<ITerminalExternalLinkProvider>;
	let xterm: IXtermTerminal & { raw: RawXtermTerminal };

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		onDidAddLinkProvider = store.add(new Emitter<ITerminalExternalLinkProvider>());
		onDidRemoveLinkProvider = store.add(new Emitter<ITerminalExternalLinkProvider>());
		instantiationService.stub(ITerminalLinkProviderService, new class extends mock<ITerminalLinkProviderService>() {
			override readonly linkProviders = new Set<ITerminalExternalLinkProvider>();
			override readonly onDidAddLinkProvider = onDidAddLinkProvider.event;
			override readonly onDidRemoveLinkProvider = onDidRemoveLinkProvider.event;
		}());
		instantiationService.stubInstance(TerminalLinkResolver, {});

		const linkManagerStore = store.add(new DisposableStore());
		instantiationService.stubInstance(TerminalLinkManager, {
			add: <T extends IDisposable>(disposable: T) => linkManagerStore.add(disposable),
			setWidgetManager: () => { },
			dispose: () => linkManagerStore.dispose(),
		});
		xterm = Object.assign(Object.create(null) as IXtermTerminal & { raw: RawXtermTerminal }, {
			raw: Object.create(null) as RawXtermTerminal,
		});
	});

	function createContribution(detached: boolean) {
		const capabilities = store.add(new TerminalCapabilityStore());
		const widgetManager = Object.create(TerminalWidgetManager.prototype) as TerminalWidgetManager;
		const context: IDetachedCompatibleTerminalContributionContext | ITerminalContributionContext = detached
			? {
				instance: Object.assign(Object.create(null) as IDetachedTerminalInstance, { capabilities }),
				processManager: Object.create(null) as ITerminalProcessInfo,
				widgetManager,
			}
			: {
				instance: Object.assign(Object.create(null) as ITerminalInstance, { capabilities, instanceId: 1 }),
				processManager: Object.create(null) as ITerminalProcessManager,
				widgetManager,
			};
		const contribution = store.add(instantiationService.createInstance(TerminalLinkContribution, context));
		contribution.xtermReady?.(xterm);
		return contribution;
	}

	test('does not register external link provider listeners for detached terminals', () => {
		for (let index = 0; index < 50; index++) {
			createContribution(true);
		}

		assert.deepStrictEqual({
			addedListeners: listenerCount(onDidAddLinkProvider),
			removedListeners: listenerCount(onDidRemoveLinkProvider),
		}, {
			addedListeners: 0,
			removedListeners: 0,
		});
	});

	test('registers and disposes external link provider listeners for regular terminals', () => {
		const contribution = createContribution(false);
		const countsAfterRegistration = {
			addedListeners: listenerCount(onDidAddLinkProvider),
			removedListeners: listenerCount(onDidRemoveLinkProvider),
		};

		contribution.dispose();

		assert.deepStrictEqual({
			countsAfterRegistration,
			countsAfterDispose: {
				addedListeners: listenerCount(onDidAddLinkProvider),
				removedListeners: listenerCount(onDidRemoveLinkProvider),
			},
		}, {
			countsAfterRegistration: {
				addedListeners: 1,
				removedListeners: 1,
			},
			countsAfterDispose: {
				addedListeners: 0,
				removedListeners: 0,
			},
		});
	});
});
