/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { StatusbarEntryItem } from '../../../../browser/parts/statusbar/statusbarItem.js';
import { IView } from '../../../../common/views.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { ShowTooltipCommand } from '../../../../services/statusbar/browser/statusbar.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestChatWidgetService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatViewId, IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../browser/chat.js';
import { ChatStatusPromo } from '../../browser/chatStatus/chatStatusPromo.js';
import type { ChatWidget } from '../../browser/widget/chatWidget.js';
import type { ChatInputPart } from '../../browser/widget/input/chatInputPart.js';
import type { ChatViewPane } from '../../browser/widgetHosts/viewPane/chatViewPane.js';
import { ChatClosedPromoNotification, ChatConfiguration } from '../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../common/languageModels.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';

class PromoTelemetry extends NullTelemetryServiceShape {
	readonly events: string[] = [];
	override publicLog2(name?: string): void {
		if (name) {
			this.events.push(name);
		}
	}
}

suite('ChatStatusPromo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function fixture(options: {
		metadata?: Partial<ILanguageModelChatMetadata>; configured?: ChatClosedPromoNotification;
		treatment?: Promise<string | undefined>; visible?: boolean; chatVisible?: boolean; storedKey?: string;
	} = {}, instantiation = store.add(new TestInstantiationService())) {
		const model: ILanguageModelChatMetadata = {
			extension: new ExtensionIdentifier('test'), id: 'gpt-5', name: 'GPT-5', vendor: 'copilot', version: '1',
			family: 'gpt', maxInputTokens: 100, maxOutputTokens: 100, isDefaultForLocation: {},
			promo: { id: 'sale', discountPercent: 20, message: 'Save 20%' }, ...options.metadata,
		};
		const models = new Map([['copilot:model', model]]);
		const modelChanged = store.add(new Emitter<string>());
		instantiation.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: modelChanged.event,
			getLanguageModelIds: () => [...models.keys()], lookupLanguageModel: id => models.get(id),
		});
		const storage = store.add(new InMemoryStorageService());
		if (options.storedKey) {
			storage.store(options.storedKey, '["sale"]', StorageScope.APPLICATION, StorageTarget.USER);
		}
		instantiation.stub(IStorageService, storage);
		const configuration = new TestConfigurationService(options.configured === undefined ? {} : { [ChatConfiguration.ChatClosedPromoNotification]: options.configured });
		instantiation.stub(IConfigurationService, configuration);
		const assignments = new NullWorkbenchAssignmentService();
		const refetch = store.add(new Emitter<void>());
		sinon.stub(assignments, 'onDidRefetchAssignments').value(refetch.event);
		const treatment = sinon.stub(assignments, 'getTreatment').returns(options.treatment ?? Promise.resolve(ChatClosedPromoNotification.CopilotIconPopup));
		instantiation.stub(IWorkbenchAssignmentService, assignments);
		const log = new NullLogService();
		const warn = sinon.spy(log, 'warn');
		instantiation.stub(ILogService, log);
		const telemetry = new PromoTelemetry();
		instantiation.stub(ITelemetryService, telemetry);
		const state = { visible: options.visible ?? true, chatVisible: options.chatVisible ?? false, view: undefined as IView | undefined, widgets: [] as IChatWidget[] };
		const viewVisibility = store.add(new Emitter<{ id: string; visible: boolean }>());
		instantiation.stub(IViewsService, {
			onDidChangeViewVisibility: viewVisibility.event, isViewVisible: () => state.chatVisible,
			getViewWithId: <T extends IView>() => state.view as T,
			openView: async <T extends IView>() => state.view as T,
		});
		const widgets = new TestChatWidgetService();
		const widgetAdded = store.add(new Emitter<IChatWidget>());
		widgets.onDidAddWidget = widgetAdded.event;
		sinon.stub(widgets, 'getAllWidgets').callsFake(() => state.widgets);
		instantiation.stub(IChatWidgetService, widgets);
		const promo = store.add(instantiation.createInstance(ChatStatusPromo));
		let entry: ReturnType<ChatStatusPromo['getEntryProps']>;
		const update = () => { entry = promo.getEntryProps(state.visible); };
		store.add(promo.onDidChange(update));
		update();
		return { promo, state, models, modelChanged, storage, configuration, treatment, refetch, warn, telemetry, widgets, widgetAdded, viewVisibility, update, get entry() { return entry; } };
	}

	function chatView(f: ReturnType<typeof fixture>, sessionType?: string, restored: Promise<void> = Promise.resolve()) {
		let resource = sessionType === undefined ? undefined : sessionType === 'local' ? LocalChatSessionUri.getNewSessionUri() : URI.from({ scheme: sessionType, path: '/session' });
		const changed = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const viewModel = new class extends mock<NonNullable<ChatWidget['viewModel']>>() {
			override get sessionResource() { return resource!; }
		}();
		const select = sinon.stub().returns(true);
		const request = sinon.stub().resolves(true);
		const input = new class extends mock<ChatInputPart>() {
			override switchModelByIdentifier(id: string) { return select(id); }
			override requestModelByIdentifier(id: string) { return request(id); }
		}();
		const widget = new class extends mock<ChatWidget>() {
			override readonly viewContext = { viewId: ChatViewId };
			override readonly onDidChangeViewModel = changed.event;
			override get viewModel() { return resource ? viewModel : undefined; }
			override get input() { return input; }
		}();
		const view = new class extends mock<ChatViewPane>() {
			override get widget() { return widget; }
			override async whenSessionRestored() { await restored; }
			override async startNewLocalSession() { resource = LocalChatSessionUri.getNewSessionUri(); return undefined; }
			override focusInput() { }
		}();
		f.state.view = view;
		f.state.widgets.push(widget);
		f.widgetAdded.fire(widget);
		return {
			select, request, startLocal: sinon.spy(view, 'startNewLocalSession'),
			setResource: (next: URI) => { const previousSessionResource = resource; resource = next; changed.fire({ previousSessionResource, currentSessionResource: resource }); },
		};
	}

	for (const configured of [ChatClosedPromoNotification.None, ChatClosedPromoNotification.CopilotIconPopup]) {
		test(`explicit ${configured} bypasses experiment enrollment`, () => {
			const f = fixture({ configured });
			assert.deepStrictEqual({ queries: f.treatment.callCount, pip: !!f.entry?.showPip }, { queries: 0, pip: configured === ChatClosedPromoNotification.CopilotIconPopup });
		});
	}

	const ineligible: Record<string, Parameters<typeof fixture>[0]> = {
		'missing promo': { metadata: { promo: undefined } },
		'message-only promo': { metadata: { promo: { id: 'sale', discountPercent: 0, message: 'Featured' } } },
		'quiet promo': { metadata: { promo: { id: 'sale', discountPercent: 20, message: 'Sale', showBanner: false } } },
		'other vendor': { metadata: { vendor: 'other' } },
		'other harness': { metadata: { targetChatSessionType: 'openai-codex' } },
		'hidden status entry': { visible: false },
		'expanded Chat': { chatVisible: true },
		'dismissed sale': { storedKey: 'chat.dismissedPromoIds' },
		'seen banner': { storedKey: 'chat.seenPromoIds' },
	};
	for (const [name, options] of Object.entries(ineligible)) {
		test(`does not enroll for ${name}`, () => {
			const f = fixture(options);
			assert.deepStrictEqual({ queries: f.treatment.callCount, entry: f.entry }, { queries: 0, entry: undefined });
		});
	}

	test('enrolls only once the status entry becomes visible', async () => {
		const f = fixture({ visible: false });
		f.state.visible = true;
		f.update();
		await timeout(0);
		assert.deepStrictEqual({ queries: f.treatment.callCount, pip: f.entry?.showPip }, { queries: 1, pip: true });
	});

	test('the registered control default is not an explicit override', async () => {
		const f = fixture();
		sinon.stub(f.configuration, 'inspect').returns({ value: ChatClosedPromoNotification.None, defaultValue: ChatClosedPromoNotification.None });
		f.refetch.fire();
		await timeout(0);
		assert.strictEqual(f.entry?.showPip, true);
	});

	test('ignores stale assignments and handles revocation', async () => {
		const pending = new DeferredPromise<string>();
		const f = fixture({ treatment: pending.p });
		f.treatment.resolves(ChatClosedPromoNotification.CopilotIconPopup);
		f.refetch.fire();
		await timeout(0);
		const enabled = f.entry?.showPip;
		await pending.complete(ChatClosedPromoNotification.None);
		const afterStaleResponse = f.entry?.showPip;
		f.treatment.resolves(ChatClosedPromoNotification.None);
		f.refetch.fire();
		await timeout(0);
		assert.deepStrictEqual([enabled, afterStaleResponse, f.entry], [true, true, undefined]);
	});

	for (const change of ['expand', 'remove', 'dismiss', 'override', 'hide', 'dispose']) {
		test(`rechecks eligibility after delayed assignment and ${change}`, async () => {
			const pending = new DeferredPromise<string>();
			const f = fixture({ treatment: pending.p });
			switch (change) {
				case 'expand': f.state.chatVisible = true; break;
				case 'remove': f.models.clear(); break;
				case 'dismiss': f.storage.store('chat.dismissedPromoIds', '["sale"]', StorageScope.APPLICATION, StorageTarget.USER); break;
				case 'override': await f.configuration.setUserConfiguration(ChatConfiguration.ChatClosedPromoNotification, ChatClosedPromoNotification.None); break;
				case 'hide': f.state.visible = false; break;
				case 'dispose': f.promo.dispose(); break;
			}
			await pending.complete(ChatClosedPromoNotification.CopilotIconPopup);
			assert.strictEqual(f.entry, undefined);
		});
	}

	test('logs an assignment failure without offering the promo', async () => {
		const pending = new DeferredPromise<string>();
		const f = fixture({ treatment: pending.p });
		await pending.error(new Error('ExP unavailable'));
		assert.deepStrictEqual({ warnings: f.warn.callCount, entry: f.entry }, { warnings: 1, entry: undefined });
	});

	test('observes the Chat view session independently of the focused editor', () => {
		const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup });
		const view = chatView(f, 'local');
		f.widgets.lastFocusedWidget = new class extends mock<IChatWidget>() { }();
		f.state.chatVisible = true;
		f.viewVisibility.fire({ id: ChatViewId, visible: true });
		const local = f.entry;
		view.setResource(URI.from({ scheme: 'openai-codex', path: '/session' }));
		assert.deepStrictEqual({ local, otherHarness: f.entry?.showPip }, { local: undefined, otherHarness: true });
	});

	test('viewing an offer clears only its pip and keeps a stable tooltip', () => {
		const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup });
		const tooltip = f.entry!.tooltip;
		tooltip.onDidShow?.();
		tooltip.onDidShow?.();
		assert.deepStrictEqual({
			pip: f.entry?.showPip, sameTooltip: f.entry?.tooltip === tooltip,
			seen: f.storage.get('chat.seenPromoIds', StorageScope.APPLICATION),
			dismissed: f.storage.get('chat.dismissedPromoIds', StorageScope.APPLICATION), events: f.telemetry.events,
		}, { pip: false, sameTooltip: true, seen: '["sale"]', dismissed: undefined, events: ['chatPromoWidgetShown'] });
	});

	test('withdraws a displayed offer without dismissing it', () => {
		const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup });
		f.entry!.tooltip.onDidShow?.();
		f.models.clear();
		f.modelChanged.fire('copilot');
		assert.deepStrictEqual({
			entry: f.entry, dismissed: f.storage.get('chat.dismissedPromoIds', StorageScope.APPLICATION),
		}, { entry: undefined, dismissed: undefined });
	});

	for (const sessionType of [undefined, 'local', 'openai-codex']) {
		test(`Try selects the model from ${sessionType ?? 'cold Chat'}`, async () => {
			const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup });
			const view = chatView(f, sessionType);
			const action = f.entry!.tooltip.commands[0];
			await CommandsRegistry.getCommand(action.id)!.handler(undefined!, ...action.arguments!);
			assert.deepStrictEqual({
				startedLocal: view.startLocal.callCount, selected: view.select.args,
				dismissed: f.storage.get('chat.dismissedPromoIds', StorageScope.APPLICATION),
			}, { startedLocal: sessionType === 'local' ? 0 : 1, selected: [['copilot:model']], dismissed: '["sale"]' });
		});
	}

	test('Try waits for restoration instead of replacing a saved local conversation', async () => {
		const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup });
		const restored = new DeferredPromise<void>();
		const view = chatView(f, undefined, restored.p);
		const action = f.entry!.tooltip.commands[0];
		const done = CommandsRegistry.getCommand(action.id)!.handler(undefined!, ...action.arguments!);
		await timeout(0);
		const before = { started: view.startLocal.callCount, selected: view.select.callCount };
		view.setResource(LocalChatSessionUri.getNewSessionUri());
		await restored.complete();
		await done;
		assert.deepStrictEqual({ before, started: view.startLocal.callCount, selected: view.select.args }, { before: { started: 0, selected: 0 }, started: 0, selected: [['copilot:model']] });
	});

	test('a failed selection reports an error without dismissing the sale', async () => {
		const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup });
		const view = chatView(f, 'local');
		view.select.returns(false);
		view.request.resolves(false);
		const action = f.entry!.tooltip.commands[0];
		await assert.rejects(async () => CommandsRegistry.getCommand(action.id)!.handler(undefined!, ...action.arguments!), /no longer available/);
		assert.strictEqual(f.storage.get('chat.dismissedPromoIds', StorageScope.APPLICATION), undefined);
	});

	test('renders plain, wrapping copy and a fresh element for each native hover', async () => {
		const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup, metadata: { promo: { id: 'sale', discountPercent: 20, message: 'Save 20% on <new> models' } } });
		const content = f.entry!.tooltip.content;
		assert.ok(isManagedHoverTooltipHTMLElement(content));
		const first = await content.element(CancellationToken.None);
		const second = await content.element(CancellationToken.None);
		assert.deepStrictEqual({
			text: first.textContent, literal: first.querySelector('new'), fresh: first !== second,
			seen: f.storage.get('chat.seenPromoIds', StorageScope.APPLICATION),
		}, { text: ' Save 20% on <new> models', literal: null, fresh: true, seen: undefined });
	});

	for (const interaction of ['mouse', 'keyboard', 'refresh', 'pinnedRefresh']) {
		test(`native ${interaction} transition retains the offer and its CTA`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const instantiation = store.add(workbenchInstantiationService(undefined, store));
			const f = fixture({ configured: ChatClosedPromoNotification.CopilotIconPopup }, instantiation);
			const hover = store.add(instantiation.createInstance(HoverService));
			instantiation.stub(IHoverService, hover);
			const container = dom.append(document.body, dom.$('.statusbar-item'));
			store.add(toDisposable(() => container.remove()));
			const delegate = store.add(instantiation.createInstance(WorkbenchHoverDelegate, 'element', { dynamicDelay: () => 500 }, (_options, focus) => ({
				persistence: { hideOnKeyDown: true, sticky: focus },
			})));
			const props = () => ({ name: 'Copilot', text: f.entry?.showPip ? '$(copilot-dot)' : '$(copilot)', ariaLabel: f.entry?.ariaLabel ?? 'Copilot', tooltip: f.entry?.tooltip, command: ShowTooltipCommand });
			const item = store.add(instantiation.createInstance(StatusbarEntryItem, container, props(), delegate));
			store.add(f.promo.onDidChange(() => item.update(props())));
			item.labelContainer.dispatchEvent(new FocusEvent('focus', { bubbles: true, relatedTarget: document.body }));
			await timeout(1000);
			assert.strictEqual(document.querySelector('.monaco-hover .html-hover-contents')?.textContent, ' Save 20%');
			if (interaction === 'mouse') {
				item.labelContainer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
				await timeout(0);
				item.labelContainer.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
				item.labelContainer.click();
			} else if (interaction === 'keyboard') {
				item.labelContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			} else {
				if (interaction === 'pinnedRefresh') {
					item.labelContainer.click();
					await timeout(0);
				}
				const metadata = f.models.get('copilot:model')!;
				f.models.set('copilot:model', { ...metadata, promo: { ...metadata.promo!, message: 'Updated offer' } });
				f.modelChanged.fire('copilot');
			}
			await timeout(0);
			const hoverElement = document.querySelector<HTMLElement>('.monaco-hover');
			assert.deepStrictEqual({
				text: document.querySelector('.monaco-hover .html-hover-contents')?.textContent,
				action: document.querySelector('.monaco-hover .action-container')?.textContent,
				focused: !!hoverElement && dom.isAncestorOfActiveElement(hoverElement),
				pip: f.entry?.showPip, dismissed: f.storage.get('chat.dismissedPromoIds', StorageScope.APPLICATION), events: f.telemetry.events,
			}, {
				text: interaction === 'refresh' || interaction === 'pinnedRefresh' ? ' Updated offer' : ' Save 20%',
				action: 'Try GPT-5', focused: interaction !== 'refresh', pip: false, dismissed: undefined, events: ['chatPromoWidgetShown'],
			});
			hover.hideHover(true);
		}));
	}
});
