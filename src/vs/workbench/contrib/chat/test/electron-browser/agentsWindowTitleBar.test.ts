/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/media/style.css';
import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHover, IManagedHoverContent } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
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
import { AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING } from '../../../../../platform/chat/common/chatSettings.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../common/constants.js';
import { OpenWorkspaceInAgentsContribution } from '../../electron-browser/agentSessions/agentSessionsActions.js';

suite('Agents Window titlebar copy experiment', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const treatmentName = 'chatOpenInAgentsTitleBarLabel';
	const expansionTreatmentName = 'chatOpenInAgentsTitleBarExpandOnHover';

	function attach(container: HTMLElement): HTMLElement {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = 'position: fixed; top: 0; left: 0';
		disposables.add(toDisposable(() => root.remove()));
		append(root, container);
		return root;
	}

	async function waitForObservation(element: HTMLElement): Promise<boolean> {
		await Promise.resolve();
		return new Promise(resolve => {
			const observer = new mainWindow.IntersectionObserver(entries => {
				observer.disconnect();
				resolve(entries[0].isIntersecting);
			});
			observer.observe(element);
		});
	}

	function createHarness(sessionCount?: number, iconConfiguration?: TestConfigurationService) {
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
		const hover = upcastPartial<IManagedHover>({
			dispose: () => { },
			update: content => { hoverContent = content; },
		});
		const configuration = iconConfiguration ?? new TestConfigurationService({ [AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING]: true });
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
		assert.ok(item instanceof BaseActionViewItem);
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
		const resolveExpansion = async (value: string | number | boolean | undefined, index = expansionRequests.length - 1) => {
			await expansionRequests[index].complete(value);
			await timeout(0);
		};
		return { storage, telemetry, createFirstSession, refetched, requests, expansionRequests, queriedTreatments, warnings, item, container, resolve, resolveExpansion, snapshot, getActionRuns: () => actionRuns };
	}

	for (const useCodicons of [false, true]) {
		test(`uses the ${useCodicons ? 'codicon' : 'branded'} title-bar icon in the ${useCodicons ? 'treatment' : 'control'} arm and logs its trigger`, async () => {
			const configuration = new class extends TestConfigurationService {
				override inspect<T>(key: string) {
					const inspected = super.inspect<T>(key);
					return key === AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING
						? { ...inspected, userValue: undefined, userLocalValue: undefined }
						: inspected;
				}
			}({ [AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING]: useCodicons });
			const h = createHarness(undefined, configuration);
			const icon = h.container.querySelector<HTMLElement>('.open-in-agents-titlebar-widget-icon')!;
			icon.style.cssText = 'width: 16px; height: 16px';
			const triggered = Event.toPromise(h.telemetry.onDidTrigger);
			const root = attach(h.container);
			root.style.display = 'none';
			assert.strictEqual(await waitForObservation(h.container), false);
			assert.deepStrictEqual(h.snapshot().triggers, []);
			root.style.display = '';
			await triggered;
			assert.deepStrictEqual({
				hasCodicon: icon?.classList.contains('codicon'),
				triggerLogged: h.snapshot().triggers.includes(`config.${AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING}`),
			}, { hasCodicon: useCodicons, triggerLogged: true });

			await configuration.setUserConfiguration(AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING, !useCodicons);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING;
				}
			}());
			assert.strictEqual(icon?.classList.contains('codicon'), !useCodicons);
		});

		test(`logs the Agents icon trigger when a user resets to the ${useCodicons ? 'codicon' : 'branded'} default`, async () => {
			const setting = AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING;
			const configuration = new class extends TestConfigurationService {
				usingDefault = false;
				override inspect<T>(key: string) {
					const inspected = super.inspect<T>(key);
					return key === setting && this.usingDefault ? { ...inspected, userValue: undefined, userLocalValue: undefined } : inspected;
				}
			}({ [setting]: !useCodicons });
			const h = createHarness(undefined, configuration);
			h.container.querySelector<HTMLElement>('.open-in-agents-titlebar-widget-icon')!.style.cssText = 'width: 16px; height: 16px';
			attach(h.container);
			assert.strictEqual(await waitForObservation(h.container), true);
			const beforeReset = h.snapshot().triggers;
			await configuration.setUserConfiguration(setting, useCodicons);
			configuration.usingDefault = true;
			const triggered = Event.toPromise(h.telemetry.onDidTrigger);
			const change = new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === setting;
				}
			}();
			configuration.onDidChangeConfigurationEmitter.fire(change);
			configuration.onDidChangeConfigurationEmitter.fire(change);
			await triggered;
			assert.deepStrictEqual({
				beforeReset,
				hasCodicon: h.container.querySelector('.open-in-agents-titlebar-widget-icon')?.classList.contains('codicon'),
				triggers: h.snapshot().triggers,
			}, { beforeReset: [], hasCodicon: useCodicons, triggers: [`config.${setting}`] });
		});
	}

	test('Agents icon uses the title bar foreground in active and inactive windows', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = '--vscode-titleBar-activeForeground: #ffffff; --vscode-titleBar-inactiveForeground: #aabbcc; --vscode-icon-foreground: #000000';
		disposables.add(toDisposable(() => root.remove()));
		const titlebar = append(root, $('.part.titlebar'));
		const h = createHarness();
		append(titlebar, h.container);
		const icon = h.container.querySelector<HTMLElement>('.open-in-agents-titlebar-widget-icon')!;
		const colors = ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(theme => {
			root.classList.add(theme);
			const active = mainWindow.getComputedStyle(icon).color;
			titlebar.classList.add('inactive');
			const inactive = mainWindow.getComputedStyle(icon).color;
			titlebar.classList.remove('inactive');
			root.classList.remove(theme);
			return { active, inactive };
		});
		const expected = { active: 'rgb(255, 255, 255)', inactive: 'rgb(170, 187, 204)' };
		assert.deepStrictEqual(colors, [expected, expected, expected, expected]);
	});

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
					triggers: [expansionTreatmentName],
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
		}, { disabled: false, refreshed: true, triggers: [expansionTreatmentName] });
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
				triggers: [treatmentName, expansionTreatmentName],
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
});
