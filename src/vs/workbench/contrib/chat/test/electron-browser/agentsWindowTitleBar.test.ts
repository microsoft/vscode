/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { IManagedHover, IManagedHoverContent, isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, ChatConfiguration } from '../../common/constants.js';
import { OpenWorkspaceInAgentsContribution } from '../../electron-browser/agentSessions/agentSessionsActions.js';

suite('Agents Window titlebar copy experiment', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const treatmentName = 'chatOpenInAgentsTitleBarLabel';
	const expansionTreatmentName = 'chatOpenInAgentsTitleBarExpandOnHover';
	const richHoverTreatmentName = `config.${ChatConfiguration.TitleBarOpenInAgentsWindowRichHover}`;
	const cardTitle = 'All your agents, across all your projects, in one window';
	const manyWindowsToOneCard = { title: cardTitle, graphic: 'many-windows-to-one' };
	const windowComparisonCard = { title: cardTitle, graphic: 'window-comparison' };

	function createHarness(sessionCount?: number, richHover?: string) {
		const instantiation = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		if (sessionCount !== undefined) {
			storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, sessionCount, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		const refetched = disposables.add(new Emitter<void>());
		const requests: DeferredPromise<string | number | boolean | undefined>[] = [];
		const expansionRequests: DeferredPromise<string | number | boolean | undefined>[] = [];
		const queriedTreatments: string[] = [];
		const assignment = new class extends NullWorkbenchAssignmentService {
			override readonly onDidRefetchAssignments = refetched.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				const request = new DeferredPromise<string | number | boolean | undefined>();
				if (name === expansionTreatmentName) {
					expansionRequests.push(request);
				} else {
					queriedTreatments.push(name);
					requests.push(request);
				}
				return await request.p as T | undefined;
			}
		}();
		const telemetry = new TestExperimentTriggerTelemetryService();
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}();
		let factory: IActionViewItemFactory | undefined;
		let hoverContent: IManagedHoverContent;
		let hoverHides = 0;
		const hover = upcastPartial<IManagedHover>({
			dispose: () => { },
			update: content => { hoverContent = content; },
			hide: () => { hoverHides++; },
		});
		const configuration = new TestConfigurationService(richHover === undefined ? {} : { [ChatConfiguration.TitleBarOpenInAgentsWindowRichHover]: richHover });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiation.stub(IProductService, upcastPartial<IProductService>({}));
		instantiation.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({
			register: (_menu, _command, provider) => {
				factory = provider;
				return Disposable.None;
			},
		}));
		instantiation.stub(IWorkbenchAssignmentService, assignment);
		instantiation.stub(ITelemetryService, telemetry);
		instantiation.stub(ILogService, log);
		instantiation.stub(IHoverService, upcastPartial<IHoverService>({ setupManagedHover: () => hover }));
		instantiation.stub(IKeybindingService, upcastPartial<IKeybindingService>({ appendKeybinding: label => `${label} (shortcut)` }));
		disposables.add(instantiation.createInstance(OpenWorkspaceInAgentsContribution));
		assert.ok(factory);
		let actionRuns = 0;
		const action = disposables.add(new Action('test', 'Open in Agents', undefined, true, async () => { actionRuns++; }));
		const item = factory(action, {}, instantiation, 1);
		assert.ok(item);
		disposables.add(item);
		const container = $('div');
		item.render(container);
		const snapshot = () => ({
			label: container.querySelector('.open-in-agents-titlebar-widget-label')?.textContent,
			ariaLabel: container.getAttribute('aria-label'),
			hoverContent,
			actionLabel: action.label,
			triggers: [...telemetry.triggers],
		});
		const resolve = async (value: string | number | boolean | undefined, index = requests.length - 1) => {
			await requests[index].complete(value);
			await timeout(0);
		};
		const createFirstSession = () => storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const setSessionCount = (count: number) => storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, count, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const setRichHover = async (value: string) => {
			await configuration.setUserConfiguration(ChatConfiguration.TitleBarOpenInAgentsWindowRichHover, value);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === ChatConfiguration.TitleBarOpenInAgentsWindowRichHover;
				}
			}());
		};
		/** The rich hover's card, rendered the way the managed hover renders it, or `undefined` for a simple tooltip. */
		const hoverCard = () => isManagedHoverTooltipHTMLElement(hoverContent) ? hoverContent.element(CancellationToken.None) as HTMLElement : undefined;
		const hoverState = () => {
			const card = hoverCard();
			return {
				hover: card ? { title: card.querySelector('.agents-window-hover-card-title')?.textContent, graphic: card.querySelector('.agents-window-graphic')?.classList[1] } : hoverContent,
				expandOnHover: container.classList.contains('expand-on-hover'),
				noGrow: container.classList.contains('no-grow'),
			};
		};
		const resolveExpansion = async (value: string | number | boolean | undefined, index = expansionRequests.length - 1) => {
			await expansionRequests[index].complete(value);
			await timeout(0);
		};
		return { storage, createFirstSession, setSessionCount, setRichHover, hoverCard, hoverState, getHoverHides: () => hoverHides, refetched, requests, expansionRequests, queriedTreatments, warnings, item, container, resolve, resolveExpansion, snapshot, getActionRuns: () => actionRuns };
	}

	for (const value of [undefined, 'Try Agents']) {
		test(`renders and triggers for an eligible user in ${value === undefined ? 'control' : 'treatment'}`, async () => {
			const h = createHarness();
			await h.resolve(value);
			assert.deepStrictEqual(h.snapshot(), {
				label: value ?? 'Open in Agents',
				ariaLabel: `${value ?? 'Open in Agents Window'} (shortcut)`,
				hoverContent: `${value ?? 'Open in Agents Window'} (shortcut)`,
				actionLabel: 'Open in Agents',
				triggers: [treatmentName],
			});
		});
	}

	for (const sessionCount of [1, 2]) {
		test(`keeps default copy without querying or triggering for ${sessionCount} existing sessions`, () => {
			const h = createHarness(sessionCount);
			assert.deepStrictEqual({ snapshot: h.snapshot(), queried: h.queriedTreatments }, {
				snapshot: {
					label: 'Open in Agents',
					ariaLabel: 'Open in Agents Window (shortcut)',
					hoverContent: 'Open in Agents Window (shortcut)',
					actionLabel: 'Open in Agents',
					triggers: [],
				},
				queried: [],
			});
		});
	}

	test('uses a zero session count for eligibility without writing additional storage', async () => {
		const h = createHarness(0);
		await h.resolve('Try Agents');
		assert.deepStrictEqual({
			label: h.snapshot().label,
			application: h.storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
			shared: h.storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE),
		}, {
			label: 'Try Agents',
			application: [AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY],
			shared: [],
		});
	});

	for (const value of ['', '   ', false, 42]) {
		test(`logs and falls back for invalid treatment ${JSON.stringify(value)}`, async () => {
			const h = createHarness();
			await h.resolve(value);
			assert.deepStrictEqual({
				label: h.snapshot().label,
				triggers: h.snapshot().triggers,
				warnings: h.warnings,
			}, {
				label: 'Open in Agents',
				triggers: [treatmentName],
				warnings: [`[OpenWorkspaceInAgentsTitleBarWidget] Ignoring invalid ${treatmentName} treatment`],
			});
		});
	}

	test('refreshes copy, ignores stale assignments, and restores default when the first session is created', async () => {
		const h = createHarness();
		h.refetched.fire();
		await h.resolve('New assignment', 1);
		await h.resolve('Stale assignment', 0);
		const refreshed = h.snapshot().label;
		h.createFirstSession();
		h.refetched.fire();
		assert.deepStrictEqual({ refreshed, snapshot: h.snapshot(), queries: h.queriedTreatments }, {
			refreshed: 'New assignment',
			snapshot: {
				label: 'Open in Agents',
				ariaLabel: 'Open in Agents Window (shortcut)',
				hoverContent: 'Open in Agents Window (shortcut)',
				actionLabel: 'Open in Agents',
				triggers: [treatmentName],
			},
			queries: [treatmentName, treatmentName],
		});
	});

	test('does not apply or trigger a pending assignment after the first session', async () => {
		const h = createHarness();
		h.createFirstSession();
		await h.resolve('Try Agents');
		assert.deepStrictEqual({ label: h.snapshot().label, triggers: h.snapshot().triggers }, { label: 'Open in Agents', triggers: [] });
	});

	test('does not update or trigger after disposal', async () => {
		const h = createHarness();
		h.item.dispose();
		await h.resolve('Try Agents');
		assert.deepStrictEqual({ label: h.snapshot().label, triggers: h.snapshot().triggers }, { label: 'Open in Agents', triggers: [] });
	});

	test('logs assignment failures and retains the previous resolved copy', async () => {
		const h = createHarness();
		await h.resolve('Try Agents');
		h.refetched.fire();
		await h.requests[1].error(new Error('Assignment unavailable'));
		await timeout(0);
		assert.deepStrictEqual({ label: h.snapshot().label, warnings: h.warnings }, {
			label: 'Try Agents',
			warnings: ['[OpenWorkspaceInAgentsTitleBarWidget] Failed to resolve treatments'],
		});
	});

	for (const sessionCount of [0, 2]) {
		for (const value of [undefined, true, false]) {
			test(`hover expansion defaults to enabled and applies to all users (${sessionCount} sessions, ${value})`, async () => {
				const h = createHarness(sessionCount);
				const before = h.container.classList.contains('expand-on-hover');
				await h.resolveExpansion(value);
				const beforeHover = h.snapshot().triggers;
				h.container.dispatchEvent(new MouseEvent('mouseenter'));
				h.container.dispatchEvent(new MouseEvent('mouseleave'));
				h.container.dispatchEvent(new MouseEvent('mouseenter'));
				assert.deepStrictEqual({
					before,
					expandOnHover: h.container.classList.contains('expand-on-hover'),
					beforeHover,
					triggers: h.snapshot().triggers,
					ariaLabel: h.snapshot().ariaLabel,
				}, {
					before: true,
					expandOnHover: value ?? true,
					beforeHover: [],
					// Users new to the Agents window could also see the rich hover, so it triggers in every arm.
					triggers: sessionCount === 0 ? [richHoverTreatmentName, expansionTreatmentName] : [expansionTreatmentName],
					ariaLabel: 'Open in Agents Window (shortcut)',
				});
			});
		}
	}

	for (const value of ['', 'false', 0]) {
		test(`invalid expansion treatment logs and retains default (${JSON.stringify(value)})`, async () => {
			const h = createHarness(2);
			await h.resolveExpansion(value);
			assert.deepStrictEqual({
				expandOnHover: h.container.classList.contains('expand-on-hover'),
				warnings: h.warnings,
			}, {
				expandOnHover: true,
				warnings: [`[OpenWorkspaceInAgentsTitleBarWidget] Ignoring invalid ${expansionTreatmentName} treatment`],
			});
		});
	}

	test('resolves the expansion trigger when already hovered and refreshes independently of copy eligibility', async () => {
		const h = createHarness();
		h.container.dispatchEvent(new MouseEvent('mouseenter'));
		await h.resolveExpansion(false);
		const disabled = h.container.classList.contains('expand-on-hover');
		h.createFirstSession();
		h.refetched.fire();
		await h.resolveExpansion(true);
		assert.deepStrictEqual({
			disabled,
			refreshed: h.container.classList.contains('expand-on-hover'),
			triggers: h.snapshot().triggers,
		}, { disabled: false, refreshed: true, triggers: [richHoverTreatmentName, expansionTreatmentName] });
	});

	test('ignores stale expansion assignments and does not update after disposal', async () => {
		const h = createHarness(2);
		h.refetched.fire();
		await h.resolveExpansion(false, 1);
		await h.resolveExpansion(true, 0);
		const latest = h.container.classList.contains('expand-on-hover');
		h.refetched.fire();
		h.item.dispose();
		await h.resolveExpansion(true, 2);
		h.container.dispatchEvent(new MouseEvent('mouseenter'));
		assert.deepStrictEqual({
			latest,
			afterDisposal: h.container.classList.contains('expand-on-hover'),
			triggers: h.snapshot().triggers,
		}, { latest: false, afterDisposal: false, triggers: [] });
	});

	test('keeps resolved expansion state when refetch fails', async () => {
		const h = createHarness(2);
		await h.resolveExpansion(false);
		h.refetched.fire();
		await h.expansionRequests[1].error(new Error('Assignment unavailable'));
		await timeout(0);
		assert.deepStrictEqual({
			expandOnHover: h.container.classList.contains('expand-on-hover'),
			warnings: h.warnings,
		}, {
			expandOnHover: false,
			warnings: ['[OpenWorkspaceInAgentsTitleBarWidget] Failed to resolve treatments'],
		});
	});

	test('disabled hover expansion preserves copy treatment, tooltip, accessible name, and action execution', async () => {
		const h = createHarness();
		await h.resolveExpansion(false);
		await h.resolve('Try Agents');
		h.container.dispatchEvent(new MouseEvent('mouseenter'));
		h.container.dispatchEvent(new MouseEvent('click'));
		await timeout(0);
		assert.deepStrictEqual({
			snapshot: h.snapshot(),
			expandOnHover: h.container.classList.contains('expand-on-hover'),
			actionRuns: h.getActionRuns(),
		}, {
			snapshot: {
				label: 'Try Agents',
				ariaLabel: 'Try Agents (shortcut)',
				hoverContent: 'Try Agents (shortcut)',
				actionLabel: 'Open in Agents',
				triggers: [treatmentName, richHoverTreatmentName, expansionTreatmentName],
			},
			expandOnHover: false,
			actionRuns: 1,
		});
	});

	test('initial expansion lookup failure logs and preserves enabled default without triggering after hover ends', async () => {
		const h = createHarness(2);
		h.container.dispatchEvent(new MouseEvent('mouseenter'));
		h.container.dispatchEvent(new MouseEvent('mouseleave'));
		await h.expansionRequests[0].error(new Error('Assignment unavailable'));
		await timeout(0);
		assert.deepStrictEqual({
			expandOnHover: h.container.classList.contains('expand-on-hover'),
			warnings: h.warnings,
			triggers: h.snapshot().triggers,
		}, {
			expandOnHover: true,
			warnings: ['[OpenWorkspaceInAgentsTitleBarWidget] Failed to resolve treatments'],
			triggers: [],
		});
	});

	test('selects the hover by variant and session count, and triggers each experiment only where it applies', async () => {
		const results: Record<string, unknown> = {};
		for (const variant of ['none', 'manyWindowsToOne', 'windowComparison', 'unknown']) {
			for (const sessionCount of [0, 1, 2]) {
				const h = createHarness(sessionCount, variant);
				if (h.requests.length) {
					await h.resolve('Try Agents');
				}
				await h.resolveExpansion(true);
				const beforeHover = h.snapshot().triggers;
				h.container.dispatchEvent(new MouseEvent('mouseenter'));
				h.container.dispatchEvent(new MouseEvent('mouseleave'));
				h.container.dispatchEvent(new MouseEvent('mouseenter'));
				results[`${variant}, ${sessionCount} sessions`] = { ...h.hoverState(), label: h.snapshot().label, ariaLabel: h.snapshot().ariaLabel, beforeHover, afterHover: h.snapshot().triggers.filter(trigger => !beforeHover.includes(trigger)) };
				h.item.dispose();
			}
		}
		const simple = (label: string, extra: object) => ({ hover: `${label} (shortcut)`, expandOnHover: true, noGrow: false, label, ariaLabel: `${label} (shortcut)`, ...extra });
		const newUserSimple = simple('Try Agents', { beforeHover: [treatmentName], afterHover: [richHoverTreatmentName, expansionTreatmentName] });
		const secondSessionSimple = { ...simple('Open in Agents', {}), hover: 'Open in Agents Window (shortcut)', ariaLabel: 'Open in Agents Window (shortcut)', beforeHover: [], afterHover: [richHoverTreatmentName, expansionTreatmentName] };
		const existingUser = { ...simple('Open in Agents', {}), hover: 'Open in Agents Window (shortcut)', ariaLabel: 'Open in Agents Window (shortcut)', beforeHover: [], afterHover: [expansionTreatmentName] };
		// The card replaces the growing label, so the button never grows and the label and expansion experiments neither apply nor trigger.
		const card = (hover: object) => ({ hover, expandOnHover: false, noGrow: true, label: 'Open in Agents', ariaLabel: 'Open in Agents Window (shortcut)', beforeHover: [], afterHover: [richHoverTreatmentName] });
		assert.deepStrictEqual(results, {
			'none, 0 sessions': newUserSimple,
			'none, 1 sessions': secondSessionSimple,
			'none, 2 sessions': existingUser,
			'manyWindowsToOne, 0 sessions': card(manyWindowsToOneCard),
			'manyWindowsToOne, 1 sessions': card(manyWindowsToOneCard),
			'manyWindowsToOne, 2 sessions': existingUser,
			'windowComparison, 0 sessions': card(windowComparisonCard),
			'windowComparison, 1 sessions': card(windowComparisonCard),
			'windowComparison, 2 sessions': existingUser,
			'unknown, 0 sessions': newUserSimple,
			'unknown, 1 sessions': secondSessionSimple,
			'unknown, 2 sessions': existingUser,
		});
	});

	test('triggers the hover experiment on keyboard focus, and the card opens the Agents window', async () => {
		const h = createHarness(1, 'manyWindowsToOne');
		h.container.dispatchEvent(new FocusEvent('focus'));
		const afterFocus = h.snapshot().triggers;
		h.hoverCard()?.querySelector<HTMLElement>('.monaco-button')?.click();
		await timeout(0);
		assert.deepStrictEqual({ afterFocus, actionRuns: h.getActionRuns(), hoverHides: h.getHoverHides() }, {
			afterFocus: [richHoverTreatmentName],
			actionRuns: 1,
			hoverHides: 1,
		});
	});

	test('switches between the cards and the simple tooltip when the session count or variant changes', async () => {
		const h = createHarness(1, 'manyWindowsToOne');
		const states = [h.hoverState()];
		h.setSessionCount(2);
		states.push(h.hoverState());
		h.setSessionCount(0);
		states.push(h.hoverState());
		await h.setRichHover('windowComparison');
		states.push(h.hoverState());
		await h.setRichHover('none');
		states.push(h.hoverState());
		assert.deepStrictEqual(states, [
			{ hover: manyWindowsToOneCard, expandOnHover: false, noGrow: true },
			{ hover: 'Open in Agents Window (shortcut)', expandOnHover: true, noGrow: false },
			{ hover: manyWindowsToOneCard, expandOnHover: false, noGrow: true },
			{ hover: windowComparisonCard, expandOnHover: false, noGrow: true },
			{ hover: 'Open in Agents Window (shortcut)', expandOnHover: true, noGrow: false },
		]);
	});
});
