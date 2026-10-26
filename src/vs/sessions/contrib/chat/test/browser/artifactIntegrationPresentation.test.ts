/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { HoverStyle, IDelayedHoverOptions, IHoverLifecycleOptions, IHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Keybinding, KeyCodeChord, ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, derived, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ArtifactDetails, ArtifactRun, ArtifactSnapshot, artifactBindingId, IArtifactDetailsModel, IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService, WorkbenchListWidget } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { QuickInputService } from '../../../../../platform/quickinput/browser/quickInputService.js';
import { IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { chartsGreen, chartsPurple } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { IChatPillEntry, withChatPillHoverLabel } from '../../../../../workbench/browser/chatPills.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, IChatViewModelChangeEvent } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import '../../../../../workbench/browser/media/style.css';
import '../../../../../workbench/browser/actions/listCommands.js';
import { ArtifactDetailsAccessibilityHelp, ArtifactDetailsAccessibleView, ArtifactDetailsContextView } from '../../browser/artifactDetailsContextView.js';
import { ArtifactIntegrationPresentation } from '../../browser/artifactIntegrationPresentation.js';
import { ArtifactDetailsModel } from '../../browser/artifactDetailsModel.js';
import { ArtifactDetailsPanel } from '../../browser/artifactDetailsPanel.js';
import { artifactViewKey, IArtifactDetailsViewData } from '../../browser/artifactDetailsView.js';

suite('Artifact Integration Presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const instantiation = workbenchInstantiationService(undefined, store);
		const host = $('.monaco-workbench');
		host.style.cssText = 'position:fixed;top:0;left:0;width:720px;height:100vh;font-size:13px;';
		for (const [name, value] of Object.entries({
			'fontSize-body1': '13px', 'fontSize-label1': '12px', 'fontSize-heading3': '13px', 'fontSize-body2': '11px',
			'fontWeight-semiBold': '600', 'strokeThickness': '1px', 'cornerRadius-large': '8px', 'cornerRadius-medium': '6px', 'cornerRadius-small': '4px', 'cornerRadius-circle': '9999px',
			'spacing-size20': '2px', 'spacing-size40': '4px', 'spacing-size60': '6px', 'spacing-size80': '8px', 'spacing-size120': '12px', 'spacing-size160': '16px', 'spacing-size240': '24px', 'spacing-size360': '36px',
			'codiconFontSize': '16px', 'codiconFontSize-compact': '12px', 'focusBorder': '#007acc', 'editorWidget-border': '#777', 'widget-border': '#777',
		})) {
			host.style.setProperty(`--vscode-${name}`, value);
		}
		mainWindow.document.body.appendChild(host);
		store.add(toDisposable(() => host.remove()));
		const row = append(host, $('.chat-pills'));
		row.style.cssText = 'position:absolute;left:20px;right:20px;bottom:150px;';
		const actions = append(append(row, $('.monaco-action-bar')), $('.actions-container'));
		const input = append(host, $<HTMLInputElement>('input'));
		input.style.cssText = 'position:absolute;left:20px;right:20px;bottom:20px;height:110px;box-sizing:border-box;';
		const layout = new class extends mock<ILayoutService>() {
			override readonly mainContainer = host;
			override readonly activeContainer = host;
			override readonly onDidLayoutContainer = Event.None;
			override get mainContainerDimension() { return { width: host.clientWidth, height: host.clientHeight }; }
			override get activeContainerDimension() { return this.mainContainerDimension; }
			override readonly activeContainerOffset = { top: 0, quickPickTop: 0 };
			override readonly mainContainerOffset = { top: 0, quickPickTop: 0 };
			override readonly onDidLayoutActiveContainer = Event.None;
			override readonly onDidChangeActiveContainer = Event.None;
			override readonly onDidAddContainer = Event.None;
			override focus(): void { input.focus(); }
			override getContainer(): HTMLElement { return host; }
		}();
		instantiation.stub(ILayoutService, layout);
		let contextShows = 0;
		const contextView = store.add(instantiation.createInstance(class extends ContextViewService {
			override showContextView(...args: Parameters<IContextViewService['showContextView']>) {
				contextShows++;
				return super.showContextView(...args);
			}
		}));
		instantiation.stub(IContextViewService, contextView);
		const sentiment = observableValue<IChatSentiment>('sentiment', { hidden: false });
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override get sentiment() { return sentiment.get(); }
			override readonly sentimentObs = sentiment;
		}());
		const hovers = new Map<HTMLElement, IDelayedHoverOptions | (() => IDelayedHoverOptions)>();
		const hoverGroups = new Map<HTMLElement, string | undefined>();
		const shownHovers: IHoverOptions[] = [];
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(target: HTMLElement, options: IDelayedHoverOptions | (() => IDelayedHoverOptions), lifecycleOptions?: IHoverLifecycleOptions) {
				hovers.set(target, options);
				hoverGroups.set(target, lifecycleOptions?.groupId);
				return toDisposable(() => {
					hovers.delete(target);
					hoverGroups.delete(target);
				});
			}
			override setupDelayedHoverAtMouse(target: HTMLElement, options: Parameters<IHoverService['setupDelayedHoverAtMouse']>[1], lifecycleOptions?: IHoverLifecycleOptions) {
				return this.setupDelayedHover(target, options, lifecycleOptions);
			}
			override hideHover(): void { }
			override showInstantHover(options: IHoverOptions) {
				shownHovers.push(options);
				return undefined;
			}
		}());
		const errors: string[] = [];
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: string | Error): void { errors.push(String(error)); }
		}());
		const openedItems: string[] = [];
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: Parameters<IOpenerService['open']>[0]): Promise<boolean> {
				openedItems.push(resource.toString());
				return true;
			}
		}());
		instantiation.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
		const openedChats: string[] = [];
		const revealedActivities: string[] = [];
		const focusedActivities: string[] = [];
		const chatWidgets = new ResourceMap<IChatWidget>();
		const onDidAddWidget = store.add(new Emitter<IChatWidget>());
		const activeSession = observableValue<IActiveSession | undefined>('activity chat', undefined);
		let openChatResult: Promise<void> | undefined;
		instantiation.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSessionForChatResource(resource: URI) {
				return chatWidgets.has(resource) ? {
					session: new class extends mock<ISession>() { }(),
					chat: new class extends mock<IChat>() { override readonly resource = resource; }(),
				} : undefined;
			}
		}());
		instantiation.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override async openChat(_session: ISession, resource: URI): Promise<void> {
				openedChats.push(resource.toString());
				activeSession.set(new class extends mock<IActiveSession>() {
					override readonly activeChat = constObservable(new class extends mock<IChat>() { override readonly resource = resource; }());
				}(), undefined);
				await openChatResult;
			}
		}());
		instantiation.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = onDidAddWidget.event;
			override readonly onDidRemoveWidget = Event.None;
			override getAllWidgets() { return [...chatWidgets.values()]; }
			override getWidgetBySessionResource(resource: URI) { return chatWidgets.get(resource); }
		}());
		const registerActivityChat = (resource: URI, ids: readonly (string | { id: string; requestId: string })[]) => {
			const changed = store.add(new Emitter<IChatViewModelChangeEvent>());
			const createItems = (values: typeof ids) => values.map(value => {
				if (typeof value === 'string') {
					const id = value;
					return new class extends mock<IChatRequestViewModel>() {
						override readonly id = id;
						override readonly sessionResource = resource;
						override readonly message = { text: 'Artifact activity', parts: [] };
					}();
				}
				const { id, requestId } = value;
				return new class extends mock<IChatResponseViewModel>() {
					override readonly id = id;
					override readonly requestId = requestId;
					override readonly response = new class extends mock<IChatResponseViewModel['response']>() { }();
					override setVote(): void { }
				}();
			});
			let items = createItems(ids);
			const viewModel = new class extends mock<IChatViewModel>() {
				override readonly sessionResource = resource;
				override readonly onDidChange = changed.event;
				override getItems() { return items; }
			}();
			const widget = new class extends mock<IChatWidget>() {
				override readonly viewModel = viewModel;
				override readonly onDidChangeViewModel = Event.None;
				override reveal(item: Parameters<IChatWidget['reveal']>[0]): void { revealedActivities.push(item.id); }
				override focus(item: Parameters<IChatWidget['focus']>[0]): void { focusedActivities.push(item.id); }
			}();
			chatWidgets.set(resource, widget);
			onDidAddWidget.fire(widget);
			return {
				setItems: (values: typeof ids) => { items = createItems(values); changed.fire(null); },
			};
		};
		const configuration = new TestConfigurationService({ accessibility: { verbosity: { panelChat: true } } });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IContextKeyService, store.add(instantiation.createInstance(ContextKeyService)));
		const lists: WorkbenchListWidget[] = [];
		instantiation.stub(IListService, store.add(new class extends ListService {
			override register(widget: WorkbenchListWidget, extraContextKeys?: IContextKey<boolean>[]) {
				lists.push(widget);
				const registration = super.register(widget, extraContextKeys);
				return toDisposable(() => {
					lists.splice(lists.indexOf(widget), 1);
					registration.dispose();
				});
			}
		}()));
		const keybindingService = new class extends MockKeybindingService {
			override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
				return commandId === 'editor.action.accessibilityHelp' ? this.resolveKeybinding(new Keybinding([new KeyCodeChord(false, false, true, false, KeyCode.F1)]))[0] : undefined;
			}
		}();
		instantiation.stub(IKeybindingService, keybindingService);
		const controller = store.add(instantiation.createInstance(ArtifactDetailsContextView, () => input, () => row, () => input.focus()));

		function artifact(id = 'artifact') {
			const snapshot = observableValue<ArtifactSnapshot>(id, {
				authority: { id: 'client', targetHost: 'host', location: 'client' }, session: 'session',
				artifact: { id, label: `Recorded ${id}`, resource: `https://example.test/${id}` }, mainIntegrationId: 'test', runs: [],
				contributions: [{
					integrationId: 'test', label: 'Test',
					configuration: { revision: 4, values: { fix: false, reviews: false, merge: false }, generations: {}, disablements: {} },
					options: [
						{ id: 'fix', kind: 'boolean', label: 'Auto Fix CI', description: 'Repair failed checks.', actionIds: ['fix'], maxAttempts: 3, defaultValue: false },
						{ id: 'reviews', kind: 'boolean', label: 'Address Comments Automatically', description: 'Address review comments.', actionIds: ['reviews'], maxAttempts: 3, defaultValue: false },
						{ id: 'merge', kind: 'boolean', label: 'Merge Automatically', description: 'Merge when ready.', actionIds: ['merge'], maxAttempts: 1, defaultValue: false },
					],
					actions: [
						{ id: 'fix', label: 'Fix CI', iconId: 'tools', kind: 'prompt' },
						{ id: 'reviews', label: 'Address Comments', iconId: 'comment-discussion', kind: 'prompt' },
						{ id: 'merge', label: 'Merge', iconId: 'git-merge', kind: 'code' },
					],
					view: {
						availability: { kind: 'available' }, main: { icon: { id: 'git-pull-request' }, label: '#42', description: 'Open: compact status', detailsId: 'main' },
						sections: [
							{ id: 'status', icon: { id: 'error', colorId: 'charts.red' }, label: '1/2', description: '1 of 2 checks passed', detailsId: 'checks' },
							{ id: 'comments', icon: { id: 'comment-discussion' }, label: '1', detailsId: 'comments' },
						],
						lists: [{ id: 'checks', label: 'Checks', detailsId: 'checks' }, { id: 'comments', label: 'Review threads', detailsId: 'comments' }],
						stateActions: [{ id: 'fix', enabled: true }, { id: 'reviews', enabled: true }, { id: 'merge', enabled: false, disabledReason: 'Checks must pass.' }],
						generalActions: [],
						automationAvailability: [{ id: 'fix', available: true }, { id: 'reviews', available: true }, { id: 'merge', available: true }],
					},
				}],
			});
			const detailValues: Record<string, ArtifactDetails> = {
				main: { title: `Full title for ${id}`, description: 'The actual resource description.', availability: { kind: 'available' }, links: [], items: [], completeness: 'complete' },
				checks: {
					title: 'Checks', availability: { kind: 'available' }, links: [{ kind: 'action', actionId: 'fix' }, { kind: 'automation', optionId: 'fix' }],
					items: [
						{ id: 'lint', label: 'Lint', description: 'Failed', icon: { id: 'error' }, resource: 'https://example.test/lint' },
						{ id: 'build', label: 'Build', description: 'Passed', icon: { id: 'pass' }, resource: 'https://example.test/build' },
					], completeness: 'complete',
				},
				comments: {
					title: 'Review threads', availability: { kind: 'available' }, links: [{ kind: 'action', actionId: 'reviews' }, { kind: 'automation', optionId: 'reviews' }],
					items: [{ id: 'review', label: 'Preserve focus after refresh', description: 'reviewer - src/view.ts', icon: { id: 'comment-discussion' }, resource: 'https://example.test/review' }], completeness: 'complete',
				},
			};
			const details = Object.fromEntries(Object.entries(detailValues).map(([id, value]) => [id, observableValue(id, value)]));
			const acquired: string[] = [];
			const released: string[] = [];
			const invoked: { integrationId: string; actionId: string; chat: string }[] = [];
			const itemActions: { detailsId: string; itemId: string; actionId: string }[] = [];
			let itemActionResult: Promise<void> | undefined;
			const configured: { integrationId: string; revision: number; values: Readonly<Record<string, boolean | string>> }[] = [];
			const authentications: string[] = [];
			const chat = observableValue('chat', 'invoking-chat');
			let resourceOpens = 0;
			let shellActions = 0;
			let configureResult: Promise<void> | undefined;
			let authenticationResult: Promise<void> | undefined;
			let acquireResult: Promise<void> | undefined;
			let onInvoke: (() => void) | undefined;
			const cancelled: string[] = [];
			const reconciled: string[] = [];
			const historyRequests: (string | undefined)[] = [];
			let history: readonly ArtifactRun[] | undefined;
			let historyResult: Promise<{ runs: readonly ArtifactRun[]; next?: string }> | undefined;
			const model: IArtifactModel = {
				snapshot,
				requestAuthentication: async integrationId => {
					authentications.push(integrationId);
					await authenticationResult;
					return { resource: 'https://example.test' };
				},
				configure: async (integrationId, revision, values) => {
					configured.push({ integrationId, revision, values });
					await configureResult;
					const current = snapshot.get();
					snapshot.set({
						...current, contributions: current.contributions.map(contribution => contribution.integrationId === integrationId ? {
							...contribution, configuration: { ...contribution.configuration, revision: revision + 1, values: { ...contribution.configuration.values, ...values } },
						} : contribution)
					}, undefined);
				},
				invoke: async (integrationId, actionId, chat, requestId) => {
					onInvoke?.();
					invoked.push({ integrationId, actionId, chat });
					const run: ArtifactRun = {
						id: requestId, requestId, bindingId: artifactBindingId('client', 'session', id, integrationId), integrationId, actionId, actionKind: 'prompt', actionConsent: 'consent',
						source: 'manual', state: 'queued', createdAt: 0, updatedAt: 0, reason: actionId, chat, dispatched: false,
					};
					snapshot.set({ ...snapshot.get(), runs: [...snapshot.get().runs, run] }, undefined);
					return run;
				},
				cancel: async runId => {
					cancelled.push(runId);
					const update = (run: ArtifactRun): ArtifactRun => run.id === runId ? { ...run, state: 'cancelled', updatedAt: run.updatedAt + 1 } : run;
					history = history?.map(update);
					snapshot.set({ ...snapshot.get(), runs: snapshot.get().runs.map(update) }, undefined);
				},
				reconcile: async runId => {
					reconciled.push(runId);
					const update = (run: ArtifactRun): ArtifactRun => run.id === runId ? { ...run, state: 'completed', indeterminate: false, updatedAt: run.updatedAt + 1 } : run;
					history = history?.map(update);
					snapshot.set({ ...snapshot.get(), runs: snapshot.get().runs.map(update) }, undefined);
				},
				getRuns: async (before, limit = 50) => {
					historyRequests.push(before);
					if (historyResult) {
						return historyResult;
					}
					const runs = [...history ?? snapshot.get().runs].sort((a, b) => b.createdAt - a.createdAt);
					const start = before === undefined ? 0 : runs.findIndex(run => run.id === before) + 1;
					const page = runs.slice(start, start + limit);
					return { runs: page, next: start + page.length < runs.length ? page.at(-1)?.id : undefined };
				},
				acquireDetails: async (_integrationId, detailsId): Promise<IArtifactDetailsModel> => {
					acquired.push(detailsId);
					await acquireResult;
					if (!details[detailsId]) {
						throw new Error(`Missing details: ${detailsId}`);
					}
					const lifetime = toDisposable(() => released.push(detailsId));
					return {
						details: details[detailsId], dispose: () => lifetime.dispose(),
						runItemAction: async (itemId, actionId) => {
							itemActions.push({ detailsId, itemId, actionId });
							await itemActionResult;
						},
					};
				},
			};
			const presentation = store.add(instantiation.createInstance(ArtifactIntegrationPresentation, model, reader => chat.read(reader), controller));
			const copy = store.add(new Action('copy', 'Copy Link', undefined, true, async () => { shellActions++; }));
			const remove = store.add(new Action('remove', 'Remove Artifact', undefined, true, async () => { shellActions++; }));
			const base: IChatPillEntry = { id, label: `Recorded ${id}`, toolbarActions: [copy, remove], open: () => { resourceOpens++; } };
			const entry = derived(reader => presentation.decorate(base, reader));
			const container = append(actions, $('.action-item'));
			const item = entry.get().inlinePill!.createActionViewItem!({});
			assert.ok(item instanceof BaseActionViewItem);
			store.add(item);
			item.render(container);
			const main = container.querySelector<HTMLElement>('.chat-pill-button')!;
			return {
				snapshot, details, presentation, entry, base, container, main, acquired, released, invoked, itemActions, configured, authentications, chat, cancelled, reconciled, historyRequests,
				setHistory: (runs: readonly ArtifactRun[]) => { history = runs; },
				setHistoryResult: (result: Promise<{ runs: readonly ArtifactRun[]; next?: string }> | undefined) => { historyResult = result; },
				counts: () => ({ resourceOpens, shellActions }),
				setConfigureResult: (result: Promise<void>) => { configureResult = result; },
				setAuthenticationResult: (result: Promise<void>) => { authenticationResult = result; },
				setAcquireResult: (result: Promise<void>) => { acquireResult = result; },
				onInvoke: (callback: () => void) => { onInvoke = callback; },
				setItemActionResult: (result: Promise<void> | undefined) => { itemActionResult = result; },
			};
		}
		return {
			host, row, input, controller, contextView, hovers, hoverGroups, shownHovers, sentiment, configuration, errors, openedItems, artifact, instantiation, keybindingService, lists,
			openedChats, revealedActivities, focusedActivities, registerActivityChat, activeSession,
			setOpenChatResult: (result: Promise<void>) => { openChatResult = result; },
			contextShows: () => contextShows,
		};
	}

	type Fixture = ReturnType<typeof fixture>;
	type Artifact = ReturnType<Fixture['artifact']>;

	async function settle(f: Fixture): Promise<void> {
		await timeout(0);
		f.contextView.layout();
	}

	async function open(f: Fixture, a: Artifact, section?: number): Promise<HTMLElement> {
		(section === undefined ? a.main : a.container.querySelectorAll<HTMLElement>('.artifact-pill-sections [role="button"]')[section]).click();
		await settle(f);
		const panel = f.host.querySelector<HTMLElement>('.artifact-integration-panel');
		assert.ok(panel);
		return panel;
	}

	function button(panel: HTMLElement, label: string): HTMLElement {
		const result = [...panel.querySelectorAll<HTMLElement>('[role="button"]')].find(button => button.textContent === label || button.getAttribute('aria-label') === label);
		assert.ok(result, `Missing button: ${label}`);
		return result;
	}

	function escape(element: HTMLElement): void {
		element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
	}

	function updateContribution(a: Artifact, update: (contribution: ArtifactSnapshot['contributions'][number]) => ArtifactSnapshot['contributions'][number]): void {
		a.snapshot.set({ ...a.snapshot.get(), contributions: a.snapshot.get().contributions.map(update) }, undefined);
	}

	test('the details model normalizes provider state before a panel is created', async () => {
		const f = fixture();
		const a = f.artifact();
		const model = store.add(f.instantiation.createInstance(ArtifactDetailsModel, a.presentation, () => { }));
		const loading = model.data.get();
		await timeout(0);
		const data = model.data.get();
		const summary = {
			loading: loading.lists.map(list => list.loading),
			title: data.title, description: data.description, resource: data.resource,
			lists: data.lists.map(list => ({ id: list.id, title: list.title, items: list.items.map(item => item.label), loading: list.loading })),
			actions: data.stateActions.map(action => ({ id: action.id, label: action.label, enabled: action.enabled, primary: action.primary })),
			autopilot: data.autopilot.map(group => ({ title: group.title, expanded: group.expanded, summary: group.summary, rules: group.rules.map(rule => rule.label) })),
			activities: data.activities.items, selected: data.selectedList,
			destinations: data.sections.filter(section => section.target?.kind === 'list').map(section => [section.id, section.target?.id]),
			panels: f.host.querySelectorAll('.artifact-integration-panel').length,
		};
		assert.deepStrictEqual(summary, {
			loading: [true, true], title: 'Full title for artifact', description: 'The actual resource description.', resource: 'https://example.test/artifact',
			lists: [
				{ id: artifactViewKey('test', 'checks'), title: 'Checks', items: ['Lint', 'Build'], loading: false },
				{ id: artifactViewKey('test', 'comments'), title: 'Review threads', items: ['Preserve focus after refresh'], loading: false },
			],
			actions: [
				{ id: artifactViewKey('test', 'fix'), label: 'Fix CI', enabled: true, primary: true },
				{ id: artifactViewKey('test', 'reviews'), label: 'Address Comments', enabled: true, primary: false },
				{ id: artifactViewKey('test', 'merge'), label: 'Merge', enabled: false, primary: false },
			],
			autopilot: [{ title: 'Autopilot', expanded: false, summary: '0 of 3 on', rules: ['Auto Fix CI', 'Address Comments Automatically', 'Merge Automatically'] }],
			activities: [], selected: undefined,
			destinations: [[artifactViewKey('test', 'checks'), artifactViewKey('test', 'checks')], [artifactViewKey('test', 'comments'), artifactViewKey('test', 'comments')]], panels: 0,
		});
	});

	test('normalized data stays immutable while commands preserve invoking-chat routing and saved consent', async () => {
		const f = fixture();
		const a = f.artifact();
		const model = store.add(f.instantiation.createInstance(ArtifactDetailsModel, a.presentation, () => { }));
		await timeout(0);
		const previous = model.data.get();
		a.chat.set('later-chat', undefined);
		previous.stateActions[0].run();
		await timeout(0);
		a.details.main.set({ ...a.details.main.get(), title: 'Updated resource title' }, undefined);
		a.details.comments.set({ ...a.details.comments.get(), items: [] }, undefined);
		await previous.autopilot[0].rules[0].setEnabled(true);
		const current = model.data.get();
		assert.deepStrictEqual({
			before: { title: previous.title, comments: previous.lists[1].items.length, enabled: previous.autopilot[0].rules[0].checked },
			after: { title: current.title, comments: current.lists[1].items.length, enabled: current.autopilot[0].rules[0].checked },
			invoked: a.invoked, configured: a.configured, errors: f.errors,
		}, {
			before: { title: 'Full title for artifact', comments: 1, enabled: false },
			after: { title: 'Updated resource title', comments: 0, enabled: true },
			invoked: [{ integrationId: 'test', actionId: 'fix', chat: 'later-chat' }],
			configured: [{ integrationId: 'test', revision: 4, values: { fix: true } }], errors: [],
		});
	});

	test('the panel renders static data and delegates interactions without an artifact provider', async () => {
		const f = fixture();
		const commands: string[] = [];
		const data: IArtifactDetailsViewData = {
			title: 'Deployment', resource: 'https://example.test/deployment', icon: { id: 'package' }, titleDescription: 'Ready to deploy',
			description: 'Deploy the selected revision.', message: '',
			lists: [{ id: 'health', title: 'Health', icon: { id: 'pulse' }, description: 'Checks in the target environment.', message: 'No failures.', loading: false, items: [], itemActions: new Map(), openItem: () => { commands.push('openItem'); } }],
			selectedList: 'health',
			stateActions: [{ id: 'deploy', label: 'Deploy', primary: true, enabled: true, run: () => { commands.push('deploy'); } }],
			generalActions: [{ id: 'copy', label: 'Copy Link', run: () => { commands.push('copy'); } }],
			autopilot: [{
				id: 'delivery', title: 'Autopilot', expanded: true, checked: false, disabled: false, summary: '0 of 1 on', toggleLabel: 'All Available Autopilot Rules', description: 'Deploy automatically when healthy.',
				rules: [{ id: 'autoDeploy', label: 'Deploy When Healthy', description: 'Wait for healthy checks.', checked: false, disabled: false, pending: false, setEnabled: async value => { commands.push(`rule:${value}`); } }],
				setExpanded: expanded => { commands.push(`expand:${expanded}`); }, setEnabled: async value => { commands.push(`group:${value}`); },
			}],
			activities: { expanded: false, items: [], summary: '0 loaded', message: '', setExpanded: () => { } }, sections: [], accessibleText: 'Deployment\nHealth\nDeploy\nAutopilot',
			openResource: () => { commands.push('open'); }, selectList: id => { commands.push(`select:${id}`); },
		};
		const input = observableValue<IArtifactDetailsViewData>('static panel data', data);
		const panel = store.add(f.instantiation.createInstance(ArtifactDetailsPanel, input, () => { }, () => { }, mainWindow));
		f.host.appendChild(panel.element);
		panel.layout(600);
		panel.element.querySelector<HTMLElement>('.artifact-details-title-link')!.click();
		button(panel.element, 'Deploy').click();
		button(panel.element, 'Copy Link').click();
		panel.element.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!.click();
		input.set({ ...data, title: 'Updated deployment', accessibleText: 'Updated deployment\nHealth\nDeploy\nAutopilot\nActivities\n1 loaded\nCompleted safely.', activities: { ...data.activities, expanded: true, summary: '1 loaded', items: [{ id: 'deploy-run', label: 'Deployment completed', description: 'Completed safely.', icon: { id: 'check' } }] } }, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			title: panel.title.textContent, tabs: [...panel.element.querySelectorAll('[role="tab"]')].map(tab => tab.textContent),
			autopilot: panel.element.querySelector('.artifact-autopilot-rule-label')?.textContent,
			activitiesVisible: !panel.element.querySelector<HTMLElement>('.artifact-activities')!.hidden,
			accessibleText: panel.getAccessibleText(), commands, noRuntimePanels: f.controller.selected.get() === undefined,
		}, { title: 'Updated deployment', tabs: ['Health'], autopilot: 'Deploy When Healthy', activitiesVisible: true, accessibleText: input.get().accessibleText, commands: ['open', 'deploy', 'copy', 'rule:true'], noRuntimePanels: true });
	});

	test('tab selection and Autopilot expansion are remembered per artifact with cards actually collapsed initially', async () => {
		const f = fixture();
		const a = f.artifact();
		const b = f.artifact('other');
		let panel = await open(f, a);
		const initially = {
			selected: panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
			listsHidden: panel.querySelector<HTMLElement>('.artifact-details-lists')?.hidden,
			expanded: button(panel, 'Autopilot').getAttribute('aria-expanded'),
			display: mainWindow.getComputedStyle(panel.querySelector('.artifact-autopilot-group .artifact-card-content')!).display,
		};
		panel.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
		button(panel, 'Autopilot').click();
		escape(panel);
		panel = await open(f, a);
		const remembered = { selected: panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent, expanded: button(panel, 'Autopilot').getAttribute('aria-expanded') };
		panel = await open(f, b);
		const other = { selected: panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent, expanded: button(panel, 'Autopilot').getAttribute('aria-expanded') };
		panel = await open(f, a);
		assert.deepStrictEqual({ initially, remembered, other, switchedBack: button(panel, 'Autopilot').getAttribute('aria-expanded') }, {
			initially: { selected: undefined, listsHidden: true, expanded: 'false', display: 'none' }, remembered: { selected: 'Review threads', expanded: 'true' },
			other: { selected: undefined, expanded: 'false' }, switchedBack: 'true',
		});
	});

	suite('Activities', () => {
		function activity(a: Artifact, id: string, values: Partial<ArtifactRun> = {}): ArtifactRun {
			const snapshot = a.snapshot.get();
			return {
				id, requestId: id, bindingId: artifactBindingId(snapshot.authority.id, snapshot.session, snapshot.artifact.id, 'test'), integrationId: 'test',
				actionId: 'fix', actionKind: 'prompt', actionConsent: 'test', source: 'manual',
				state: 'completed', reason: `Activity ${id}`, createdAt: 1, updatedAt: 1, dispatched: true, ...values,
			};
		}

		function setActivities(a: Artifact, runs: readonly ArtifactRun[]): void {
			a.snapshot.set({ ...a.snapshot.get(), runs }, undefined);
		}

		async function expand(f: Fixture, panel: HTMLElement): Promise<void> {
			button(panel, 'Activities').click();
			await settle(f);
		}

		function rows(panel: HTMLElement): HTMLElement[] {
			return [...panel.querySelectorAll<HTMLElement>('.artifact-activity-row')];
		}

		test('appears only with history, starts collapsed, and remembers expansion across reopening', async () => {
			const f = fixture();
			const a = f.artifact();
			let panel = await open(f, a);
			const hiddenBefore = panel.querySelector<HTMLElement>('.artifact-activities')?.hidden;
			setActivities(a, [activity(a, 'completed')]);
			await settle(f);
			const collapsed = button(panel, 'Activities').getAttribute('aria-expanded');
			const lazy = a.historyRequests.length;
			await expand(f, panel);
			escape(button(panel, 'Activities'));
			panel = await open(f, a);
			const reopened = button(panel, 'Activities').getAttribute('aria-expanded');
			button(panel, 'Activities').focus();
			setActivities(a, []);
			await settle(f);
			assert.deepStrictEqual({
				hiddenBefore, collapsed, lazy, reopened,
				hiddenAfter: panel.querySelector<HTMLElement>('.artifact-activities')?.hidden,
				footer: [...panel.querySelectorAll('.artifact-general-actions [role="button"]')].map(element => element.textContent),
				focus: getActiveElement() === panel,
			}, { hiddenBefore: true, collapsed: 'false', lazy: 0, reopened: 'true', hiddenAfter: true, footer: ['Copy Link', 'Remove Artifact'], focus: true });
		});

		for (const count of [1, 20]) {
			test(`chains wheel scrolling from ${count} activities to the outer panel at both boundaries`, async () => {
				const f = fixture();
				f.host.style.height = '560px';
				const a = f.artifact();
				setActivities(a, Array.from({ length: count }, (_, index) => activity(a, `entry-${index}`, { createdAt: index })));
				const panel = await open(f, a);
				button(panel, 'Autopilot').click();
				await expand(f, panel);
				const outer = panel.querySelector<HTMLElement>('.artifact-details-lower-content')!;
				const inner = panel.querySelector<HTMLElement>('.artifact-activities-list .monaco-scrollable-element')!;
				const contents = inner.querySelector<HTMLElement>('.monaco-list-rows')!;
				const innerScrollTop = () => Math.round(inner.getBoundingClientRect().top - contents.getBoundingClientRect().top);
				const wheel = (deltaY: number) => {
					const event = new mainWindow.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
					// Chromium gives synthetic legacy deltas the wrong sign.
					Object.defineProperty(event, 'wheelDeltaY', { value: -deltaY });
					inner.dispatchEvent(event);
				};
				assert.ok(outer.scrollHeight > outer.clientHeight, 'The outer panel must have content to scroll');
				wheel(10000);
				const first = { inner: innerScrollTop(), outer: outer.scrollTop };
				wheel(10000);
				const bottom = { inner: innerScrollTop(), outer: outer.scrollTop };
				wheel(-10000);
				const backUp = { inner: innerScrollTop(), outer: outer.scrollTop };
				wheel(-10000);
				assert.deepStrictEqual({
					innerScrolledFirst: count > 1 ? first.inner > 0 && first.outer === 0 : first.inner === 0 && first.outer > 0,
					outerScrolledAtBottom: bottom.inner === first.inner && bottom.outer > 0,
					innerScrolledBack: backUp.inner === 0 && (count > 1 ? backUp.outer === bottom.outer : backUp.outer === 0),
					outerScrolledAtTop: outer.scrollTop === 0,
				}, { innerScrolledFirst: true, outerScrolledAtBottom: true, innerScrolledBack: true, outerScrolledAtTop: true },
					JSON.stringify({ first, bottom, backUp, final: { inner: innerScrollTop(), outer: outer.scrollTop }, rowsTop: contents.style.top, outerHeight: outer.clientHeight, outerScrollHeight: outer.scrollHeight }));
			});
		}

		test('shows an accessible right-aligned loaded activity count while collapsed and expanded', async () => {
			const f = fixture();
			const a = f.artifact();
			setActivities(a, [activity(a, 'first')]);
			const panel = await open(f, a);
			const summary = panel.querySelector<HTMLElement>('.artifact-activities-summary')!;
			const collapsed = summary?.textContent;
			await expand(f, panel);
			setActivities(a, [activity(a, 'first'), activity(a, 'second', { createdAt: 2 })]);
			await settle(f);
			const heading = panel.querySelector<HTMLElement>('.artifact-activities .artifact-card-heading')!;
			const title = heading.querySelector<HTMLElement>('.artifact-card-title')!;
			const accessible = store.add(f.controller.getAccessibilityProvider(AccessibleViewType.View)!);
			assert.deepStrictEqual({
				collapsed, expanded: summary?.textContent,
				described: button(panel, 'Activities').getAttribute('aria-description'),
				afterTitle: summary?.getBoundingClientRect().left > title.getBoundingClientRect().right,
				atRight: Math.abs(summary?.getBoundingClientRect().right - heading.getBoundingClientRect().right + 12) < 1,
				accessibleCount: accessible.provideContent().includes('Activities\n2 loaded\n'),
				historyRequests: a.historyRequests,
			}, { collapsed: '1 loaded', expanded: '2 loaded', described: '2 loaded', afterTitle: true, atRight: true, accessibleCount: true, historyRequests: [undefined] });
		});

		test('uses historical labels, newest-first ordering, and inert informational rows', async () => {
			const f = fixture();
			const a = f.artifact();
			setActivities(a, [
				activity(a, 'old', {
					createdAt: 1, presentation: {
						version: 1, source: 'manual', integrationLabel: 'Previous provider',
						action: { label: 'Original Repair Title', iconId: 'tools' }, artifact: a.snapshot.get().artifact, details: [],
					}
				}),
				activity(a, 'new', { actionId: 'merge', actionKind: 'code', state: 'skipped', createdAt: 2, dispatched: false }),
			]);
			const panel = await open(f, a);
			await expand(f, panel);
			rows(panel)[0].click();
			await settle(f);
			const accessible = store.add(f.controller.getAccessibilityProvider(AccessibleViewType.View)!);
			const text = accessible.provideContent();
			assert.deepStrictEqual({
				labels: rows(panel).map(row => row.querySelector('.artifact-activity-label')?.textContent),
				revealable: rows(panel).map(row => row.classList.contains('actionable')),
				panelOpen: panel.isConnected, chats: f.openedChats,
				readingOrder: text.indexOf('Merge Automatically:') < text.indexOf('Activities\n'),
				reasons: text.includes('Activity new') && text.includes('Activity old'),
			}, { labels: ['Merge: Skipped', 'Original Repair Title: Completed'], revealable: [false, false], panelOpen: true, chats: [], readingOrder: true, reasons: true });
		});

		for (const destination of ['turn', 'queued', 'response'] as const) {
			test(`reveals a ${destination} destination through Sessions navigation`, async () => {
				const f = fixture();
				const a = f.artifact();
				const chat = URI.parse('artifact-chat:/opaque?room=two');
				f.registerActivityChat(chat, destination === 'response' ? [{ id: 'response', requestId: 'message' }] : ['message']);
				setActivities(a, [activity(a, 'reveal', {
					chat: chat.toString(), receipt: destination === 'queued' ? { kind: 'queued', queuedMessageId: 'message' } : { kind: 'turn', turnId: 'message' },
				})]);
				const panel = await open(f, a);
				await expand(f, panel);
				rows(panel)[0].click();
				await settle(f);
				assert.deepStrictEqual({
					opened: f.openedChats, revealed: f.revealedActivities, focused: f.focusedActivities,
					panelOpen: panel.isConnected, errors: f.errors, pillFocused: getActiveElement() === a.main,
				}, {
					opened: [chat.toString()], revealed: [destination === 'response' ? 'response' : 'message'],
					focused: [destination === 'response' ? 'response' : 'message'], panelOpen: false, errors: [], pillFocused: false,
				});
			});
		}

		test('standard list keyboard commands navigate rows and reveal only a selected chat destination', async () => {
			const f = fixture();
			const a = f.artifact();
			const chat = URI.parse('artifact-chat:/keyboard');
			f.registerActivityChat(chat, ['message']);
			setActivities(a, [
				activity(a, 'reveal', { chat: chat.toString(), receipt: { kind: 'turn', turnId: 'message' } }),
				activity(a, 'inert', { actionId: 'merge', createdAt: 2 }),
			]);
			const panel = await open(f, a);
			await expand(f, panel);
			const command = async (id: string) => {
				f.instantiation.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
				await settle(f);
			};
			const list = panel.querySelector<HTMLElement>('.artifact-activities-list .monaco-list')!;
			list.focus();
			list.dispatchEvent(new FocusEvent('focus'));
			await command('list.focusFirst');
			await command('list.select');
			const inertOpened = [...f.openedChats];
			await command('list.focusDown');
			const arrowOpened = [...f.openedChats];
			await command('list.select');
			assert.deepStrictEqual({
				inertOpened, arrowOpened, selectedOpened: f.openedChats, revealed: f.revealedActivities, errors: f.errors,
			}, { inertOpened: [], arrowOpened: [], selectedOpened: [chat.toString()], revealed: ['message'], errors: [] });
		});

		test('waits for the destination model after opening and ignores a cached pre-navigation request', async () => {
			const f = fixture();
			const a = f.artifact();
			const chat = URI.parse('artifact-chat:/loading');
			const target = f.registerActivityChat(chat, ['message']);
			const opened = new DeferredPromise<void>();
			f.setOpenChatResult(opened.p);
			setActivities(a, [activity(a, 'reveal', { chat: chat.toString(), receipt: { kind: 'turn', turnId: 'message' } })]);
			const panel = await open(f, a);
			await expand(f, panel);
			rows(panel)[0].click();
			target.setItems([]);
			await opened.complete();
			await settle(f);
			const beforeReady = [...f.revealedActivities];
			target.setItems(['message']);
			await settle(f);
			assert.deepStrictEqual({ beforeReady, afterReady: f.revealedActivities, errors: f.errors }, { beforeReady: [], afterReady: ['message'], errors: [] });
		});

		test('does not steal focus when the user navigates away while a message loads', async () => {
			const f = fixture();
			const a = f.artifact();
			const chat = URI.parse('artifact-chat:/loading');
			const target = f.registerActivityChat(chat, []);
			setActivities(a, [activity(a, 'reveal', { chat: chat.toString(), receipt: { kind: 'turn', turnId: 'message' } })]);
			const panel = await open(f, a);
			await expand(f, panel);
			rows(panel)[0].click();
			await settle(f);
			f.activeSession.set(undefined, undefined);
			target.setItems(['message']);
			await settle(f);
			assert.deepStrictEqual({ revealed: f.revealedActivities, focused: f.focusedActivities, errors: f.errors }, { revealed: [], focused: [], errors: [] });
		});

		test('reports an unavailable chat without navigating or dismissing the panel', async () => {
			const f = fixture();
			const a = f.artifact();
			setActivities(a, [activity(a, 'missing', { chat: 'artifact-chat:/deleted', receipt: { kind: 'turn', turnId: 'message' } })]);
			const panel = await open(f, a);
			await expand(f, panel);
			rows(panel)[0].click();
			await settle(f);
			assert.deepStrictEqual({ errors: f.errors, opened: f.openedChats, panelOpen: panel.isConnected },
				{ errors: ['The artifact operation failed: The chat for this activity is no longer available.'], opened: [], panelOpen: true });
		});

		test('cancel and reconcile refresh their rows without also navigating', async () => {
			const f = fixture();
			const a = f.artifact();
			const chat = URI.parse('artifact-chat:/actions');
			f.registerActivityChat(chat, ['message']);
			setActivities(a, [
				activity(a, 'cancel', { state: 'running', chat: chat.toString(), receipt: { kind: 'turn', turnId: 'message' } }),
				activity(a, 'reconcile', { state: 'interrupted', indeterminate: true, createdAt: 2 }),
			]);
			const panel = await open(f, a);
			await expand(f, panel);
			button(panel, 'Cancel Fix CI: Running').click();
			await settle(f);
			button(panel, 'Reconcile Fix CI: Interrupted').click();
			await settle(f);
			assert.deepStrictEqual({
				cancelled: a.cancelled, reconciled: a.reconciled, opened: f.openedChats, panelOpen: panel.isConnected,
				labels: rows(panel).map(row => row.querySelector('.artifact-activity-label')?.textContent),
				controls: panel.querySelectorAll('.artifact-activity-controls [role="button"]').length, errors: f.errors,
			}, { cancelled: ['cancel'], reconciled: ['reconcile'], opened: [], panelOpen: true, labels: ['Fix CI: Completed', 'Fix CI: Cancelled'], controls: 0, errors: [] });
		});

		test('preserves focused controls when equivalent receipts arrive in a fresh snapshot', async () => {
			const f = fixture();
			const a = f.artifact();
			const run = activity(a, 'running', { state: 'running', chat: 'artifact-chat:/active', receipt: { kind: 'turn', turnId: 'message' } });
			setActivities(a, [run]);
			const panel = await open(f, a);
			await expand(f, panel);
			const cancel = button(panel, 'Cancel Fix CI: Running');
			cancel.focus();
			setActivities(a, [{ ...run, receipt: { kind: 'turn', turnId: 'message' } }]);
			await settle(f);
			assert.deepStrictEqual({ same: button(panel, 'Cancel Fix CI: Running') === cancel, focused: getActiveElement() === cancel }, { same: true, focused: true });
		});

		test('pages older history and prefers newer snapshot values over stale fetched rows', async () => {
			const f = fixture();
			const a = f.artifact();
			const history = Array.from({ length: 60 }, (_, index) => activity(a, `entry-${index}`, { createdAt: index, updatedAt: index, state: 'failed' }));
			a.setHistory(history);
			setActivities(a, [{ ...history[59], state: 'completed', updatedAt: 100 }]);
			const panel = await open(f, a);
			await expand(f, panel);
			const accessible = store.add(f.controller.getAccessibilityProvider(AccessibleViewType.View)!);
			const firstPage = accessible.provideContent();
			const firstSummary = panel.querySelector('.artifact-activities-summary')?.textContent;
			const newest = rows(panel)[0].querySelector('.artifact-activity-label')?.textContent;
			button(panel, 'Earlier Activities').click();
			await settle(f);
			const completeHistory = store.add(f.controller.getAccessibilityProvider(AccessibleViewType.View)!);
			assert.deepStrictEqual({
				requests: a.historyRequests, firstPageCount: firstPage.match(/Activity entry-/g)?.length,
				totalCount: completeHistory.provideContent().match(/Activity entry-/g)?.length, newest,
				summaries: [firstSummary, panel.querySelector('.artifact-activities-summary')?.textContent],
				moreHidden: panel.querySelector<HTMLElement>('.artifact-activities-more')?.hidden,
			}, { requests: [undefined, 'entry-10'], firstPageCount: 50, totalCount: 60, newest: 'Fix CI: Completed', summaries: ['50 loaded', '60 loaded'], moreHidden: true });
		});

		test('retains recent activity on load failures and offers an explicit retry', async () => {
			const f = fixture();
			const a = f.artifact();
			setActivities(a, [activity(a, 'recent')]);
			const failure = new DeferredPromise<{ runs: readonly ArtifactRun[] }>();
			a.setHistoryResult(failure.p);
			const panel = await open(f, a);
			await expand(f, panel);
			await failure.error(new Error('History offline'));
			await settle(f);
			const message = panel.querySelector('.artifact-activities-message')?.textContent;
			const retained = rows(panel).length;
			a.setHistoryResult(undefined);
			button(panel, 'Retry Loading Activities').click();
			await settle(f);
			assert.deepStrictEqual({
				message, retained, requests: a.historyRequests,
				errorHidden: panel.querySelector<HTMLElement>('.artifact-activities-message')?.hidden,
			}, { message: 'Could not load activities: History offline', retained: 1, requests: [undefined, undefined], errorHidden: true });
		});

		test('ignores history completed after switching to another artifact', async () => {
			const f = fixture();
			const a = f.artifact();
			const b = f.artifact('other');
			setActivities(a, [activity(a, 'recent')]);
			const history = new DeferredPromise<{ runs: readonly ArtifactRun[] }>();
			a.setHistoryResult(history.p);
			const oldPanel = await open(f, a);
			await expand(f, oldPanel);
			const panel = await open(f, b);
			await history.complete({ runs: [activity(a, 'stale')] });
			await settle(f);
			assert.deepStrictEqual({
				title: panel.querySelector('h2')?.textContent,
				hidden: panel.querySelector<HTMLElement>('.artifact-activities')?.hidden, rows: rows(panel).length, errors: f.errors,
			}, { title: 'Full title for other', hidden: true, rows: 0, errors: [] });
		});
	});

	test('pills use plain explanatory hovers and acquire no details until clicked', () => {
		const f = fixture();
		const a = f.artifact();
		const hover = f.hovers.get(a.main);
		assert.ok(typeof hover === 'function');
		assert.deepStrictEqual({
			hover: hover().content, acquired: a.acquired, inline: a.entry.get().inlinePill === a.presentation.inlinePill,
			labels: [...a.container.querySelectorAll('.chat-pill-label')].map(element => element.textContent),
			popup: a.main.getAttribute('aria-haspopup'), expanded: a.main.getAttribute('aria-expanded'),
		}, { hover: 'Open: compact status', acquired: [], inline: true, labels: ['#42', '1/2', '1'], popup: 'dialog', expanded: 'false' });
	});

	test('an integration pill shares pointer hovers across its adjacent section buttons', () => {
		const f = fixture();
		const first = f.artifact();
		const second = f.artifact('other');
		const presentation = (container: HTMLElement) => Array.from(f.hovers)
			.filter(([target]) => container.contains(target))
			.map(([target, options]) => ({
				style: (typeof options === 'function' ? options() : options).style,
				groupId: f.hoverGroups.get(target),
			}));
		const firstHovers = presentation(first.container);
		const secondHovers = presentation(second.container);

		assert.deepStrictEqual({
			styles: firstHovers.map(hover => hover.style),
			grouped: !!firstHovers[0].groupId && firstHovers.every(hover => hover.groupId === firstHovers[0].groupId),
			independent: firstHovers[0].groupId !== secondHovers[0].groupId,
		}, { styles: [HoverStyle.Pointer, HoverStyle.Pointer, HoverStyle.Pointer], grouped: true, independent: true });
	});

	test('an integration pill waits for the first hover and shows adjacent section hovers without another delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const f = fixture();
		f.configuration.setUserConfiguration('workbench.hover.delay', 500);
		const hoverService = store.add(f.instantiation.createInstance(HoverService));
		store.add(toDisposable(() => hoverService.hideHover(true)));
		f.instantiation.stub(IHoverService, hoverService);
		const artifact = f.artifact();
		const section = artifact.container.querySelector<HTMLElement>('.chat-pill-sections .chat-pill-button')!;
		const hoverText = () => f.host.querySelector('.monaco-hover')?.textContent;
		artifact.main.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(499);
		const beforeDelay = hoverText();
		await timeout(1);
		const initialHover = hoverText();
		section.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(0);

		assert.deepStrictEqual({
			beforeDelay,
			firstShown: initialHover?.includes('Open: compact status'),
			sectionShownImmediately: !!hoverText() && hoverText() !== initialHover,
		}, { beforeDelay: undefined, firstShown: true, sectionShownImmediately: true });
	}));

	test('main click opens full details; the title navigates and shell actions remain available', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		const before = a.counts();
		panel.querySelector<HTMLElement>('.artifact-details-title-link')!.click();
		button(panel, 'Copy Link').click();
		button(panel, 'Remove Artifact').click();
		await settle(f);
		assert.deepStrictEqual({
			before, after: a.counts(), title: panel.querySelector('h2')?.textContent,
			description: panel.querySelector('.artifact-details-description-content')?.textContent,
			selected: a.container.classList.contains('artifact-pill-selected'), expanded: a.main.getAttribute('aria-expanded'),
			controls: a.main.getAttribute('aria-controls'), rootId: panel.parentElement?.id,
			acquired: a.acquired,
			headerActions: [...panel.querySelectorAll('.artifact-header-actions [role="button"]')].map(element => element.getAttribute('aria-label')),
			footerActions: [...panel.querySelectorAll('.artifact-general-actions [role="button"]')].map(element => element.textContent),
		}, {
			before: { resourceOpens: 0, shellActions: 0 }, after: { resourceOpens: 1, shellActions: 2 },
			title: 'Full title for artifact', description: 'The actual resource description.',
			selected: true, expanded: 'true', controls: f.controller.id, rootId: f.controller.id, acquired: ['main', 'checks', 'comments'],
			headerActions: ['Close Artifact Details'], footerActions: ['Copy Link', 'Remove Artifact'],
		});
	});

	test('list rows show only one line, ellipsize full comment text, and retain state in accessible labels and hovers', async () => {
		const f = fixture();
		f.host.style.width = '470px';
		const a = f.artifact();
		const comment = 'Please preserve keyboard focus after refresh and keep all actions reachable when switching between artifacts. '.repeat(3).trim();
		a.details.checks.set({ ...a.details.checks.get(), items: [a.details.checks.get().items[0]] }, undefined);
		a.details.comments.set({ ...a.details.comments.get(), items: [{ ...a.details.comments.get().items[0], label: comment }] }, undefined);
		const panel = await open(f, a);
		panel.querySelectorAll<HTMLElement>('[role="tab"]')[0].click();
		await settle(f);
		const checkRow = panel.querySelector<HTMLElement>('.monaco-list-row')!;
		const check = { label: checkRow.querySelector('.artifact-details-item-label')?.textContent, height: checkRow.getBoundingClientRect().height, accessibleState: checkRow.getAttribute('aria-label') };
		const hover = f.hovers.get(panel.querySelector<HTMLElement>('.artifact-details-item-labels')!);
		const hoverOptions = typeof hover === 'function' ? hover() : hover;
		panel.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
		await settle(f);
		const commentRow = panel.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .monaco-list-row')!;
		const commentLabel = commentRow.querySelector<HTMLElement>('.artifact-details-item-label')!;
		assert.deepStrictEqual({
			labels: [check.label, commentLabel.textContent],
			secondLines: panel.querySelectorAll('.artifact-details-item-description').length,
			rowHeights: [check.height, commentRow.getBoundingClientRect().height],
			ellipsis: mainWindow.getComputedStyle(commentLabel).textOverflow,
			singleLine: mainWindow.getComputedStyle(commentLabel).whiteSpace,
			overflows: commentLabel.scrollWidth > commentLabel.clientWidth,
			accessibleState: check.accessibleState,
			hoverState: hoverOptions?.content,
		}, {
			labels: ['Lint', comment], secondLines: 0, rowHeights: [28, 28],
			ellipsis: 'ellipsis', singleLine: 'nowrap', overflows: true,
			accessibleState: 'Lint: Failed', hoverState: 'Lint: Failed',
		});
	});

	test('shell footer actions use concise labels while preserving the full accessible target', async () => {
		const f = fixture();
		const a = f.artifact();
		const remove = a.base.toolbarActions![1];
		remove.label = 'Remove Artifact Full title for artifact from Session';
		withChatPillHoverLabel(remove, 'Remove Artifact');
		const panel = await open(f, a);
		const removeButton = button(panel, 'Remove Artifact');
		const hover = f.hovers.get(removeButton);
		const hoverOptions = typeof hover === 'function' ? hover() : hover;
		assert.deepStrictEqual({
			label: removeButton.textContent,
			accessibleLabel: removeButton.getAttribute('aria-label'),
			hover: hoverOptions?.content,
		}, {
			label: 'Remove Artifact',
			accessibleLabel: 'Remove Artifact Full title for artifact from Session',
			hover: 'Remove Artifact Full title for artifact from Session',
		});
	});

	test('state actions prioritize enabled actions stably and update the primary button without replacing focused controls', async () => {
		const f = fixture();
		const a = f.artifact();
		const offered = [{ id: 'merge', enabled: false, disabledReason: 'Checks must pass.' }, { id: 'reviews', enabled: true }, { id: 'fix', enabled: true }];
		updateContribution(a, c => ({ ...c, view: { ...c.view, stateActions: offered } }));
		const panel = await open(f, a);
		const fix = button(panel, 'Fix CI');
		const state = () => ({
			order: [...panel.querySelectorAll('.artifact-state-actions [role="button"]')].map(element => element.textContent),
			primary: [...panel.querySelectorAll('.artifact-state-actions .monaco-button:not(.secondary)')].map(element => element.textContent),
		});
		const before = state();
		fix.focus();
		updateContribution(a, c => ({
			...c, view: {
				...c.view, stateActions: [
					{ id: 'merge', enabled: true }, { id: 'fix', enabled: false, disabledReason: 'Refreshing checks.' }, { id: 'reviews', enabled: true },
				]
			}
		}));
		assert.deepStrictEqual({
			before, after: state(), focused: getActiveElement() === fix, sameButton: fix === button(panel, 'Fix CI'),
			primaryBackground: button(panel, 'Merge').style.backgroundColor,
			quietFooter: [...panel.querySelectorAll('.artifact-general-actions .monaco-button')].every(element => element.classList.contains('secondary')),
			providerOrderUnchanged: offered.map(action => action.id),
		}, {
			before: { order: ['Address Comments', 'Fix CI', 'Merge'], primary: ['Address Comments'] },
			after: { order: ['Merge', 'Address Comments', 'Fix CI'], primary: ['Merge'] },
			focused: true, sameButton: true, primaryBackground: 'var(--vscode-button-background)',
			quietFooter: true, providerOrderUnchanged: ['merge', 'reviews', 'fix'],
		});
	});

	test('an in-flight state action moves behind enabled actions while retaining its focus and identity', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		const fix = button(panel, 'Fix CI');
		fix.focus();
		fix.click();
		await settle(f);
		assert.deepStrictEqual({
			order: [...panel.querySelectorAll('.artifact-state-actions [role="button"]')].map(element => element.textContent),
			primary: panel.querySelector('.artifact-state-actions .monaco-button:not(.secondary)')?.textContent,
			focused: getActiveElement() === fix, sameButton: fix === button(panel, 'Fix CI'), disabled: fix.getAttribute('aria-disabled'),
		}, { order: ['Address Comments', 'Fix CI', 'Merge'], primary: 'Address Comments', focused: true, sameButton: true, disabled: 'true' });
	});

	test('the title uses the provider icon and color and preserves an accessible description of its state', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		const states = [];
		for (const { state, ...icon } of [
			{ id: 'git-pull-request', colorId: chartsGreen, state: 'Open' },
			{ id: 'git-pull-request-draft', colorId: 'descriptionForeground', state: 'Draft' },
			{ id: 'git-merge', colorId: chartsPurple, state: 'Merged' },
		]) {
			updateContribution(a, c => ({ ...c, view: { ...c.view, main: { ...c.view.main!, icon, description: `${state}: Full title for artifact` } } }));
			const glyph = panel.querySelector<HTMLElement>('.artifact-details-title-icon .codicon')!;
			states.push({
				icon: glyph.classList.contains(`codicon-${icon.id}`),
				color: glyph.parentElement?.style.color,
				description: panel.querySelector('h2')?.getAttribute('aria-description'),
			});
		}
		assert.deepStrictEqual(states, [
			{ icon: true, color: 'var(--vscode-charts-green)', description: 'Open: Full title for artifact' },
			{ icon: true, color: 'var(--vscode-descriptionForeground)', description: 'Draft: Full title for artifact' },
			{ icon: true, color: 'var(--vscode-charts-purple)', description: 'Merged: Full title for artifact' },
		]);
	});

	test('the active main pill toggles closed; Escape and Close restore focus to the trigger', async () => {
		const f = fixture();
		const a = f.artifact();
		const results = [];
		for (const method of ['toggle', 'escape', 'close']) {
			const panel = await open(f, a);
			if (method === 'toggle') {
				a.main.click();
			} else if (method === 'escape') {
				const action = button(panel, 'Fix CI');
				action.focus();
				escape(action);
			} else {
				button(panel, 'Close Artifact Details').click();
			}
			results.push({ selected: f.controller.selected.get() !== undefined, focused: getActiveElement() === a.main, expanded: a.main.getAttribute('aria-expanded') });
		}
		assert.deepStrictEqual(results, Array(3).fill({ selected: false, focused: true, expanded: 'false' }));
	});

	test('switching artifacts keeps one context view and has no outside-dismiss/reopen race', async () => {
		const f = fixture();
		const a = f.artifact('first');
		const b = f.artifact('second');
		const first = await open(f, a);
		const root = first.parentElement;
		b.main.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		const second = await open(f, b);
		assert.deepStrictEqual({
			sameRoot: second.parentElement === root, contextShows: f.contextShows(), title: second.querySelector('h2')?.textContent,
			selection: [a, b].map(a => a.container.classList.contains('artifact-pill-selected')),
			firstReleased: a.released, secondAcquired: b.acquired, opens: [a.counts().resourceOpens, b.counts().resourceOpens],
		}, { sameRoot: true, contextShows: 1, title: 'Full title for second', selection: [false, true], firstReleased: ['main', 'checks', 'comments'], secondAcquired: ['main', 'checks', 'comments'], opens: [0, 0] });
	});

	test('outside clicks, including into the input, dismiss without returning focus to the pill', async () => {
		const f = fixture();
		const a = f.artifact();
		await open(f, a);
		f.input.focus();
		f.input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
		await settle(f);
		assert.deepStrictEqual({ selected: f.controller.selected.get(), focusedInput: getActiveElement() === f.input, released: a.released },
			{ selected: undefined, focusedInput: true, released: ['main', 'checks', 'comments'] });
	});

	test('section clicks focus the corresponding list in the whole panel, including repeated clicks', async () => {
		const f = fixture();
		const a = f.artifact();
		const first = await open(f, a, 0);
		const checksFocused = first.querySelector('.artifact-state-list .monaco-list') === getActiveElement();
		const again = await open(f, a, 0);
		const comments = await open(f, a, 1);
		assert.deepStrictEqual({
			same: first === again && first === comments, shows: f.contextShows(), checksFocused,
			commentsFocused: comments.querySelectorAll('.artifact-state-list .monaco-list')[1] === getActiveElement(),
			title: comments.querySelector('h2')?.textContent, actions: comments.querySelectorAll('.artifact-state-actions [role="button"]').length,
		}, { same: true, shows: 1, checksFocused: true, commentsFocused: true, title: 'Full title for artifact', actions: 3 });
	});

	test('Quick Pick renders above artifact details without replacing the artifact context view', async () => {
		const f = fixture();
		f.host.style.height = '450px';
		const quickInput = store.add(f.instantiation.createInstance(QuickInputService));
		f.instantiation.stub(IQuickInputService, quickInput);
		const a = f.artifact();
		updateContribution(a, contribution => ({
			...contribution,
			options: [{
				id: 'merge', kind: 'enum', label: 'Merge Automatically', description: 'Choose an automatic merge policy.',
				actionIds: ['merge'], maxAttempts: 1, defaultValue: 'off', disabledValue: 'off',
				choices: [{ value: 'off', label: 'Off' }, { value: 'ready', label: 'When Ready' }],
			}],
			configuration: { ...contribution.configuration, values: { merge: 'off' } },
		}));
		const panel = await open(f, a);
		button(panel, 'Autopilot').click();
		button(panel, 'When Ready').click();
		await timeout(0);
		const quickWidget = f.host.querySelector<HTMLElement>('.quick-input-widget')!;
		const context = f.contextView.getContextViewElement();
		const pickerBounds = quickWidget.getBoundingClientRect();
		const panelBounds = context.getBoundingClientRect();
		const overlapTop = Math.max(pickerBounds.top, panelBounds.top);
		const overlapBottom = Math.min(pickerBounds.bottom, panelBounds.bottom);
		const overlapLeft = Math.max(pickerBounds.left, panelBounds.left);
		const overlapRight = Math.min(pickerBounds.right, panelBounds.right);
		assert.deepStrictEqual({
			quickPickVisible: !!quickWidget && quickWidget.getClientRects().length > 0,
			quickPickAbove: Number(mainWindow.getComputedStyle(quickWidget).zIndex) > Number(mainWindow.getComputedStyle(context).zIndex),
			samePanel: panel === f.host.querySelector('.artifact-integration-panel'),
			overlaps: overlapBottom > overlapTop && overlapRight > overlapLeft,
			pickerReceivesPointer: quickWidget.contains(mainWindow.document.elementFromPoint((overlapLeft + overlapRight) / 2, (overlapTop + overlapBottom) / 2)),
			configured: a.configured,
		}, { quickPickVisible: true, quickPickAbove: true, samePanel: true, overlaps: true, pickerReceivesPointer: true, configured: [] });
		await quickInput.cancel();
		await timeout(0);
	});

	test('the entire segmented pill changes border color while panel focus has no outer outline', async () => {
		const f = fixture();
		const a = f.artifact();
		const other = f.artifact('other');
		const panel = await open(f, a, 1);
		const segments = [...a.container.querySelectorAll<HTMLElement>('.chat-pill-button')];
		const selected = segments.map(segment => {
			const style = mainWindow.getComputedStyle(segment);
			return { borderTopColor: style.borderTopColor, borderBottomColor: style.borderBottomColor, borderLeftColor: style.borderLeftColor, borderRightColor: style.borderRightColor };
		});
		panel.focus();
		const noPanelOutline = mainWindow.getComputedStyle(panel).outlineStyle === 'none';
		button(panel, 'Fix CI').focus();
		button(panel, 'Fix CI').classList.add('synthetic-focus');
		const actionOutline = mainWindow.getComputedStyle(button(panel, 'Fix CI')).outlineStyle;
		const actionFocused = getActiveElement() === button(panel, 'Fix CI');
		await open(f, other);
		assert.deepStrictEqual({
			borderColors: selected.map(style => [style.borderTopColor, style.borderBottomColor]),
			leftEdge: selected[0].borderLeftColor,
			rightEdge: selected.at(-1)?.borderRightColor,
			noPanelOutline, actionOutline, actionFocused,
			oldPillSelected: a.container.classList.contains('artifact-pill-selected'),
			newPillSelected: other.container.classList.contains('artifact-pill-selected'),
		}, {
			borderColors: Array.from({ length: 3 }, () => ['rgb(0, 122, 204)', 'rgb(0, 122, 204)']),
			leftEdge: 'rgb(0, 122, 204)', rightEdge: 'rgb(0, 122, 204)',
			noPanelOutline: true, actionOutline: 'solid', actionFocused: true, oldPillSelected: false, newPillSelected: true,
		});
	});

	test('a section without a list focuses its linked action, without changing the main title or description', async () => {
		const f = fixture();
		const a = f.artifact();
		updateContribution(a, c => ({ ...c, view: { ...c.view, lists: [], sections: [{ ...c.view.sections[0], id: 'main', detailsId: 'checks' }] } }));
		a.details.checks.set({ ...a.details.checks.get(), items: [] }, undefined);
		const panel = await open(f, a, 0);
		assert.deepStrictEqual({
			focused: getActiveElement() === button(panel, 'Fix CI'), lists: panel.querySelectorAll('.artifact-state-list').length,
			title: panel.querySelector('h2')?.textContent, description: panel.querySelector('.artifact-details-description-content')?.textContent,
		}, { focused: true, lists: 0, title: 'Full title for artifact', description: 'The actual resource description.' });
	});

	test('legacy main and section item lists stay distinct even when a section is named main', async () => {
		const f = fixture();
		const a = f.artifact();
		updateContribution(a, c => ({ ...c, view: { ...c.view, lists: undefined, sections: [{ ...c.view.sections[0], id: 'main' }] } }));
		a.details.main.set({ ...a.details.main.get(), items: [{ ...a.details.checks.get().items[0], id: 'overview-item', label: 'Overview item' }] }, undefined);
		const panel = await open(f, a, 0);
		assert.deepStrictEqual({
			titles: [...panel.querySelectorAll('[role="tab"]')].map(element => element.textContent),
			focused: panel.querySelectorAll('.artifact-state-list .monaco-list')[1] === getActiveElement(),
		}, { titles: ['Full title for artifact', 'Checks'], focused: true });
	});

	test('detail leases and section, action and control identities survive refresh, including disabled switch focus', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a, 0);
		const section = a.container.querySelector('.artifact-pill-sections [role="button"]');
		const action = button(panel, 'Fix CI');
		const toggle = panel.querySelector<HTMLElement>('.artifact-autopilot-rule [role="switch"]')!;
		const label = panel.querySelector<HTMLElement>('.artifact-autopilot-rule-label')!;
		button(panel, 'Autopilot').click();
		toggle.focus();
		const original = a.snapshot.get();
		const originalDetails = a.details.checks.get();
		const results = [];
		for (const loading of [true, false]) {
			transaction(tx => {
				a.snapshot.set({
					...original, contributions: original.contributions.map(c => ({
						...c, view: {
							...c.view, availability: { kind: loading ? 'loading' : 'available' },
							stateActions: c.view.stateActions.map(action => ({ ...action, enabled: !loading && action.enabled, disabledReason: loading ? 'Refreshing state' : action.disabledReason })),
							automationAvailability: c.view.automationAvailability.map(option => ({ ...option, available: !loading, unavailableReason: loading ? 'Refreshing state' : undefined })),
						},
					}))
				}, tx);
				a.details.checks.set({ ...originalDetails, availability: { kind: loading ? 'loading' : 'available' } }, tx);
			});
			results.push({
				sameSection: section === a.container.querySelector('.artifact-pill-sections [role="button"]'),
				sameAction: action === button(panel, 'Fix CI'), sameToggle: toggle === panel.querySelector('.artifact-autopilot-rule [role="switch"]'),
				focused: getActiveElement() === (loading ? label : toggle), disabled: action.getAttribute('aria-disabled'),
				acquired: a.acquired.length, released: a.released.length,
			});
		}
		assert.deepStrictEqual(results, [
			{ sameSection: true, sameAction: true, sameToggle: true, focused: true, disabled: 'true', acquired: 3, released: 0 },
			{ sameSection: true, sameAction: true, sameToggle: true, focused: true, disabled: 'false', acquired: 3, released: 0 },
		]);
	});

	test('refresh does not reclaim focus after the user moves to another control', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		panel.querySelector<HTMLElement>('.artifact-autopilot-rule [role="switch"]')!.focus();
		const original = a.snapshot.get().contributions[0];
		updateContribution(a, c => ({ ...c, view: { ...c.view, automationAvailability: c.view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: 'Refreshing' })) } }));
		button(panel, 'Copy Link').focus();
		updateContribution(a, () => original);
		assert.strictEqual(getActiveElement(), button(panel, 'Copy Link'));
	});

	test('late detail acquisitions are disposed and cannot replace another artifact', async () => {
		const f = fixture();
		const a = f.artifact('first');
		const b = f.artifact('second');
		const pending = new DeferredPromise<void>();
		a.setAcquireResult(pending.p);
		await open(f, a);
		const panel = await open(f, b);
		await pending.complete();
		await settle(f);
		assert.deepStrictEqual({ title: panel.querySelector('h2')?.textContent, released: a.released, selected: f.controller.selected.get() === b.presentation },
			{ title: 'Full title for second', released: ['main', 'checks', 'comments'], selected: true });
	});

	test('omitted state actions stay hidden, while saved automation remains revocable', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		button(panel, 'Fix CI').focus();
		updateContribution(a, c => ({
			...c, configuration: { ...c.configuration, values: { ...c.configuration.values, fix: true } },
			view: { ...c.view, stateActions: [], automationAvailability: c.view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: 'Unavailable' })) },
		}));
		const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
		const before = { actions: panel.querySelectorAll('.artifact-state-actions [role="button"]').length, checked: toggle.getAttribute('aria-checked') === 'true', disabled: toggle.disabled };
		toggle.click();
		await settle(f);
		assert.deepStrictEqual({ before, configured: a.configured, invoked: a.invoked },
			{ before: { actions: 0, checked: true, disabled: false }, configured: [{ integrationId: 'test', revision: 4, values: { fix: false } }], invoked: [] });
	});

	test('switch writes retain identity, report rejected writes, and never run the action', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
		toggle.click();
		await settle(f);
		a.setConfigureResult(Promise.reject(new Error('Consent failed')));
		toggle.click();
		await settle(f);
		assert.deepStrictEqual({
			same: toggle === panel.querySelector('.artifact-autopilot-rule [role="switch"]'), checked: toggle.getAttribute('aria-checked') === 'true', configured: a.configured,
			errors: f.errors, invoked: a.invoked,
		}, {
			same: true, checked: true, configured: [
				{ integrationId: 'test', revision: 4, values: { fix: true } }, { integrationId: 'test', revision: 5, values: { fix: false } },
			], errors: ['The artifact operation failed: Consent failed'], invoked: [],
		});
	});

	test('new-consent restrictions never prevent revoking a previously enabled rule', async () => {
		const f = fixture();
		const a = f.artifact();
		updateContribution(a, c => ({
			...c, configuration: { ...c.configuration, values: { ...c.configuration.values, fix: true } },
			view: { ...c.view, automationAvailability: c.view.automationAvailability.map(option => ({ ...option, enablement: { enabled: false, disabledReason: 'A new schedule requires a running experiment.' } })) },
		}));
		const panel = await open(f, a);
		const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
		toggle.click();
		await settle(f);
		assert.deepStrictEqual({ values: a.configured.map(change => change.values), checked: toggle.getAttribute('aria-checked') === 'true', disabled: toggle.disabled },
			{ values: [{ fix: false }], checked: false, disabled: true });
	});

	test('manual actions use the invoking chat, ignore repeated requests, and follow per-chat availability', async () => {
		const f = fixture();
		const a = f.artifact();
		updateContribution(a, c => ({
			...c, view: {
				...c.view, stateActions: c.view.stateActions.map(action => action.id === 'fix'
					? { ...action, chatAvailability: { 'second-chat': { enabled: true } } } : action)
			}
		}));
		const panel = await open(f, a);
		button(panel, 'Fix CI').click();
		a.chat.set('second-chat', undefined);
		button(panel, 'Fix CI').click();
		button(panel, 'Fix CI').click();
		await settle(f);
		assert.deepStrictEqual({ invoked: a.invoked, configured: a.configured, disabled: button(panel, 'Fix CI').getAttribute('aria-disabled') },
			{ invoked: [{ integrationId: 'test', actionId: 'fix', chat: 'second-chat' }], configured: [], disabled: 'true' });
	});

	test('list rows float their item actions, which run on that item without opening it or closing the panel', async () => {
		const f = fixture();
		f.host.style.width = '470px';
		const a = f.artifact();
		a.details.checks.set({
			...a.details.checks.get(), itemActions: [{ id: 'rerun', label: 'Rerun Check', iconId: 'debug-rerun' }],
			items: a.details.checks.get().items.map(item => ({ ...item, actions: ['rerun'] })),
		}, undefined);
		const details = store.add(f.instantiation.createInstance(ArtifactDetailsModel, a.presentation, () => { }));
		const finish = new DeferredPromise<void>();
		a.setItemActionResult(finish.p);
		// The status section focuses the checks list and its first row, which reveals that row's actions.
		const panel = await open(f, a, 0);
		const rows = () => [...panel.querySelectorAll<HTMLElement>('[role="tabpanel"]:not([hidden]) .artifact-details-item')].map(row => {
			const actions = row.querySelector<HTMLElement>('.artifact-details-item-actions')!;
			const bounds = row.getBoundingClientRect();
			const actionBounds = actions.getBoundingClientRect();
			const visible = mainWindow.getComputedStyle(actions).display !== 'none';
			return {
				label: row.querySelector('.artifact-details-item-label')?.textContent, visible,
				actions: [...row.querySelectorAll<HTMLElement>('.action-label')].map(action => [action.getAttribute('aria-label'), action.classList.contains('disabled')]),
				...visible ? {
					trailing: actionBounds.left >= row.querySelector('.artifact-details-item-labels')!.getBoundingClientRect().right && actionBounds.right <= bounds.right,
					centered: Math.abs((actionBounds.top + actionBounds.bottom) / 2 - (bounds.top + bounds.bottom) / 2) <= 1,
				} : {},
			};
		});
		const before = rows();
		const action = panel.querySelector<HTMLElement>('.artifact-details-item-actions .action-label')!;
		action.focus();
		const focused = getActiveElement() === action;
		action.click();
		await settle(f);
		const running = rows();
		const focusKept = focused && getActiveElement() === panel.querySelector('.artifact-details-item-actions .action-label') && !action.isConnected;
		await finish.complete();
		await settle(f);
		assert.deepStrictEqual({
			before, running, after: rows(), focusKept, calls: a.itemActions, invoked: a.invoked, opened: f.openedItems, open: f.controller.selected.get() === a.presentation,
			accessible: details.data.get().accessibleText.split('\n').filter(line => line.startsWith('Lint')),
		}, {
			before: [
				{ label: 'Lint', visible: true, actions: [['Rerun Check', false]], trailing: true, centered: true },
				{ label: 'Build', visible: false, actions: [['Rerun Check', false]] },
			],
			// Only the targeted item is busy; the same action stays available on other items.
			running: [
				{ label: 'Lint', visible: true, actions: [['Rerun Check. Running', true]], trailing: true, centered: true },
				{ label: 'Build', visible: false, actions: [['Rerun Check', false]] },
			],
			after: [
				{ label: 'Lint', visible: true, actions: [['Rerun Check', false]], trailing: true, centered: true },
				{ label: 'Build', visible: false, actions: [['Rerun Check', false]] },
			],
			focusKept: true,
			calls: [{ detailsId: 'checks', itemId: 'lint', actionId: 'rerun' }], invoked: [], opened: [], open: true,
			accessible: ['Lint: Failed (actions: Rerun Check)'],
		});
	});

	test('resolving a comment removes its row as soon as the provider reports it, and focus moves to the next comment', async () => {
		const f = fixture();
		const a = f.artifact();
		const first = a.details.comments.get().items[0];
		a.details.comments.set({
			...a.details.comments.get(), itemActions: [{ id: 'resolve', label: 'Resolve Comment', iconId: 'check' }],
			items: [first, { ...first, id: 'second', label: 'Cover keyboard navigation' }].map(item => ({ ...item, actions: ['resolve'] })),
		}, undefined);
		const result = new DeferredPromise<void>();
		a.setItemActionResult(result.p);
		const panel = await open(f, a, 1);
		const action = panel.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .artifact-details-item-actions .action-label')!;
		action.focus();
		action.click();
		a.details.comments.set({ ...a.details.comments.get(), items: a.details.comments.get().items.slice(1) }, undefined);
		await settle(f);
		await result.complete();
		await settle(f);
		const list = panel.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .monaco-list')!;
		assert.deepStrictEqual({
			rows: [...list.querySelectorAll('.artifact-details-item-label')].map(label => label.textContent),
			focus: getActiveElement() === list, focusedRow: list.querySelector('.monaco-list-row.focused .artifact-details-item-label')?.textContent,
			open: f.controller.selected.get() === a.presentation, errors: f.errors,
		}, { rows: ['Cover keyboard navigation'], focus: true, focusedRow: 'Cover keyboard navigation', open: true, errors: [] });
	});

	function withRerunActions(a: Artifact): void {
		a.details.checks.set({
			...a.details.checks.get(), itemActions: [{ id: 'rerun', label: 'Rerun Check', iconId: 'debug-rerun' }],
			items: a.details.checks.get().items.map(item => ({ ...item, actions: ['rerun'] })),
		}, undefined);
	}

	function itemRow(panel: HTMLElement, label: string): HTMLElement {
		const row = [...panel.querySelectorAll<HTMLElement>('[role="tabpanel"]:not([hidden]) .monaco-list-row')].find(row => row.querySelector('.artifact-details-item-label')?.textContent === label);
		assert.ok(row, `Missing row: ${label}`);
		return row;
	}

	/** Moves list focus like the Down Arrow keybinding, which workbench lists handle through commands. */
	function focusNextRow(f: Fixture, panel: HTMLElement): void {
		const element = panel.querySelector('[role="tabpanel"]:not([hidden]) .monaco-list');
		const list = f.lists.find(list => list.getHTMLElement() === element);
		assert.ok(list);
		list.focusNext();
	}

	test('only the focused row\'s actions are in the tab order, even when another row is selected and shows its actions', async () => {
		const f = fixture();
		const a = f.artifact();
		withRerunActions(a);
		const panel = await open(f, a, 0);
		itemRow(panel, 'Lint').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle(f);
		focusNextRow(f, panel);
		await settle(f);
		const rows = ['Lint', 'Build'].map(label => {
			const row = itemRow(panel, label);
			const action = row.querySelector<HTMLElement>('.artifact-details-item-actions .action-label')!;
			return {
				label, selected: row.classList.contains('selected'), focused: row.classList.contains('focused'),
				visible: mainWindow.getComputedStyle(row.querySelector('.artifact-details-item-actions')!).display !== 'none', tabIndex: action.tabIndex,
			};
		});
		assert.deepStrictEqual(rows, [
			{ label: 'Lint', selected: true, focused: false, visible: true, tabIndex: -1 },
			{ label: 'Build', selected: false, focused: true, visible: true, tabIndex: 0 },
		]);
	});

	test('a focused row action follows its item when the list reorders', async () => {
		const f = fixture();
		const a = f.artifact();
		withRerunActions(a);
		const panel = await open(f, a, 0);
		focusNextRow(f, panel);
		await settle(f);
		itemRow(panel, 'Build').querySelector<HTMLElement>('.artifact-details-item-actions .action-label')!.focus();
		a.details.checks.set({ ...a.details.checks.get(), items: [...a.details.checks.get().items].reverse() }, undefined);
		await settle(f);
		const active = getActiveElement();
		assert.ok(isHTMLElement(active));
		const focusedRow = active.closest('.monaco-list-row')?.querySelector('.artifact-details-item-label')?.textContent;
		active.click();
		await settle(f);
		assert.deepStrictEqual({
			order: [...panel.querySelectorAll('[role="tabpanel"]:not([hidden]) .artifact-details-item-label')].map(label => label.textContent),
			focusedRow, action: active.getAttribute('aria-label'), calls: a.itemActions,
		}, {
			order: ['Build', 'Lint'], focusedRow: 'Build', action: 'Rerun Check',
			calls: [{ detailsId: 'checks', itemId: 'build', actionId: 'rerun' }],
		});
	});

	test('item action failures are reported and leave the action available', async () => {
		const f = fixture();
		const a = f.artifact();
		a.details.comments.set({
			...a.details.comments.get(), itemActions: [{ id: 'resolve', label: 'Resolve Comment', iconId: 'check' }],
			items: a.details.comments.get().items.map(item => ({ ...item, actions: ['resolve'] })),
		}, undefined);
		const result = new DeferredPromise<void>();
		a.setItemActionResult(result.p);
		const panel = await open(f, a, 1);
		panel.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .artifact-details-item-actions .action-label')!.click();
		await result.error(new Error('This review thread is already resolved.'));
		await settle(f);
		const action = panel.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .artifact-details-item-actions .action-label')!;
		assert.deepStrictEqual({ calls: a.itemActions, errors: f.errors, action: [action.getAttribute('aria-label'), action.classList.contains('disabled')] }, {
			calls: [{ detailsId: 'comments', itemId: 'review', actionId: 'resolve' }],
			errors: ['The artifact operation failed: This review thread is already resolved.'],
			action: ['Resolve Comment', false],
		});
	});

	test('native actions dismiss before invocation so confirmation dialogs own focus', async () => {
		const f = fixture();
		const a = f.artifact();
		updateContribution(a, c => ({ ...c, view: { ...c.view, stateActions: c.view.stateActions.map(action => ({ ...action, enabled: true })) } }));
		const panel = await open(f, a);
		let closedBeforeInvoke = false;
		a.onInvoke(() => { closedBeforeInvoke = f.controller.selected.get() === undefined; });
		button(panel, 'Merge').click();
		await settle(f);
		assert.deepStrictEqual({ closedBeforeInvoke, invoked: a.invoked.map(action => action.actionId) }, { closedBeforeInvoke: true, invoked: ['merge'] });
	});

	test('authentication removes prior resource details but keeps enabled automation revocable and offers recovery', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		updateContribution(a, c => ({
			...c, authentication: { enabled: true }, configuration: { ...c.configuration, values: { ...c.configuration.values, fix: true } },
			view: { ...c.view, availability: { kind: 'authenticationRequired', reason: 'Sign in to GitHub.' }, sections: [], lists: [] },
		}));
		const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
		button(panel, 'Sign In').click();
		await settle(f);
		assert.deepStrictEqual({
			title: panel.querySelector('h2')?.textContent, description: panel.querySelector('.artifact-details-description-content')?.textContent,
			state: panel.querySelector('.artifact-details-availability')?.textContent, lists: panel.querySelectorAll('.artifact-state-list').length,
			revocable: toggle.getAttribute('aria-checked') === 'true' && !toggle.disabled, authentications: a.authentications, releases: a.released,
		}, { title: 'Recorded artifact', description: '', state: 'Sign in to GitHub.', lists: 0, revocable: true, authentications: ['test'], releases: ['main', 'checks', 'comments'] });
	});

	test('sign-in cancellation stays quiet and sign-in errors are explicit', async () => {
		const f = fixture();
		const a = f.artifact();
		updateContribution(a, c => ({ ...c, authentication: { enabled: true }, view: { ...c.view, availability: { kind: 'authenticationRequired', reason: 'Sign in.' }, sections: [], lists: [] } }));
		const panel = await open(f, a);
		a.setAuthenticationResult(Promise.reject(new CancellationError()));
		button(panel, 'Sign In').click();
		await settle(f);
		a.setAuthenticationResult(Promise.reject(new Error('Authentication failed')));
		button(panel, 'Sign In').click();
		await settle(f);
		assert.deepStrictEqual({ errors: f.errors, acquired: a.acquired, requests: a.authentications }, { errors: ['The artifact operation failed: Authentication failed'], acquired: [], requests: ['test', 'test'] });
	});

	test('missing descriptions never fall back to a status sentence, and errors stay visible', async () => {
		const f = fixture();
		const a = f.artifact();
		a.details.main.set({ ...a.details.main.get(), description: '' }, undefined);
		a.details.comments.set({ ...a.details.comments.get(), items: [], availability: { kind: 'error', reason: 'Reviews could not be loaded.' } }, undefined);
		const panel = await open(f, a);
		assert.deepStrictEqual({
			description: panel.querySelector('.artifact-details-description-content')?.textContent,
			error: panel.querySelectorAll('.artifact-state-list-message')[1]?.textContent,
			expand: panel.querySelector('.artifact-description-actions') === null,
		}, { description: 'No description provided.', error: 'Reviews could not be loaded.', expand: true });
	});

	test('a short description has no expansion control; remote Markdown is rendered safely as plain text', async () => {
		const f = fixture();
		const a = f.artifact();
		a.details.main.set({ ...a.details.main.get(), description: '**Actual** description. <img src="https://example.test/tracker"> [Unsafe](command:evil)', descriptionFormat: 'markdown' }, undefined);
		const panel = await open(f, a);
		assert.deepStrictEqual({
			description: panel.querySelector('.artifact-details-description-content')?.textContent,
			executableContent: panel.querySelectorAll('.artifact-details-description img, .artifact-details-description a[href]').length,
			expand: panel.querySelector('.artifact-description-actions') === null,
		}, { description: 'Actual description.  Unsafe', executableContent: 0, expand: true });
	});

	test('the overlay matches composer edges, does not reflow it, and reanchors after composer resize', async () => {
		const f = fixture();
		const a = f.artifact();
		const before = { input: f.input.getBoundingClientRect().toJSON(), row: f.row.getBoundingClientRect().toJSON() };
		const panel = await open(f, a);
		const overlay = panel.parentElement!;
		const first = overlay.getBoundingClientRect();
		const input = f.input.getBoundingClientRect();
		const after = { input: input.toJSON(), row: f.row.getBoundingClientRect().toJSON() };
		f.host.style.width = '540px';
		f.row.style.bottom = '220px';
		f.input.style.height = '180px';
		await settle(f);
		const resized = overlay.getBoundingClientRect();
		const resizedInput = f.input.getBoundingClientRect();
		assert.deepStrictEqual({
			noReflow: JSON.stringify(before) === JSON.stringify(after),
			aligned: first.left === input.left && first.right === input.right,
			resized: resized.left === resizedInput.left && resized.right === resizedInput.right,
			gap: Math.round(f.row.getBoundingClientRect().top - resized.bottom),
		}, { noReflow: true, aligned: true, resized: true, gap: 8 }, JSON.stringify({ first: first.toJSON(), input: input.toJSON(), resized: resized.toJSON(), resizedInput: resizedInput.toJSON() }));
	});

	test('list rows open only their resource and reject executable links', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a, 0);
		const list = panel.querySelector<HTMLElement>('.artifact-details-list .monaco-list')!;
		list.querySelector<HTMLElement>('.monaco-list-row')!.click();
		await settle(f);
		a.details.checks.set({ ...a.details.checks.get(), items: [{ ...a.details.checks.get().items[0], resource: 'command:evil' }] }, undefined);
		list.querySelector<HTMLElement>('.monaco-list-row')!.click();
		await settle(f);
		assert.deepStrictEqual({ opened: f.openedItems, resourceOpens: a.counts().resourceOpens, errors: f.errors },
			{ opened: ['https://example.test/lint'], resourceOpens: 0, errors: ['The artifact operation failed: This artifact link cannot be opened.'] });
	});

	test('state lists use standard workbench keyboard navigation and opening commands', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a, 0);
		const helpScoped = f.instantiation.invokeFunction(accessor => accessor.get(IContextKeyService).getContext(getActiveElement()).getValue('artifactDetailsFocused'));
		panel.querySelector<HTMLElement>('.artifact-details-list .monaco-list')!.dispatchEvent(new mainWindow.FocusEvent('focus'));
		f.instantiation.invokeFunction(CommandsRegistry.getCommand('list.focusDown')!.handler);
		await timeout(0);
		f.instantiation.invokeFunction(CommandsRegistry.getCommand('list.select')!.handler);
		await settle(f);
		assert.deepStrictEqual({
			opened: f.openedItems, focused: panel.querySelector('.artifact-details-list .monaco-list-row.focused .artifact-details-item-label')?.textContent, helpScoped,
		}, { opened: ['https://example.test/build'], focused: 'Build', helpScoped: true });
	});

	test('provider-qualified list, action and control IDs stay distinct when integrations use the same IDs', async () => {
		const f = fixture();
		const a = f.artifact();
		const contribution = a.snapshot.get().contributions[0];
		a.snapshot.set({
			...a.snapshot.get(), contributions: [contribution, {
				...contribution, integrationId: 'second',
				actions: [{ ...contribution.actions[0], label: 'Second Fix' }], options: [contribution.options[0]],
				view: { ...contribution.view, main: undefined, sections: [], lists: [contribution.view.lists![0]], stateActions: [contribution.view.stateActions[0]] },
			}]
		}, undefined);
		const panel = await open(f, a);
		const lists = panel.querySelectorAll('.artifact-state-list');
		const group = panel.querySelectorAll<HTMLElement>('.artifact-autopilot-group')[1];
		group.querySelector<HTMLElement>('.artifact-card-disclosure')!.click();
		group.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!.click();
		button(panel, 'Second Fix').click();
		await settle(f);
		assert.deepStrictEqual({
			lists: lists.length, configured: a.configured.map(change => change.integrationId), invoked: a.invoked.map(action => action.integrationId),
		}, { lists: 3, configured: ['second'], invoked: ['second'] });
	});

	test('a failed detail acquisition stays explicit and authentication recovery reacquires fresh details', async () => {
		const f = fixture();
		const a = f.artifact();
		a.setAcquireResult(Promise.reject(new Error('Details unavailable')));
		const panel = await open(f, a);
		const failed = panel.querySelector('.artifact-details-availability')?.textContent;
		const original = a.snapshot.get().contributions[0];
		updateContribution(a, c => ({ ...c, authentication: { enabled: true }, view: { ...c.view, availability: { kind: 'authenticationRequired', reason: 'Sign in.' }, sections: [], lists: [] } }));
		a.setAcquireResult(Promise.resolve());
		updateContribution(a, () => original);
		await settle(f);
		assert.deepStrictEqual({ failed, title: panel.querySelector('h2')?.textContent, acquired: a.acquired.length },
			{ failed: 'Details unavailable', title: 'Full title for artifact', acquired: 6 });
	});

	test('accessible view includes full offscreen content and restores the same panel and focused control', async () => {
		const f = fixture();
		const a = f.artifact();
		a.details.checks.set({ ...a.details.checks.get(), items: Array.from({ length: 30 }, (_, index) => ({ ...a.details.checks.get().items[0], id: `item-${index}`, label: `Offscreen item ${index}` })) }, undefined);
		const panel = await open(f, a);
		const control = panel.querySelector<HTMLElement>('.artifact-autopilot-rule [role="switch"]')!;
		button(panel, 'Autopilot').click();
		control.focus();
		const provider = new ArtifactDetailsAccessibleView().getProvider();
		assert.ok(provider);
		const text = provider.provideContent();
		provider.onOpen?.();
		f.contextView.showContextView({ getAnchor: () => f.input, render: () => toDisposable(() => { }) });
		const retained = a.released.length === 0;
		provider.onClose();
		f.contextView.hideContextView();
		provider.dispose();
		await settle(f);
		const help = new ArtifactDetailsAccessibilityHelp().getProvider();
		assert.ok(help);
		assert.deepStrictEqual({
			content: ['Full title for artifact', 'The actual resource description.', 'Preserve focus after refresh', 'Offscreen item 29', 'Auto Fix CI'].every(value => text.includes(value)),
			retained, samePanel: f.host.querySelector('.artifact-integration-panel') === panel, focused: getActiveElement() === control,
			help: help.options.type, verbosity: help.verbositySettingKey,
		}, { content: true, retained: true, samePanel: true, focused: true, help: AccessibleViewType.Help, verbosity: 'accessibility.verbosity.panelChat' });
		help.dispose();
	});

	test('Tab and Shift+Tab stay within the non-modal dialog, with Escape as the return route', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		const first = panel.querySelector<HTMLElement>('.artifact-details-title-link')!;
		const last = button(panel, 'Remove Artifact');
		last.focus();
		last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
		const forward = getActiveElement() === first;
		first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true }));
		assert.deepStrictEqual({ forward, backward: getActiveElement() === last, role: panel.parentElement?.getAttribute('role'), modal: panel.parentElement?.getAttribute('aria-modal') },
			{ forward: true, backward: true, role: 'dialog', modal: 'false' });
	});

	test('chat verbosity controls the dialog help hint without changing its accessible content', async () => {
		const f = fixture();
		const a = f.artifact();
		const panel = await open(f, a);
		const root = panel.parentElement!;
		const enabled = root.getAttribute('aria-description');
		await f.configuration.setUserConfiguration('accessibility.verbosity.panelChat', false);
		f.configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override readonly source = ConfigurationTarget.USER;
			override readonly affectedKeys = new Set(['accessibility.verbosity.panelChat']);
			override affectsConfiguration(section: string): boolean { return section === 'accessibility.verbosity.panelChat'; }
		}());
		const provider = f.controller.getAccessibilityProvider(AccessibleViewType.View);
		assert.deepStrictEqual({ enabled, disabled: root.getAttribute('aria-description'), content: provider?.provideContent().includes('Full title for artifact') },
			{ enabled: `Use ${f.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel()} for artifact details accessibility help.`, disabled: '', content: true });
		provider?.dispose();
	});

	test('hiding AI features closes the panel and prevents reopening; disposing a selected artifact releases it', async () => {
		const f = fixture();
		const a = f.artifact();
		await open(f, a);
		f.sentiment.set({ hidden: true }, undefined);
		a.main.click();
		const hidden = f.controller.selected.get() === undefined;
		f.sentiment.set({ hidden: false }, undefined);
		await open(f, a);
		a.presentation.dispose();
		assert.deepStrictEqual({ hidden, disposed: f.controller.selected.get(), released: a.released.length }, { hidden: true, disposed: undefined, released: 6 });
	});

	test('an empty integration registry leaves the original entry unchanged', () => {
		const f = fixture();
		const a = f.artifact();
		a.snapshot.set({ ...a.snapshot.get(), contributions: [] }, undefined);
		assert.strictEqual(a.entry.get(), a.base);
	});

	suite('Tabbed details and Autopilot', () => {
		function automationBadge(a: Artifact): HTMLElement | null {
			return a.container.querySelector<HTMLElement>('.artifact-pill-sections [aria-label^="Show Autopilot:"]');
		}

		function useEnumAutomation(a: Artifact, value = 'off'): void {
			updateContribution(a, contribution => ({
				...contribution, options: [{
					id: 'merge', kind: 'enum', label: 'Merge Automatically When Ready', description: 'Choose a merge policy.',
					actionIds: ['merge'], maxAttempts: 1, defaultValue: 'off', disabledValue: 'off',
					choices: [{ value: 'off', label: 'Off' }, { value: 'always', label: 'Always' }, { value: 'ifUnchanged', label: 'When No Changes Were Made' }],
				}],
				configuration: { ...contribution.configuration, values: { merge: value } },
			}));
		}

		test('the trailing pill section counts saved boolean and enum rules once per provider', async () => {
			const f = fixture();
			const a = f.artifact();
			const absent = automationBadge(a) === null;
			updateContribution(a, contribution => ({
				...contribution,
				options: [...contribution.options.filter(option => option.id !== 'merge'), {
					id: 'merge', kind: 'enum', label: 'Merge Policy', description: 'Choose when merging is allowed.',
					actionIds: ['merge'], maxAttempts: 1, defaultValue: 'never', disabledValue: 'never',
					choices: [{ value: 'never', label: 'Off' }, { value: 'always', label: 'Always' }, { value: 'ifUnchanged', label: 'When No Changes Were Made' }],
				}, {
					id: 'shared', kind: 'boolean', label: 'Repair Both', description: 'Repair checks and reviews.',
					actionIds: ['fix', 'reviews'], maxAttempts: 1, defaultValue: false,
				}],
				configuration: { ...contribution.configuration, values: { fix: true, reviews: false, merge: 'always', shared: true } },
			}));
			const badge = automationBadge(a)!;
			const initial = badge.textContent;
			updateContribution(a, contribution => ({
				...contribution, authentication: { enabled: true },
				view: { ...contribution.view, availability: { kind: 'authenticationRequired', reason: 'Reconnect.' }, stateActions: [], automationAvailability: [] },
			}));
			const retainedWhileUnavailable = badge === automationBadge(a) && badge.textContent === '3';
			const first = a.snapshot.get().contributions[0];
			a.snapshot.set({
				...a.snapshot.get(), contributions: [first, {
					...first, integrationId: 'second', options: first.options.filter(option => option.id === 'fix'),
					configuration: { ...first.configuration, values: { fix: true } },
				}],
			}, undefined);
			const multipleProviders = badge.textContent;
			updateContribution(a, contribution => ({ ...contribution, configuration: { ...contribution.configuration, values: { fix: false, reviews: false, merge: 'never', shared: false } } }));
			assert.deepStrictEqual({
				absent, initial, retainedWhileUnavailable, multipleProviders,
				hasAutomationIcon: !!badge.querySelector('.codicon-robot'), removed: automationBadge(a) === null,
			}, { absent: true, initial: '3', retainedWhileUnavailable: true, multipleProviders: '4', hasAutomationIcon: true, removed: true });
		});

		test('the Autopilot pill section opens, expands and focuses Autopilot without toggling the panel closed', async () => {
			const f = fixture();
			const a = f.artifact();
			updateContribution(a, contribution => ({ ...contribution, configuration: { ...contribution.configuration, values: { ...contribution.configuration.values, fix: true } } }));
			const badge = automationBadge(a)!;
			const lastSection = badge === a.container.querySelector('.artifact-pill-sections')?.lastElementChild;
			badge.click();
			await settle(f);
			const panel = f.host.querySelector<HTMLElement>('.artifact-integration-panel')!;
			const heading = button(panel, 'Autopilot');
			const help = store.add(f.controller.getAccessibilityProvider(AccessibleViewType.Help)!);
			const labels = {
				badge: badge.getAttribute('aria-label'),
				master: panel.querySelector('.artifact-card-heading [role="switch"]')?.getAttribute('aria-label'),
				help: help.provideContent().includes('Autopilot is collapsed by default'),
			};
			const focused = getActiveElement() === heading;
			heading.click();
			badge.click();
			badge.click();
			await settle(f);
			const expanded = heading.getAttribute('aria-expanded');
			const focusedAgain = getActiveElement() === heading;
			updateContribution(a, contribution => ({ ...contribution, configuration: { ...contribution.configuration, values: { ...contribution.configuration.values, fix: false } } }));
			await settle(f);
			const samePanel = panel === f.host.querySelector('.artifact-integration-panel');
			escape(heading);
			assert.deepStrictEqual({
				labels, lastSection, focused, expanded, focusedAgain, samePanel, views: f.contextShows(),
				badgeRemoved: !automationBadge(a), restoredToMain: getActiveElement() === a.main,
			}, {
				labels: { badge: 'Show Autopilot: 1 enabled', master: 'All Available Autopilot Rules', help: true },
				lastSection: true, focused: true, expanded: 'true', focusedAgain: true, samePanel: true, views: 1, badgeRemoved: true, restoredToMain: true,
			});
		});

		test('the automation count follows confirmed configuration rather than pending or failed writes', async () => {
			const f = fixture();
			const a = f.artifact();
			const panel = await open(f, a);
			button(panel, 'Autopilot').click();
			const toggle = panel.querySelector<HTMLElement>('.artifact-autopilot-rule [role="switch"]')!;
			const pending = new DeferredPromise<void>();
			a.setConfigureResult(pending.p);
			toggle.click();
			await settle(f);
			const beforeSaved = automationBadge(a) === null;
			await pending.complete();
			await settle(f);
			const saved = automationBadge(a)?.textContent;
			a.setConfigureResult(Promise.reject(new Error('Configuration was not saved')));
			toggle.click();
			await settle(f);
			assert.deepStrictEqual({ beforeSaved, saved, failedWrite: automationBadge(a)?.textContent, errors: f.errors }, {
				beforeSaved: true, saved: '1', failedWrite: '1', errors: ['The artifact operation failed: Configuration was not saved'],
			});
		});

		test('tabbed descriptions stay at three rendered lines with no expansion or hidden scrolling', async () => {
			const f = fixture();
			const a = f.artifact();
			const description = 'A detailed description of the artifact and the change being evaluated. '.repeat(60);
			a.details.main.set({ ...a.details.main.get(), description }, undefined);
			const panel = await open(f, a);
			const content = panel.querySelector<HTMLElement>('.artifact-details-description-content')!;
			const states = [];
			for (const width of [720, 440, 320]) {
				f.host.style.width = `${width}px`;
				await settle(f);
				content.scrollTop = 1000;
				const style = mainWindow.getComputedStyle(content);
				states.push({
					threeLines: Math.abs(content.getBoundingClientRect().height - parseFloat(style.lineHeight) * 3) < 1,
					overflows: content.scrollHeight > content.clientHeight,
					scrollTop: content.scrollTop, overflow: style.overflowY,
					buttons: panel.querySelectorAll('.artifact-description-actions .monaco-button').length,
				});
			}
			const accessible = f.controller.getAccessibilityProvider(AccessibleViewType.View);
			assert.deepStrictEqual({ states, fullAccessibleDescription: accessible?.provideContent().includes(description.trim()) }, {
				states: Array.from({ length: 3 }, () => ({ threeLines: true, overflows: true, scrollTop: 0, overflow: 'clip', buttons: 0 })),
				fullAccessibleDescription: true,
			});
			accessible?.dispose();
		});

		test('tabbed title opens the resource by mouse or keyboard without a duplicate footer action', async () => {
			const f = fixture();
			f.host.style.color = '#333333';
			f.host.style.setProperty('--vscode-editorWidget-foreground', '#333333');
			f.host.style.setProperty('--vscode-textLink-activeForeground', '#0066cc');
			const a = f.artifact();
			const panel = await open(f, a);
			const title = panel.querySelector<HTMLAnchorElement>('.artifact-details-title-link')!;
			const normal = mainWindow.getComputedStyle(title).color;
			title.classList.add('hovered');
			const hovered = mainWindow.getComputedStyle(title).color;
			title.classList.remove('hovered');
			title.click();
			title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			await settle(f);
			title.focus();
			a.details.main.set({ ...a.details.main.get(), title: '<em>Updated title</em>' }, undefined);
			a.snapshot.set({ ...a.snapshot.get(), artifact: { ...a.snapshot.get().artifact, resource: 'https://example.test/updated' } }, undefined);
			await settle(f);
			const retainedFocus = getActiveElement() === title;
			const retainedLink = panel.querySelector('.artifact-details-title-link') === title;
			button(panel, 'Remove Artifact').focus();
			button(panel, 'Remove Artifact').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
			assert.deepStrictEqual({
				normal, hovered, retainedFocus, retainedLink, opens: a.counts().resourceOpens,
				text: title.textContent, href: title.getAttribute('href'), nativeLink: !title.hasAttribute('role'),
				htmlChildren: [...title.children].map(child => child.tagName), heading: title.parentElement?.tagName,
				wrappedFocus: getActiveElement() === title,
				footer: [...panel.querySelectorAll('.artifact-general-actions .monaco-button')].map(button => button.textContent),
			}, {
				normal: 'rgb(51, 51, 51)', hovered: 'rgb(0, 102, 204)', retainedFocus: true, retainedLink: true, opens: 2,
				text: '<em>Updated title</em>', href: 'https://example.test/updated', nativeLink: true, htmlChildren: ['SPAN'], heading: 'H2', wrappedFocus: true,
				footer: ['Copy Link', 'Remove Artifact'],
			});
		});

		test('tabbed lists keep the card and action bar stable for short, long and empty lists', async () => {
			const f = fixture();
			const a = f.artifact();
			a.details.checks.set({ ...a.details.checks.get(), items: Array.from({ length: 30 }, (_, index) => ({ id: String(index), label: `Check ${index}`, icon: { id: 'pass' }, resource: 'https://example.test/check' })) }, undefined);
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')];
			const bounds = () => ({
				height: panel.querySelector('.artifact-details-lists')!.getBoundingClientRect().height,
				actionsTop: panel.querySelector('.artifact-state-actions')!.getBoundingClientRect().top,
				panelHeight: panel.getBoundingClientRect().height,
			});
			const collapsed = panel.querySelector<HTMLElement>('.artifact-details-lists')!.hidden;
			tabs[0].click();
			await settle(f);
			const initial = bounds();
			tabs[1].click();
			await settle(f);
			const short = bounds();
			a.details.comments.set({ ...a.details.comments.get(), items: [] }, undefined);
			await settle(f);
			const empty = bounds();
			const actions = [...panel.querySelectorAll('.artifact-state-actions .monaco-button')].map(button => ({ label: button.textContent, primary: !button.classList.contains('secondary') }));
			button(panel, 'Fix CI').click();
			await settle(f);
			assert.deepStrictEqual({
				labels: tabs.map(tab => tab.textContent), collapsed, short, empty,
				fixedHeight: initial.height > 0, visible: [...panel.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(element => !element.hidden).map(element => element.getAttribute('aria-labelledby')),
				actions,
				invoked: a.invoked.map(action => action.actionId),
			}, {
				labels: ['Checks', 'Review threads'], collapsed: true, short: { ...initial }, empty: { ...initial }, fixedHeight: true,
				visible: [tabs[1].id],
				actions: [{ label: 'Fix CI', primary: true }, { label: 'Address Comments', primary: false }, { label: 'Merge', primary: false }],
				invoked: ['fix'],
			});
		});

		test('tabbed lists support roving keyboard focus and section navigation', async () => {
			const f = fixture();
			const a = f.artifact();
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')];
			const press = (key: string, keyCode: number) => getActiveElement()!.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
			const tabState = () => ({
				focused: tabs.indexOf(getActiveElement() as HTMLElement), selected: tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'),
				expanded: tabs.map(tab => tab.getAttribute('aria-expanded')), tabStops: tabs.map(tab => tab.tabIndex),
			});
			tabs[0].focus();
			press('ArrowRight', 39);
			const collapsedArrow = tabState();
			press('Enter', 13);
			const expandedByEnter = tabState();
			const selected: number[] = [];
			for (const [key, keyCode] of [['ArrowRight', 39], ['Home', 36], ['End', 35]] as const) {
				press(key, keyCode);
				selected.push(tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true' && tab === getActiveElement()));
			}
			press('Enter', 13);
			const collapsedByEnter = { ...tabState(), listsHidden: panel.querySelector<HTMLElement>('.artifact-details-lists')!.hidden };
			const section = a.container.querySelectorAll<HTMLElement>('.artifact-pill-sections [role="button"]')[0];
			section.click();
			await settle(f);
			section.click();
			await settle(f);
			assert.deepStrictEqual({
				collapsedArrow, expandedByEnter, selected, collapsedByEnter, tabStops: tabs.map(tab => tab.tabIndex),
				listFocused: panel.querySelector('[role="tabpanel"]:not([hidden])')?.contains(getActiveElement()),
				samePanel: panel === f.host.querySelector('.artifact-integration-panel'),
			}, {
				collapsedArrow: { focused: 1, selected: -1, expanded: ['false', 'false'], tabStops: [-1, 0] },
				expandedByEnter: { focused: 1, selected: 1, expanded: ['false', 'true'], tabStops: [-1, 0] },
				selected: [0, 0, 1],
				collapsedByEnter: { focused: 1, selected: -1, expanded: ['false', 'false'], tabStops: [-1, 0], listsHidden: true },
				tabStops: [0, -1], listFocused: true, samePanel: true,
			});
		});

		test('mouse tab activation focuses the first list item and keyboard focus outlines the whole tab', async () => {
			const f = fixture();
			const a = f.artifact();
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')];
			tabs[0].focus();
			tabs[0].classList.add('synthetic-focus');
			const tab = tabs[0].parentElement!;
			const ring = tab.querySelector<HTMLElement>('.artifact-list-tab-focus')!;
			const tabBounds = tab.getBoundingClientRect();
			const ringBounds = ring.getBoundingClientRect();
			const keyboard = {
				ringVisible: mainWindow.getComputedStyle(ring).display === 'block',
				spansWholeTab: ringBounds.width > tabs[0].getBoundingClientRect().width && Math.abs(ringBounds.width - tabBounds.width) <= 6,
				inside: ringBounds.left > tabBounds.left && ringBounds.right < tabBounds.right && ringBounds.top > tabBounds.top && ringBounds.bottom < tabBounds.bottom,
				radius: mainWindow.getComputedStyle(ring).borderRadius, cursor: mainWindow.getComputedStyle(tab).cursor,
				buttonOutline: mainWindow.getComputedStyle(tabs[0]).outlineStyle,
			};
			tabs[0].classList.remove('synthetic-focus');
			tabs[0].dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
			await settle(f);
			const list = panel.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .monaco-list')!;
			const firstFocused = list.contains(getActiveElement()) && list.getAttribute('aria-activedescendant') === list.querySelector('.monaco-list-row[data-index="0"]')?.id;
			const mouseRingHidden = mainWindow.getComputedStyle(ring).display === 'none';
			tabs[1].focus();
			tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			const enterKeepsTabFocus = getActiveElement() === tabs[1];
			tabs[0].parentElement!.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
			a.details.comments.set({ ...a.details.comments.get(), items: [] }, undefined);
			tabs[1].parentElement!.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
			const emptyListFocused = getActiveElement() === panel.querySelector('[role="tabpanel"]:not([hidden])');
			tabs[1].dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
			assert.deepStrictEqual({
				keyboard, firstFocused, mouseRingHidden, enterKeepsTabFocus, emptyListFocused,
				collapsedByClick: {
					selected: panel.querySelector('[role="tab"][aria-selected="true"]'),
					visibleLists: panel.querySelectorAll('[role="tabpanel"]:not([hidden])').length,
					tabFocused: getActiveElement() === tabs[1],
				},
			}, {
				keyboard: { ringVisible: true, spansWholeTab: true, inside: true, radius: '4px', cursor: 'pointer', buttonOutline: 'none' },
				firstFocused: true, mouseRingHidden: true, enterKeepsTabFocus: true, emptyListFocused: true,
				collapsedByClick: { selected: null, visibleLists: 0, tabFocused: true },
			});
		});

		test('tabbed automation master works while collapsed and preserves provider consent and revocation', async () => {
			const f = fixture();
			const a = f.artifact();
			const panel = await open(f, a);
			const master = panel.querySelector<HTMLButtonElement>('.artifact-card-heading [role="switch"]')!;
			master.click();
			await settle(f);
			const enabled = master.getAttribute('aria-checked');
			updateContribution(a, contribution => ({
				...contribution, authentication: { enabled: true },
				view: { ...contribution.view, availability: { kind: 'authenticationRequired', reason: 'Sign in again.' }, automationAvailability: [] },
			}));
			master.click();
			await settle(f);
			assert.deepStrictEqual({
				enabled, disabled: master.getAttribute('aria-checked'), collapsed: panel.querySelector<HTMLElement>('.artifact-card-content')?.hidden,
				configured: a.configured, actions: a.invoked,
			}, {
				enabled: 'true', disabled: 'false', collapsed: true,
				configured: [
					{ integrationId: 'test', revision: 4, values: { fix: true, reviews: true, merge: true } },
					{ integrationId: 'test', revision: 5, values: { fix: false, reviews: false, merge: false } },
				], actions: [],
			});
		});

		test('tabbed enum choices can be prepared while off and enabled without another picker', async () => {
			const f = fixture();
			const quickInput = store.add(f.instantiation.createInstance(QuickInputService));
			f.instantiation.stub(IQuickInputService, quickInput);
			const a = f.artifact();
			useEnumAutomation(a);
			let panel = await open(f, a);
			button(panel, 'Autopilot').click();
			const initialPicker = button(panel, 'Always');
			const initial = { visible: !initialPicker.hidden, grant: a.snapshot.get().contributions[0].configuration.values.merge, badge: automationBadge(a)?.textContent ?? null };
			initialPicker.click();
			await settle(f);
			await quickInput.cancel();
			await settle(f);
			const cancelled = { value: initialPicker.textContent, writes: a.configured.length };
			initialPicker.click();
			await settle(f);
			const choice = f.host.querySelectorAll<HTMLElement>('.quick-input-widget .monaco-list-row')[1];
			choice.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
			choice.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
			await settle(f);
			const accessible = f.controller.getAccessibilityProvider(AccessibleViewType.View);
			const prepared = {
				value: button(panel, 'When No Changes Were Made').textContent, grant: a.snapshot.get().contributions[0].configuration.values.merge,
				writes: a.configured.length, badge: automationBadge(a)?.textContent ?? null,
				accessible: accessible?.provideContent().includes('Off; selected policy: When No Changes Were Made'),
			};
			accessible?.dispose();
			escape(panel);
			panel = await open(f, a);
			const picker = button(panel, 'When No Changes Were Made');
			const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
			toggle.click();
			await settle(f);
			const enabled = {
				checked: toggle.getAttribute('aria-checked'), choice: picker.hidden,
				dropdown: picker.getAttribute('aria-haspopup'), chevron: !!picker.querySelector('.codicon-chevron-down'),
				afterToggle: picker.getBoundingClientRect().left > toggle.getBoundingClientRect().right, noPicker: !quickInput.currentQuickInput,
			};
			picker.click();
			await settle(f);
			const choices = [...f.host.querySelectorAll('.quick-input-widget .monaco-list-row')].map(row => row.textContent);
			const selectedPolicy = f.host.querySelector('.quick-input-widget .monaco-list-row.focused')?.textContent;
			const firstChoice = f.host.querySelector<HTMLElement>('.quick-input-widget .monaco-list-row')!;
			firstChoice.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
			firstChoice.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
			await settle(f);
			toggle.click();
			await settle(f);
			const disabled = { state: toggle.getAttribute('aria-checked'), value: picker.textContent, visible: !picker.hidden, noPicker: !quickInput.currentQuickInput };
			toggle.click();
			await settle(f);
			assert.deepStrictEqual({
				initial, cancelled, prepared, enabled, choices, selectedPolicy, disabled,
				reenabled: toggle.getAttribute('aria-checked'), noPicker: !quickInput.currentQuickInput,
				samePanel: f.host.querySelector('.artifact-integration-panel') === panel, configured: a.configured, actions: a.invoked,
			}, {
				initial: { visible: true, grant: 'off', badge: null }, cancelled: { value: 'Always', writes: 0 },
				prepared: { value: 'When No Changes Were Made', grant: 'off', writes: 0, badge: null, accessible: true },
				enabled: { checked: 'true', choice: false, dropdown: 'listbox', chevron: true, afterToggle: true, noPicker: true },
				choices: ['Always', 'When No Changes Were Made'], selectedPolicy: 'When No Changes Were Made',
				disabled: { state: 'false', value: 'Always', visible: true, noPicker: true }, reenabled: 'true', noPicker: true, samePanel: true,
				configured: [
					{ integrationId: 'test', revision: 4, values: { merge: 'ifUnchanged' } },
					{ integrationId: 'test', revision: 5, values: { merge: 'always' } },
					{ integrationId: 'test', revision: 6, values: { merge: 'off' } },
					{ integrationId: 'test', revision: 7, values: { merge: 'always' } },
				], actions: [],
			});
		});

		test('tabbed bulk enablement uses the displayed enum choices without a policy picker', async () => {
			const f = fixture();
			let picks = 0;
			f.instantiation.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly pick: IQuickInputService['pick'] = async () => { picks++; return undefined; };
			}());
			const configured = [];
			for (const [id, value, label] of [['default', 'always', 'Always'], ['prepared', 'ifUnchanged', 'When No Changes Were Made']]) {
				const a = f.artifact(id);
				useEnumAutomation(a);
				if (id === 'prepared') {
					a.presentation.viewState.preparedPolicies.set(JSON.stringify(['test', 'merge']), value);
				}
				const panel = await open(f, a);
				const picker = button(panel, label);
				panel.querySelector<HTMLElement>('.artifact-card-heading [role="switch"]')!.click();
				await settle(f);
				configured.push({ value: picker.textContent, writes: a.configured, checked: panel.querySelector('.artifact-card-heading [role="switch"]')?.getAttribute('aria-checked') });
			}
			assert.deepStrictEqual({ picks, configured }, {
				picks: 0,
				configured: [
					{ value: 'Always', writes: [{ integrationId: 'test', revision: 4, values: { merge: 'always' } }], checked: 'true' },
					{ value: 'When No Changes Were Made', writes: [{ integrationId: 'test', revision: 4, values: { merge: 'ifUnchanged' } }], checked: 'true' },
				],
			});
		});

		test('prepared enum choices are provider-qualified and follow authoritative enabled values', async () => {
			const f = fixture();
			const a = f.artifact();
			useEnumAutomation(a);
			const first = a.snapshot.get().contributions[0];
			a.snapshot.set({ ...a.snapshot.get(), contributions: [first, { ...first, integrationId: 'other', label: 'Other Provider' }] }, undefined);
			a.presentation.viewState.preparedPolicies.set(JSON.stringify(['test', 'merge']), 'ifUnchanged');
			const panel = await open(f, a);
			const values = () => [...panel.querySelectorAll('.artifact-autopilot-policy')].map(picker => picker.textContent);
			const prepared = values();
			a.snapshot.set({
				...a.snapshot.get(), contributions: a.snapshot.get().contributions.map(contribution => contribution.integrationId === 'test'
					? { ...contribution, configuration: { ...contribution.configuration, values: { merge: 'always' } } } : contribution),
			}, undefined);
			await settle(f);
			const enabled = values();
			updateContribution(a, contribution => ({ ...contribution, configuration: { ...contribution.configuration, values: { merge: 'off' } } }));
			await settle(f);
			assert.deepStrictEqual({ prepared, enabled, disabled: values(), writes: a.configured }, {
				prepared: ['When No Changes Were Made', 'Always'], enabled: ['Always', 'Always'], disabled: ['Always', 'Always'], writes: [],
			});
		});

		test('an off-state policy picker cannot overwrite consent enabled by another update', async () => {
			const f = fixture();
			const quickInput = store.add(f.instantiation.createInstance(QuickInputService));
			f.instantiation.stub(IQuickInputService, quickInput);
			const a = f.artifact();
			useEnumAutomation(a);
			const panel = await open(f, a);
			button(panel, 'Autopilot').click();
			button(panel, 'Always').click();
			await settle(f);
			updateContribution(a, contribution => ({ ...contribution, configuration: { ...contribution.configuration, revision: 5, values: { merge: 'always' } } }));
			const choice = f.host.querySelectorAll<HTMLElement>('.quick-input-widget .monaco-list-row')[1];
			choice.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
			choice.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
			await settle(f);
			assert.deepStrictEqual({
				value: button(panel, 'Always').textContent, grant: a.snapshot.get().contributions[0].configuration.values.merge,
				writes: a.configured, errors: f.errors, pickerClosed: !quickInput.currentQuickInput,
			}, {
				value: 'Always', grant: 'always', writes: [],
				errors: ['The artifact operation failed: This Autopilot rule changed while selecting a policy. Choose the policy again.'],
				pickerClosed: true,
			});
		});

		test('enum choices stay visible while unavailable and failed enablement does not discard the prepared value', async () => {
			const f = fixture();
			let picks = 0;
			f.instantiation.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly pick: IQuickInputService['pick'] = async () => { picks++; return undefined; };
			}());
			const a = f.artifact();
			useEnumAutomation(a);
			a.presentation.viewState.preparedPolicies.set(JSON.stringify(['test', 'merge']), 'ifUnchanged');
			const panel = await open(f, a);
			button(panel, 'Autopilot').click();
			const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
			const picker = button(panel, 'When No Changes Were Made');
			a.setConfigureResult(Promise.reject(new Error('Consent revision changed')));
			toggle.click();
			await settle(f);
			const failed = { checked: toggle.getAttribute('aria-checked'), choice: picker.textContent, badge: automationBadge(a)?.textContent ?? null };
			updateContribution(a, contribution => ({ ...contribution, view: { ...contribution.view, automationAvailability: [{ id: 'merge', available: false, unavailableReason: 'Refresh required.' }] } }));
			await settle(f);
			assert.deepStrictEqual({
				failed, visible: !picker.hidden, pickerDisabled: picker.getAttribute('aria-disabled'), switchDisabled: toggle.disabled,
				picks, errors: f.errors,
			}, {
				failed: { checked: 'false', choice: 'When No Changes Were Made', badge: null }, visible: true, pickerDisabled: 'true', switchDisabled: true,
				picks: 0, errors: ['The artifact operation failed: Consent revision changed'],
			});
		});

		test('an enum with no enabled choices cannot grant consent and explains its visible disabled picker', async () => {
			const f = fixture();
			const a = f.artifact();
			useEnumAutomation(a);
			updateContribution(a, contribution => ({
				...contribution, options: contribution.options.map(option => option.kind === 'enum' ? { ...option, choices: option.choices.filter(choice => choice.value === option.disabledValue) } : option),
			}));
			const panel = await open(f, a);
			button(panel, 'Autopilot').click();
			const picker = button(panel, 'No Available Policies');
			const toggle = panel.querySelector<HTMLButtonElement>('.artifact-autopilot-rule [role="switch"]')!;
			toggle.click();
			assert.deepStrictEqual({
				visible: !picker.hidden, pickerDisabled: picker.getAttribute('aria-disabled'), switchDisabled: toggle.disabled,
				masterDisabled: panel.querySelector<HTMLButtonElement>('.artifact-card-heading [role="switch"]')?.disabled, writes: a.configured,
			}, { visible: true, pickerDisabled: 'true', switchDisabled: true, masterDisabled: true, writes: [] });
		});

		test('list-owned icons remain visible when compact sections and list items disappear', async () => {
			const f = fixture();
			const a = f.artifact();
			updateContribution(a, contribution => ({
				...contribution,
				view: {
					...contribution.view, lists: contribution.view.lists?.map(list => ({
						...list, icon: { id: list.id === 'checks' ? 'checklist' : 'comment-discussion' },
					}))
				},
			}));
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')];
			const icons = () => tabs.map((tab, index) => !!tab.querySelector(index === 0 ? '.codicon-checklist' : '.codicon-comment-discussion'));
			const states = [icons()];
			updateContribution(a, contribution => ({ ...contribution, view: { ...contribution.view, sections: [] } }));
			for (const kind of ['available', 'loading', 'available'] as const) {
				for (const details of [a.details.checks, a.details.comments]) {
					details.set({ ...details.get(), availability: { kind }, items: [] }, undefined);
				}
				await settle(f);
				states.push(icons());
			}
			assert.deepStrictEqual({
				states,
				sameTabs: [...panel.querySelectorAll('[role="tab"]')].every((tab, index) => tab === tabs[index]),
				pillSections: a.container.querySelectorAll('.artifact-pill-sections [role="button"]').length,
			}, { states: [[true, true], [true, true], [true, true], [true, true]], sameTabs: true, pillSections: 0 });
		});

		test('tabbed lists retain tabs and controls across refresh and collapse when the selected list is removed', async () => {
			const f = fixture();
			const a = f.artifact();
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('[role="tab"]')];
			const control = panel.querySelector('.artifact-autopilot-rule [role="switch"]');
			tabs[1].click();
			a.details.comments.set({ ...a.details.comments.get(), title: 'Comments (1)', availability: { kind: 'loading' } }, undefined);
			await settle(f);
			const retained = tabs[1] === panel.querySelectorAll('[role="tab"]')[1] && control === panel.querySelector('.artifact-autopilot-rule [role="switch"]');
			updateContribution(a, contribution => ({ ...contribution, view: { ...contribution.view, lists: contribution.view.lists?.filter(list => list.id !== 'comments') } }));
			await settle(f);
			assert.deepStrictEqual({
				retained, selected: panel.querySelector('[role="tab"][aria-selected="true"]'), tabStop: tabs[0].tabIndex,
				visibleLists: panel.querySelectorAll('[role="tabpanel"]:not([hidden])').length,
			}, { retained: true, selected: null, tabStop: 0, visibleLists: 0 });
		});

		test('tabbed preview has no empty list area for artifacts without lists', async () => {
			const f = fixture();
			const a = f.artifact();
			updateContribution(a, contribution => ({ ...contribution, view: { ...contribution.view, lists: [] } }));
			const panel = await open(f, a);
			assert.deepStrictEqual({
				tabs: panel.querySelectorAll('[role="tab"]').length,
				listsHidden: panel.querySelector<HTMLElement>('.artifact-details-lists')?.hidden,
				actions: [...panel.querySelectorAll('.artifact-tabbed-state-widget .artifact-state-actions .monaco-button')].map(button => button.textContent),
				rules: panel.querySelectorAll('.artifact-autopilot-rule [role="switch"]').length,
			}, { tabs: 0, listsHidden: true, actions: ['Fix CI', 'Address Comments', 'Merge'], rules: 3 });
		});

		test('tabbed outlines run beneath inactive tabs and around the connected active tab without an accent line', async () => {
			const f = fixture();
			f.host.style.setProperty('--vscode-editorWidget-background', '#222222');
			f.host.style.setProperty('--vscode-dropdown-background', '#333333');
			f.host.style.setProperty('--vscode-foreground', '#eeeeee');
			const a = f.artifact();
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('.artifact-list-tab-item')];
			const styles = () => tabs.map(tab => {
				const style = mainWindow.getComputedStyle(tab);
				return {
					borders: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
					backgroundMatchesList: style.backgroundColor === mainWindow.getComputedStyle(panel.querySelector('.artifact-tabbed-content')!).backgroundColor,
					shadow: style.boxShadow,
					buttonShadow: mainWindow.getComputedStyle(tab.querySelector('[role="tab"]')!).boxShadow,
				};
			});
			const widget = panel.querySelector<HTMLElement>('.artifact-tabbed-state-widget')!;
			const widgetBorder = () => mainWindow.getComputedStyle(widget).borderTopStyle;
			const collapsed = styles();
			const collapsedBorder = widgetBorder();
			tabs[0].querySelector<HTMLElement>('[role="tab"]')!.click();
			await settle(f);
			const first = styles();
			tabs[1].querySelector<HTMLElement>('[role="tab"]')!.click();
			await settle(f);
			const transparent = 'rgba(0, 0, 0, 0)';
			const border = 'rgb(119, 119, 119)';
			const active = { borders: [border, border, transparent, border], backgroundMatchesList: true, shadow: 'none', buttonShadow: 'none' };
			const inactive = { borders: [transparent, transparent, border, transparent], backgroundMatchesList: false, shadow: 'none', buttonShadow: 'none' };
			const closed = { borders: [transparent, transparent, transparent, transparent], backgroundMatchesList: false, shadow: 'none', buttonShadow: 'none' };
			const closedAfterSeparator = { ...closed, borders: [transparent, transparent, transparent, border] };
			assert.deepStrictEqual({
				collapsed, collapsedBorder, first, second: styles(), expandedBorder: widgetBorder(),
				headerBorder: mainWindow.getComputedStyle(panel.querySelector('.artifact-tabbed-header')!).borderBottomWidth,
				contentBorder: mainWindow.getComputedStyle(panel.querySelector('.artifact-tabbed-content')!).borderTopWidth,
				contentBackground: mainWindow.getComputedStyle(panel.querySelector('.artifact-tabbed-content')!).backgroundColor,
			}, {
				collapsed: [closed, closedAfterSeparator], collapsedBorder: 'solid', first: [active, inactive], second: [inactive, active], expandedBorder: 'none',
				headerBorder: '0px', contentBorder: '0px', contentBackground: 'rgb(51, 51, 51)',
			});
		});

		test('D widgets use the existing dropdown palette and respect high-contrast borders', async () => {
			const f = fixture();
			for (const [name, value] of Object.entries({
				'editorWidget-background': '#202020', 'editorWidget-foreground': '#cccccc',
				'dropdown-background': '#313131', 'dropdown-foreground': '#eeeeee', 'dropdown-border': '#555555',
			})) {
				f.host.style.setProperty(`--vscode-${name}`, value);
			}
			const a = f.artifact();
			const panel = await open(f, a);
			panel.querySelector<HTMLElement>('[role="tab"]')!.click();
			await settle(f);
			const surfaces = [...panel.querySelectorAll<HTMLElement>('.artifact-tabbed-content, .artifact-list-tab-item.selected, .artifact-autopilot-group')];
			const colors = () => surfaces.map(element => {
				const style = mainWindow.getComputedStyle(element);
				return { background: style.backgroundColor, foreground: style.color, border: style.borderRightColor };
			});
			const normal = colors();
			f.host.style.setProperty('--vscode-contrastBorder', '#ffffff');
			assert.deepStrictEqual({
				normal, highContrastBorders: colors().map(value => value.border),
				contextBackground: mainWindow.getComputedStyle(panel.parentElement!).backgroundColor,
				inactiveBackground: mainWindow.getComputedStyle(panel.querySelector('.artifact-list-tab-item:not(.selected)')!).backgroundColor,
				tabText: mainWindow.getComputedStyle(panel.querySelector('[role="tab"][aria-selected="true"]')!).color,
				headingText: mainWindow.getComputedStyle(button(panel, 'Autopilot')).color,
			}, {
				normal: Array.from({ length: 3 }, () => ({ background: 'rgb(49, 49, 49)', foreground: 'rgb(238, 238, 238)', border: 'rgb(85, 85, 85)' })),
				highContrastBorders: ['rgb(255, 255, 255)', 'rgb(255, 255, 255)', 'rgb(255, 255, 255)'],
				contextBackground: 'rgb(32, 32, 32)', inactiveBackground: 'rgb(32, 32, 32)',
				tabText: 'rgb(238, 238, 238)', headingText: 'rgb(238, 238, 238)',
			});
		});

		test('every tab has its own centered compact information button without changing the selected list', async () => {
			const f = fixture();
			const a = f.artifact();
			a.details.checks.set({ ...a.details.checks.get(), description: 'Checks for the current revision.' }, undefined);
			a.details.comments.set({ ...a.details.comments.get(), description: 'Only unresolved comments from contributors.' }, undefined);
			const panel = await open(f, a);
			const infos = [...panel.querySelectorAll<HTMLElement>('.artifact-list-tab-info')];
			const presentations = infos.map(info => {
				const tab = info.closest('.artifact-list-tab-item')!;
				const infoRect = info.getBoundingClientRect();
				const tabRect = tab.getBoundingClientRect();
				const style = mainWindow.getComputedStyle(info);
				const hover = f.hovers.get(info);
				assert.ok(typeof hover === 'function');
				return {
					label: info.getAttribute('aria-label'), description: info.getAttribute('aria-description'),
					tab: tab.querySelector('[role="tab"]')?.textContent,
					hover: hover().content,
					centered: Math.abs(infoRect.top + infoRect.height / 2 - tabRect.top - tabRect.height / 2) < 0.5,
					size: style.fontSize, tabIndex: info.tabIndex,
					circular: infoRect.width > 0 && infoRect.width === infoRect.height
						&& [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
							.every(radius => parseFloat(radius) >= infoRect.width / 2),
					nestedInteractive: !!info.closest('[role="tab"]'),
				};
			});
			infos[1].focus();
			infos[1].click();
			assert.deepStrictEqual({
				presentations, selected: panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
				hover: f.shownHovers.at(-1)?.content, focusRetained: getActiveElement() === infos[1],
			}, {
				presentations: [
					{ label: 'About Checks', description: 'Checks for the current revision.', tab: 'Checks', hover: 'Checks for the current revision.', centered: true, size: '12px', tabIndex: 0, circular: true, nestedInteractive: false },
					{ label: 'About Review threads', description: 'Only unresolved comments from contributors.', tab: 'Review threads', hover: 'Only unresolved comments from contributors.', centered: true, size: '12px', tabIndex: 0, circular: true, nestedInteractive: false },
				],
				selected: undefined, hover: 'Only unresolved comments from contributors.', focusRetained: true,
			});
		});

		test('tab information tracks its own description through selection, refresh and removal', async () => {
			const f = fixture();
			const a = f.artifact();
			a.details.comments.set({ ...a.details.comments.get(), description: 'Initial comment information.' }, undefined);
			const panel = await open(f, a);
			const tabs = [...panel.querySelectorAll<HTMLElement>('.artifact-list-tab-item')];
			const infos = tabs.map(tab => tab.querySelector<HTMLElement>('.artifact-list-tab-info')!);
			const initial = infos.map(info => info.hidden);
			tabs[1].querySelector<HTMLElement>('[role="tab"]')!.click();
			a.details.comments.set({ ...a.details.comments.get(), description: 'Updated comment information.' }, undefined);
			await settle(f);
			const updated = infos[1].getAttribute('aria-description');
			infos[1].focus();
			a.details.comments.set({ ...a.details.comments.get(), description: '' }, undefined);
			await settle(f);
			assert.deepStrictEqual({
				initial, updated, hidden: infos.map(info => info.hidden),
				retained: infos[1] === tabs[1].querySelector('.artifact-list-tab-info'),
				focusReturned: getActiveElement() === tabs[1].querySelector('[role="tab"]'),
			}, { initial: [true, false], updated: 'Updated comment information.', hidden: [true, true], retained: true, focusReturned: true });
		});

		test('Autopilot enables exactly the available rules without confirmation and uses one provider configuration revision', async () => {
			const f = fixture();
			let confirmations = 0;
			f.instantiation.stub(IDialogService, new class extends mock<IDialogService>() {
				override async confirm(): Promise<IConfirmationResult> {
					confirmations++;
					return { confirmed: true };
				}
			}());
			const a = f.artifact();
			updateContribution(a, contribution => ({
				...contribution,
				view: {
					...contribution.view, automationAvailability: contribution.view.automationAvailability.map(option => option.id === 'reviews'
						? { ...option, available: false, unavailableReason: 'Reconnect to enable' } : option)
				},
			}));
			const panel = await open(f, a);
			const master = panel.querySelector<HTMLElement>('.artifact-card-heading [role="switch"]')!;
			master.click();
			await settle(f);
			const enabled = master.getAttribute('aria-checked');
			master.click();
			await settle(f);
			assert.deepStrictEqual({
				confirmations,
				enabled, disabled: master.getAttribute('aria-checked'),
				configured: a.configured, invoked: a.invoked,
			}, {
				confirmations: 0,
				enabled: 'true', disabled: 'false',
				configured: [
					{ integrationId: 'test', revision: 4, values: { fix: true, merge: true } },
					{ integrationId: 'test', revision: 5, values: { fix: false, merge: false } },
				], invoked: [],
			});
		});

		test('Autopilot enablement is saved even when an outside click dismisses details right away', async () => {
			const f = fixture();
			const a = f.artifact();
			const panel = await open(f, a);
			panel.querySelector<HTMLElement>('.artifact-card-heading [role="switch"]')!.click();
			f.input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
			await settle(f);
			assert.deepStrictEqual({ selected: f.controller.selected.get(), configured: a.configured, errors: f.errors, badge: automationBadge(a)?.textContent }, {
				selected: undefined, configured: [{ integrationId: 'test', revision: 4, values: { fix: true, reviews: true, merge: true } }], errors: [], badge: '3',
			});
		});

		test('Autopilot partial enablement is explicit and failed writes never fabricate saved consent', async () => {
			const f = fixture();
			const a = f.artifact();
			updateContribution(a, contribution => ({ ...contribution, configuration: { ...contribution.configuration, values: { ...contribution.configuration.values, fix: true } } }));
			const panel = await open(f, a);
			const master = panel.querySelector<HTMLElement>('.artifact-card-heading [role="switch"]')!;
			const before = master.getAttribute('aria-checked');
			a.setConfigureResult(Promise.reject(new Error('Consent revision changed')));
			master.click();
			await settle(f);
			assert.deepStrictEqual({ before, after: master.getAttribute('aria-checked'), summary: panel.querySelector('.artifact-autopilot-summary')?.textContent, errors: f.errors, invoked: a.invoked }, {
				before: 'false', after: 'false', summary: '1 of 3 on',
				errors: ['The artifact operation failed: Consent revision changed'], invoked: [],
			});
		});

		test('Autopilot revokes saved rules even when freshness or authentication blocks new consent', async () => {
			const f = fixture();
			const a = f.artifact();
			updateContribution(a, contribution => ({
				...contribution, authentication: { enabled: true },
				configuration: { ...contribution.configuration, values: { fix: true, reviews: true, merge: false } },
				view: {
					...contribution.view, availability: { kind: 'authenticationRequired', reason: 'Sign in again.' },
					automationAvailability: contribution.view.automationAvailability.map(option => ({ ...option, available: false })),
				},
			}));
			const panel = await open(f, a);
			const master = panel.querySelector<HTMLElement>('.artifact-card-heading [role="switch"]')!;
			const enabled = master.hasAttribute('disabled');
			master.click();
			await settle(f);
			assert.deepStrictEqual({ enabled, configured: a.configured, invoked: a.invoked }, {
				enabled: false, configured: [{ integrationId: 'test', revision: 4, values: { fix: false, reviews: false } }], invoked: [],
			});
		});

		test('Autopilot scopes bulk consent to one provider even when providers reuse action and rule IDs', async () => {
			const f = fixture();
			const a = f.artifact();
			const original = a.snapshot.get().contributions[0];
			a.snapshot.set({ ...a.snapshot.get(), contributions: [original, { ...original, integrationId: 'second', label: 'Other Provider' }] }, undefined);
			const panel = await open(f, a);
			const masters = [...panel.querySelectorAll<HTMLElement>('.artifact-card-heading [role="switch"]')];
			masters[1].click();
			await settle(f);
			assert.deepStrictEqual({
				masters: masters.length, labels: [...panel.querySelectorAll('.artifact-autopilot-group .artifact-card-title')].map(label => label.textContent),
				configured: a.configured,
			}, { masters: 2, labels: ['Test Autopilot', 'Other Provider Autopilot'], configured: [{ integrationId: 'second', revision: 4, values: { fix: true, reviews: true, merge: true } }] });
		});
	});
});
