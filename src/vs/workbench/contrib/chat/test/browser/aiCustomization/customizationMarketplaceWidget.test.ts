/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceCursor, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceInfo } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { CustomizationMarketplaceWidget } from '../../../browser/aiCustomization/customizationMarketplaceWidget.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';
import { ChatConfiguration } from '../../../common/constants.js';

interface IRecordedQuery {
	readonly options: ICustomizationMarketplaceQuery;
	readonly token: CancellationToken;
	readonly result: DeferredPromise<ICustomizationMarketplacePage>;
}

class TestCustomizationMarketplaceService extends mock<ICustomizationMarketplaceService>() {
	override readonly sources: ICustomizationMarketplaceSourceInfo[] = [{ id: 'testSource', enablementSetting: ChatConfiguration.AgentFinderPublicFeedEnabled }];
	readonly requests: IRecordedQuery[] = [];

	override query(options: ICustomizationMarketplaceQuery, token: CancellationToken): Promise<ICustomizationMarketplacePage> {
		const result = new DeferredPromise<ICustomizationMarketplacePage>();
		this.requests.push({ options, token, result });
		return result.p;
	}
}

class TestCustomizationMarketplaceInstallService extends Disposable implements ICustomizationMarketplaceInstallService {
	declare readonly _serviceBrand: undefined;
	private readonly changeEmitter = this._register(new Emitter<void>());
	readonly onDidChange = this.changeEmitter.event;
	private readonly states = new Map<string, CustomizationMarketplaceInstallState>();
	readonly requests: { resource: ICustomizationMarketplaceResource; result: DeferredPromise<void> }[] = [];
	readonly stateReads: string[] = [];

	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
		this.stateReads.push(resource.identifier);
		return this.states.get(getCustomizationMarketplaceResourceKey(resource)) ?? { kind: 'available' };
	}

	install(resource: ICustomizationMarketplaceResource): Promise<void> {
		const result = new DeferredPromise<void>();
		this.requests.push({ resource, result });
		return result.p;
	}

	setState(resource: ICustomizationMarketplaceResource, state: CustomizationMarketplaceInstallState): void {
		this.states.set(getCustomizationMarketplaceResourceKey(resource), state);
		this.changeEmitter.fire();
	}
}

function createResource(identifier: string, overrides: Partial<ICustomizationMarketplaceResource> = {}): ICustomizationMarketplaceResource {
	return {
		sourceId: 'testSource',
		identifier,
		displayName: identifier,
		description: `Description of ${identifier}`,
		mediaType: CustomizationMarketplaceMediaType.Skill,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		...overrides,
	};
}

function createCursor(cursor: string, query = ''): ICustomizationMarketplaceCursor {
	return { query, pageSize: 24, sources: [{ id: 'testSource', cursor }] };
}

function getElement<T extends HTMLElement = HTMLElement>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	assert.ok(element, `Expected ${selector}`);
	return element;
}

function getButton(container: HTMLElement, label: string): HTMLElement {
	const button = Array.from(container.querySelectorAll<HTMLElement>('.monaco-button')).find(button => button.textContent === label);
	assert.ok(button, `Expected ${label} button`);
	return button;
}

function getCardNames(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('.customization-marketplace-name'), element => element.textContent ?? '');
}

function getInstallPresentation(container: HTMLElement) {
	const button = getElement(container, '.customization-marketplace-install-button');
	const error = getElement(container, '.customization-marketplace-install-error');
	return {
		label: button.textContent,
		enabled: button.getAttribute('aria-disabled') === 'false',
		busy: button.getAttribute('aria-busy') === 'true',
		error: error.hidden ? '' : error.textContent,
	};
}

function setSearch(container: HTMLElement, value: string): HTMLInputElement {
	const input = getElement<HTMLInputElement>(container, '.customization-marketplace-search input');
	input.value = value;
	input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
	return input;
}

function pressKey(element: HTMLElement, key: string, keyCode: number, isComposing = false): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true, isComposing });
	element.dispatchEvent(event);
	return event;
}

suite('CustomizationMarketplaceWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(
		hidden = false,
		parent: HTMLElement = document.body,
		widgetConstructor: typeof CustomizationMarketplaceWidget = CustomizationMarketplaceWidget,
		options: { sourceEnabled?: boolean; additionalSources?: readonly ICustomizationMarketplaceSourceInfo[] } = { sourceEnabled: true },
	) {
		const container = DOM.append(parent, DOM.$('.customization-marketplace-test'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '900px';
		container.style.height = '600px';

		const service = new TestCustomizationMarketplaceService();
		service.sources.push(...(options.additionalSources ?? []));
		const installService = store.add(new TestCustomizationMarketplaceInstallService());
		const sentimentChanged = store.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden };
			override readonly onDidChangeSentiment = sentimentChanged.event;
		}();
		const configuration = new TestConfigurationService({
			[AccessibilityVerbositySettingId.CustomizationMarketplace]: true,
			...(options.sourceEnabled !== undefined ? { [ChatConfiguration.AgentFinderPublicFeedEnabled]: options.sourceEnabled } : {}),
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const keybindingsChanged = store.add(new Emitter<void>());
		let helpKeybinding: ResolvedKeybinding | undefined = new USLayoutResolvedKeybinding(
			[new KeyCodeChord(false, false, true, false, KeyCode.F1)], OperatingSystem.Linux);
		const keybindingService = new class extends mock<IKeybindingService>() {
			override readonly onDidUpdateKeybindings = keybindingsChanged.event;
			override lookupKeybinding() {
				return helpKeybinding;
			}
		}();
		const opened: Parameters<IOpenerService['open']>[] = [];
		let openError: Error | undefined;
		const opener = new class extends mock<IOpenerService>() {
			override async open(...args: Parameters<IOpenerService['open']>) {
				opened.push(args);
				if (openError) {
					throw openError;
				}
				return true;
			}
		}();
		const notifications: Parameters<INotificationService['error']>[0][] = [];
		const notificationService = new class extends mock<INotificationService>() {
			override error(message: Parameters<INotificationService['error']>[0]) {
				notifications.push(message);
			}
		}();
		const signals: Parameters<IAccessibilitySignalService['playSignal']>[] = [];
		const signalService = new class extends mock<IAccessibilitySignalService>() {
			override async playSignal(...args: Parameters<IAccessibilitySignalService['playSignal']>) {
				signals.push(args);
			}
		}();
		const hovers: Parameters<IHoverService['setupDelayedHover']>[] = [];
		const widget = store.add(new widgetConstructor(
			container,
			service,
			new class extends mock<IContextViewService>() {
				override hideContextView() { }
			}(),
			new class extends mock<IHoverService>() {
				override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>) {
					hovers.push(args);
					return Disposable.None;
				}
			}(),
			opener,
			notificationService,
			entitlement,
			configuration,
			keybindingService,
			signalService,
			installService,
		));
		return {
			container, widget, service, installService, opened, notifications, signals, configuration, hovers,
			async setSourceEnabled(enabled: boolean, setting: string = ChatConfiguration.AgentFinderPublicFeedEnabled) {
				await configuration.setUserConfiguration(setting, enabled);
				configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
					override affectsConfiguration(section: string) { return section === setting; }
				}());
			},
			setAIHidden(value: boolean) {
				entitlement.sentiment.hidden = value;
				sentimentChanged.fire();
			},
			setSentiment(value: Partial<IChatEntitlementService['sentiment']>) {
				Object.assign(entitlement.sentiment, value);
				sentimentChanged.fire();
			},
			setHelpKeybinding(value: ResolvedKeybinding | undefined) {
				helpKeybinding = value;
				keybindingsChanged.fire();
			},
			setOpenError(error: Error) { openError = error; },
		};
	}

	test('observes layout in the window containing the widget', async () => {
		const frame = DOM.$<HTMLIFrameElement>('iframe');
		store.add(toDisposable(() => frame.remove()));
		await new Promise<void>(resolve => {
			store.add(DOM.addDisposableListener(frame, DOM.EventType.LOAD, () => resolve()));
			DOM.append(document.body, frame);
		});
		const frameWindow = frame.contentWindow!;
		ensureCodeWindow(frameWindow, 999);
		const auxiliaryWindow = frameWindow;
		const observed = new DeferredPromise<boolean>();
		let captureLayout = false;
		class AuxiliaryWindowWidget extends CustomizationMarketplaceWidget {
			override layout(): void {
				super.layout();
				if (captureLayout) {
					const message = 'ResizeObserver loop completed with undelivered notifications.';
					const auxiliaryContext = DOM.getRecentDisposableResizeObserverContextForLoopError(message, auxiliaryWindow);
					const mainContext = DOM.getRecentDisposableResizeObserverContextForLoopError(message, mainWindow);
					if (auxiliaryContext?.includes('CustomizationMarketplaceWidget') || mainContext?.includes('CustomizationMarketplaceWidget')) {
						void observed.complete(!!auxiliaryContext?.includes('CustomizationMarketplaceWidget'));
					}
				}
			}
		}
		const { widget, service } = createWidget(false, auxiliaryWindow.document.body, AuxiliaryWindowWidget);
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [] });
		captureLayout = true;

		assert.strictEqual(await observed.p, true);
	});

	for (const initialFlag of [undefined, false]) {
		test(`does no catalog work when the experiment is ${initialFlag === undefined ? 'unset' : 'false'}`, () => runWithFakedTimers({}, async () => {
			const { container, widget, service, installService, configuration, setSourceEnabled } = createWidget(
				false, document.body, CustomizationMarketplaceWidget, initialFlag === undefined ? {} : { sourceEnabled: initialFlag });
			widget.setVisible(true);
			pressKey(setSearch(container, 'review'), 'Enter', 13);
			getButton(container, 'Refresh').click();
			const select = getElement<HTMLSelectElement>(container, '.customization-marketplace-type-filter select');
			select.selectedIndex = 2;
			select.dispatchEvent(new Event('change', { bubbles: true }));
			await timeout(400);
			widget.setVisible(false);
			widget.setVisible(true);
			const disabled = {
				setting: configuration.getValue(ChatConfiguration.AgentFinderPublicFeedEnabled),
				queryCount: service.requests.length,
				installCount: installService.requests.length,
				installStateReads: installService.stateReads.slice(),
				display: widget.element.style.display,
				names: getCardNames(container),
			};
			await setSourceEnabled(true);
			await service.requests[0].result.complete({ items: [createResource('Enabled')] });

			assert.deepStrictEqual({
				disabled,
				queries: service.requests.map(request => request.options),
				names: getCardNames(container),
				display: widget.element.style.display,
			}, {
				disabled: { setting: initialFlag, queryCount: 0, installCount: 0, installStateReads: [], display: 'none', names: [] },
				queries: [{ query: 'review', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 24, cursor: undefined }],
				names: ['Enabled'],
				display: '',
			});
		}));
	}

	test('the old catalog setting cannot enable marketplace discovery or installation', () => runWithFakedTimers({}, async () => {
		const { container, widget, service, installService, configuration } = createWidget(
			false, document.body, CustomizationMarketplaceWidget, {});
		const oldSettings = ['chat.agentFinder.enabled', 'chat.customizations.unifiedMarketplace.enabled'];
		for (const setting of oldSettings) {
			await configuration.setUserConfiguration(setting, true);
		}
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return oldSettings.includes(section); }
		}());
		widget.setVisible(true);
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		getButton(container, 'Refresh').click();
		await timeout(400);

		assert.deepStrictEqual({
			enabled: configuration.getValue(ChatConfiguration.AgentFinderPublicFeedEnabled),
			queries: service.requests.length,
			installs: installService.requests.length,
			installStateReads: installService.stateReads,
			display: widget.element.style.display,
			names: getCardNames(container),
		}, {
			enabled: undefined,
			queries: 0,
			installs: 0,
			installStateReads: [],
			display: 'none',
			names: [],
		});
	}));

	for (const lateResponse of ['success', 'failure'] as const) {
		test(`disabling the source cancels pending queries and ignores a late ${lateResponse}`, async () => {
			const { container, widget, service, notifications, signals, setSourceEnabled } = createWidget();
			widget.setVisible(true);
			await setSourceEnabled(false);
			const disabled = {
				cancelled: service.requests[0].token.isCancellationRequested,
				display: widget.element.style.display,
				busy: getElement(container, '.customization-marketplace-results').getAttribute('aria-busy'),
			};
			if (lateResponse === 'success') {
				await service.requests[0].result.complete({ items: [createResource('Disabled result')] });
			} else {
				await service.requests[0].result.error(new Error('Disabled request failed'));
			}
			const afterLateResponse = {
				names: getCardNames(container),
				error: getElement(container, '.customization-marketplace-error').textContent,
			};
			await setSourceEnabled(true);
			await service.requests[1].result.complete({ items: [createResource('Enabled result')] });

			assert.deepStrictEqual({
				disabled,
				afterLateResponse,
				queryCount: service.requests.length,
				names: getCardNames(container),
				display: widget.element.style.display,
				notifications,
				signals,
			}, {
				disabled: { cancelled: true, display: 'none', busy: 'false' },
				afterLateResponse: { names: [], error: '' },
				queryCount: 2,
				names: ['Enabled result'],
				display: '',
				notifications: [],
				signals: [],
			});
		});
	}

	test('disabling the source cancels debounced search until it is enabled again', () => runWithFakedTimers({}, async () => {
		const { container, widget, service, setSourceEnabled } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Original')] });
		setSearch(container, 'pending');
		await timeout(100);
		await setSourceEnabled(false);
		await timeout(400);
		const disabled = {
			queryCount: service.requests.length,
			display: widget.element.style.display,
			names: getCardNames(container),
		};
		await setSourceEnabled(true);
		await service.requests[1].result.complete({ items: [createResource('Enabled')] });
		await timeout(400);

		assert.deepStrictEqual({
			disabled,
			queries: service.requests.map(request => request.options.query),
			names: getCardNames(container),
		}, {
			disabled: { queryCount: 1, display: 'none', names: [] },
			queries: ['', 'pending'],
			names: ['Enabled'],
		});
	}));

	test('changing sources resets discovery without hiding the widget until the last source is disabled', async () => {
		const secondSetting = 'test.marketplace.second.enabled';
		const { container, widget, service, setSourceEnabled } = createWidget(
			false, document.body, CustomizationMarketplaceWidget,
			{ sourceEnabled: true, additionalSources: [{ id: 'second', enablementSetting: secondSetting }] });
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('First source')], nextCursor: createCursor('next') });
		await setSourceEnabled(true, secondSetting);
		const afterAdding = { names: getCardNames(container), display: widget.element.style.display };
		await setSourceEnabled(false);
		await service.requests[1].result.complete({ items: [createResource('Stale combined results')] });
		await service.requests[2].result.complete({ items: [createResource('Second source', { sourceId: 'second' })] });
		const remainingSource = {
			cancelledPrevious: service.requests[1].token.isCancellationRequested,
			names: getCardNames(container),
			display: widget.element.style.display,
			cursors: service.requests.map(request => request.options.cursor),
		};
		await setSourceEnabled(false, secondSetting);
		const noneEnabled = { names: getCardNames(container), display: widget.element.style.display, queries: service.requests.length };
		await setSourceEnabled(true, secondSetting);
		await service.requests[3].result.complete({ items: [createResource('Fresh second source', { sourceId: 'second' })] });
		assert.deepStrictEqual({ afterAdding, remainingSource, noneEnabled, reenabled: getCardNames(container) }, {
			afterAdding: { names: [], display: '' },
			remainingSource: { cancelledPrevious: true, names: ['Second source'], display: '', cursors: [undefined, undefined, undefined] },
			noneEnabled: { names: [], display: 'none', queries: 3 },
			reenabled: ['Fresh second source'],
		});
	});

	test('loads only when visible and reuses completed results on reactivation', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(false);
		widget.layout();
		const beforeVisible = service.requests.length;
		widget.setVisible(true);
		widget.setVisible(true);
		const loading = getElement(container, '.customization-marketplace-results').getAttribute('aria-busy');
		await service.requests[0].result.complete({ items: [createResource('Review')], total: 1 });
		widget.setVisible(false);
		widget.setVisible(true);

		assert.deepStrictEqual({
			beforeVisible,
			heading: getElement(container, 'h2').textContent,
			description: getElement(container, '.customization-marketplace-description').textContent,
			queries: service.requests.map(request => request.options),
			loading,
			busy: getElement(container, '.customization-marketplace-results').getAttribute('aria-busy'),
			names: getCardNames(container),
			status: getElement(container, '.customization-marketplace-status').textContent,
		}, {
			beforeVisible: 0,
			heading: 'Marketplace',
			description: 'Discover skills, MCP servers, and plugins for your agents.',
			queries: [{ query: '', mediaType: undefined, pageSize: 24, cursor: undefined }],
			loading: 'true',
			busy: 'false',
			names: ['Review'],
			status: 'Showing 1 of 1 resources',
		});
	});

	test('initial loading shows decorative skeleton cards and an accessible loading state', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		const loading = getElement(container, '.customization-marketplace-loading');
		const before = {
			skeletons: loading.children.length,
			ariaHidden: loading.getAttribute('aria-hidden'),
			focusable: loading.querySelectorAll('a, button, input, select, [tabindex]').length,
			visibleStatus: getElement(container, '.customization-marketplace-status').textContent,
			accessible: widget.getAccessibilityContent(),
		};
		await service.requests[0].result.complete({ items: [createResource('Review')], total: 1 });

		assert.deepStrictEqual({
			before,
			after: { skeletons: loading.children.length, display: loading.style.display, names: getCardNames(container) },
		}, {
			before: { skeletons: 6, ariaHidden: 'true', focusable: 0, visibleStatus: '', accessible: 'Marketplace\n\nLoading resources...' },
			after: { skeletons: 0, display: 'none', names: ['Review'] },
		});
	});

	test('pagination shows skeletons after existing results and removes them on failure', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First')], total: 2, nextCursor: createCursor('next-page'),
		});
		getButton(container, 'Load More').click();
		const loading = getElement(container, '.customization-marketplace-loading');
		const before = {
			skeletons: loading.children.length,
			appended: loading.classList.contains('loading-more'),
			names: getCardNames(container),
			status: getElement(container, '.customization-marketplace-status').textContent,
			accessibleLoading: widget.getAccessibilityContent().includes('Loading more resources...'),
		};
		await service.requests[1].result.error(new Error('Offline'));

		assert.deepStrictEqual({
			before,
			after: { skeletons: loading.children.length, names: getCardNames(container), error: getElement(container, '.customization-marketplace-error').textContent },
		}, {
			before: { skeletons: 2, appended: true, names: ['First'], status: 'Showing 1 of 2 resources', accessibleLoading: true },
			after: { skeletons: 0, names: ['First'], error: 'Could not load the marketplace. Offline' },
		});
	});

	test('hiding and disposing remove shimmer placeholders and ignore cancelled responses', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		const loading = getElement(container, '.customization-marketplace-loading');
		widget.setVisible(false);
		const hidden = { skeletons: loading.children.length, cancelled: service.requests[0].token.isCancellationRequested };
		await service.requests[0].result.complete({ items: [createResource('Hidden')] });
		widget.setVisible(true);
		const reactivated = loading.children.length;
		widget.dispose();
		await service.requests[1].result.complete({ items: [createResource('Disposed')] });

		assert.deepStrictEqual({
			hidden, reactivated, disposed: loading.children.length, names: getCardNames(container),
		}, { hidden: { skeletons: 0, cancelled: true }, reactivated: 6, disposed: 0, names: [] });
	});

	test('reduced motion and high contrast use static placeholders', () => {
		const { container, widget } = createWidget();
		widget.setVisible(true);
		const block = getElement(container, '.customization-marketplace-skeleton-block');
		const animations = [];
		for (const className of ['monaco-reduce-motion', 'hc-black', 'hc-light']) {
			container.classList.add(className);
			animations.push(DOM.getWindow(block).getComputedStyle(block).animationName);
			container.classList.remove(className);
		}
		assert.deepStrictEqual(animations, ['none', 'none', 'none']);
	});

	test('debounces trimmed search and cancels the obsolete query immediately', () => runWithFakedTimers({}, async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		setSearch(container, '  review  ');
		const cancelled = service.requests[0].token.isCancellationRequested;
		await timeout(200);
		setSearch(container, '  review tests  ');
		await timeout(299);
		const requestsBeforeDebounce = service.requests.length;
		await timeout(1);
		await service.requests[1].result.complete({ items: [createResource('Current')] });
		setSearch(container, 'review tests');
		await timeout(300);

		assert.deepStrictEqual({
			cancelled,
			requestsBeforeDebounce,
			queries: service.requests.map(request => request.options.query),
			names: getCardNames(container),
		}, {
			cancelled: true,
			requestsBeforeDebounce: 1,
			queries: ['', 'review tests'],
			names: ['Current'],
		});
	}));

	test('Enter searches immediately without a second debounced request', () => runWithFakedTimers({}, async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		const input = setSearch(container, 'find a server');
		pressKey(input, 'Enter', 13);
		const requestedImmediately = service.requests.length;
		await service.requests[1].result.complete({ items: [createResource('Server')] });
		await timeout(300);

		assert.deepStrictEqual({
			requestedImmediately,
			queries: service.requests.map(request => request.options.query),
			names: getCardNames(container),
		}, {
			requestedImmediately: 2,
			queries: ['', 'find a server'],
			names: ['Server'],
		});
	}));

	test('composition Enter does not bypass the search debounce', () => runWithFakedTimers({}, async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		const input = setSearch(container, '検索');
		pressKey(input, 'Enter', 13, true);
		const composingRequestCount = service.requests.length;
		await timeout(300);

		assert.deepStrictEqual({
			composingRequestCount,
			queries: service.requests.map(request => request.options.query),
		}, { composingRequestCount: 1, queries: ['', '検索'] });
	}));

	test('ignores stale success and failure responses while the latest search is pending', async () => {
		const { container, widget, service, signals } = createWidget();
		widget.setVisible(true);
		pressKey(setSearch(container, 'first'), 'Enter', 13);
		pressKey(setSearch(container, 'latest'), 'Enter', 13);
		await service.requests[0].result.complete({ items: [createResource('Stale')] });
		await service.requests[1].result.error(new Error('Obsolete failure'));
		const pendingState = {
			busy: getElement(container, '.customization-marketplace-results').getAttribute('aria-busy'),
			names: getCardNames(container),
			error: getElement(container, '.customization-marketplace-error').textContent,
		};
		await service.requests[2].result.complete({ items: [createResource('Latest')] });

		assert.deepStrictEqual({
			pendingState,
			names: getCardNames(container),
			signals,
		}, {
			pendingState: { busy: 'true', names: [], error: '' },
			names: ['Latest'],
			signals: [],
		});
	});

	test('ignores a cancelled response that arrives after the current results', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		pressKey(setSearch(container, 'current'), 'Enter', 13);
		await service.requests[1].result.complete({ items: [createResource('Current')], total: 1 });
		await service.requests[0].result.complete({ items: [createResource('Obsolete')], total: 20 });

		assert.deepStrictEqual({
			names: getCardNames(container),
			status: getElement(container, '.customization-marketplace-status').textContent,
		}, { names: ['Current'], status: 'Showing 1 of 1 resources' });
	});

	test('applies all resource type filters immediately and resets pagination', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('Original')],
			nextCursor: createCursor('next-page'),
		});
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		const select = getElement<HTMLSelectElement>(container, '.customization-marketplace-type-filter select');
		for (let index = 1; index < select.options.length; index++) {
			select.selectedIndex = index;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}
		select.selectedIndex = 0;
		select.dispatchEvent(new Event('change', { bubbles: true }));

		assert.deepStrictEqual({
			labels: Array.from(select.options, option => option.text),
			queries: service.requests.slice(2).map(request => request.options),
			names: getCardNames(container),
		}, {
			labels: ['All Resource Types', 'Skills', 'MCP Servers', 'Copilot Plugins', 'Claude Plugins', 'Cursor Plugins'],
			queries: [
				CustomizationMarketplaceMediaType.Skill, CustomizationMarketplaceMediaType.McpServer,
				CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.ClaudePlugin,
				CustomizationMarketplaceMediaType.CursorPlugin, undefined,
			].map(mediaType => ({ query: 'review', mediaType, pageSize: 24, cursor: undefined })),
			names: [],
		});
	});

	test('retries a failed next page without removing cards and deduplicates both pages', async () => {
		const { container, widget, service, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First'), createResource('First')],
			total: 3,
			nextCursor: createCursor('next-page'),
		});
		const loadMoreButton = getButton(container, 'Load More');
		loadMoreButton.focus();
		pressKey(loadMoreButton, 'Enter', 13);
		await service.requests[1].result.error(new Error('Network unavailable'));
		const retryButton = getButton(container, 'Retry');
		const afterFailure = {
			names: getCardNames(container),
			error: getElement(container, '.customization-marketplace-error').textContent,
			retryVisible: retryButton.style.display !== 'none',
			loadMoreVisible: loadMoreButton.style.display !== 'none',
			retryFocused: DOM.getActiveElement() === retryButton,
		};
		pressKey(retryButton, 'Enter', 13);
		retryButton.click();
		pressKey(retryButton, 'Enter', 13);
		const pendingRetry = {
			requests: service.requests.length,
			names: getCardNames(container),
			error: getElement(container, '.customization-marketplace-error').textContent,
			visible: retryButton.style.display !== 'none',
			disabled: retryButton.getAttribute('aria-disabled'),
			focused: DOM.getActiveElement() === retryButton,
		};
		await service.requests[2].result.complete({
			items: [createResource('First'), createResource('Second'), createResource('Second'), createResource('Third')],
			total: 3,
		});

		assert.deepStrictEqual({
			afterFailure,
			pendingRetry,
			cursors: service.requests.slice(1).map(request => request.options.cursor),
			names: getCardNames(container),
			status: getElement(container, '.customization-marketplace-status').textContent,
			retryVisible: getButton(container, 'Retry').style.display !== 'none',
			loadMoreVisible: getButton(container, 'Load More').style.display !== 'none',
			focused: DOM.getActiveElement()?.querySelector('.customization-marketplace-name')?.textContent,
			signals,
		}, {
			afterFailure: {
				names: ['First'],
				error: 'Could not load the marketplace. Network unavailable',
				retryVisible: true,
				loadMoreVisible: false,
				retryFocused: true,
			},
			pendingRetry: {
				requests: 3,
				names: ['First'],
				error: 'Could not load the marketplace. Network unavailable',
				visible: true,
				disabled: 'true',
				focused: true,
			},
			cursors: [createCursor('next-page'), createCursor('next-page')],
			names: ['First', 'Second', 'Third'],
			status: 'Showing 3 of 3 resources',
			retryVisible: false,
			loadMoreVisible: false,
			focused: 'Second',
			signals: [[AccessibilitySignal.taskFailed, { modality: 'sound' }]],
		});
	});

	test('deduplicates by source, identifier and version while forwarding opaque cursors unchanged', async () => {
		const { container, widget, service } = createWidget();
		const first = createResource('shared', { displayName: 'First source', version: '1.0.0' });
		const second = createResource('shared', { sourceId: 'otherTestSource', displayName: 'Second source', version: '1.0.0' });
		const nextVersion = createResource('shared', { displayName: 'Next version', version: '2.0.0' });
		const nextCursor: ICustomizationMarketplaceCursor = {
			query: '',
			pageSize: 24,
			sources: [
				{ id: 'testSource', cursor: 'opaque-page-token', total: 2 },
				{ id: 'otherTestSource', total: 1 },
			],
		};
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [first, first, second, second], total: 3, nextCursor });
		const firstPageNames = getCardNames(container);
		getButton(container, 'Load More').click();
		await service.requests[1].result.complete({ items: [first, second, nextVersion, nextVersion], total: 3 });

		assert.deepStrictEqual({
			firstPageNames,
			names: getCardNames(container),
			cursorForwardedUnchanged: service.requests[1].options.cursor === nextCursor,
			status: getElement(container, '.customization-marketplace-status').textContent,
		}, {
			firstPageNames: ['First source', 'Second source'],
			names: ['First source', 'Second source', 'Next version'],
			cursorForwardedUnchanged: true,
			status: 'Showing 3 of 3 resources',
		});
	});

	test('refresh replaces the current search from the first page', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		await service.requests[1].result.complete({
			items: [createResource('Original')],
			nextCursor: createCursor('next-page', 'review'),
		});
		getButton(container, 'Load More').click();
		await service.requests[2].result.complete({ items: [createResource('More')] });
		getButton(container, 'Refresh').click();
		await service.requests[3].result.complete({ items: [createResource('Updated')] });

		assert.deepStrictEqual({
			pagination: service.requests[2].options,
			refresh: service.requests[3].options,
			names: getCardNames(container),
		}, {
			pagination: { query: 'review', mediaType: undefined, pageSize: 24, cursor: createCursor('next-page', 'review') },
			refresh: { query: 'review', mediaType: undefined, pageSize: 24, cursor: undefined },
			names: ['Updated'],
		});
	});

	test('hiding cancels pending work and reactivation restarts the unfinished request', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		widget.setVisible(false);
		const hiddenState = {
			cancelled: service.requests[0].token.isCancellationRequested,
			display: widget.element.style.display,
		};
		await service.requests[0].result.complete({ items: [createResource('Hidden result')] });
		const hiddenNames = getCardNames(container);
		widget.setVisible(true);
		await service.requests[1].result.complete({ items: [createResource('Visible result')] });

		assert.deepStrictEqual({
			hiddenState, hiddenNames,
			requests: service.requests.length,
			names: getCardNames(container),
		}, {
			hiddenState: { cancelled: true, display: 'none' },
			hiddenNames: [],
			requests: 2,
			names: ['Visible result'],
		});
	});

	test('hiding cancels a scheduled search until the widget is shown again', () => runWithFakedTimers({}, async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		setSearch(container, 'pending');
		widget.setVisible(false);
		await timeout(400);
		const requestsWhileHidden = service.requests.length;
		widget.setVisible(true);

		assert.deepStrictEqual({
			requestsWhileHidden,
			queries: service.requests.map(request => request.options.query),
		}, { requestsWhileHidden: 1, queries: ['', 'pending'] });
	}));

	test('disposing cancels in-flight requests and prevents late rendering', async () => {
		const { container, widget, service, signals } = createWidget();
		widget.setVisible(true);
		widget.dispose();
		await service.requests[0].result.complete({ items: [createResource('Disposed result')] });

		assert.deepStrictEqual({
			cancelled: service.requests[0].token.isCancellationRequested,
			names: getCardNames(container),
			signals,
		}, { cancelled: true, names: [], signals: [] });
	});

	test('disposing cancels the search debounce', () => runWithFakedTimers({}, async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		setSearch(container, 'pending');
		widget.dispose();
		await timeout(400);
		assert.deepStrictEqual(service.requests.map(request => request.options.query), ['']);
	}));

	test('disabled AI prevents requests and disabling during a request cancels it', async () => {
		const { container, widget, service, setAIHidden } = createWidget(true);
		widget.setVisible(true);
		const disabledState = { requests: service.requests.length, display: widget.element.style.display };
		setAIHidden(false);
		setAIHidden(true);
		const cancelled = service.requests[0].token.isCancellationRequested;
		await service.requests[0].result.complete({ items: [createResource('Hidden')] });
		const hiddenNames = getCardNames(container);
		setAIHidden(false);
		await service.requests[1].result.complete({ items: [createResource('Enabled')] });

		assert.deepStrictEqual({
			disabledState, cancelled, hiddenNames,
			requests: service.requests.length,
			names: getCardNames(container),
		}, {
			disabledState: { requests: 0, display: 'none' },
			cancelled: true,
			hiddenNames: [],
			requests: 2,
			names: ['Enabled'],
		});
	});

	test('unrelated sentiment updates do not cancel an in-flight catalog request', async () => {
		const { container, widget, service, setSentiment } = createWidget();
		widget.setVisible(true);
		setSentiment({ completed: true, registered: true });
		setSentiment({ hidden: undefined });
		const duringRequest = { requests: service.requests.length, cancelled: service.requests[0].token.isCancellationRequested };
		await service.requests[0].result.complete({ items: [createResource('Review')] });

		assert.deepStrictEqual({ duringRequest, names: getCardNames(container) }, {
			duringRequest: { requests: 1, cancelled: false }, names: ['Review'],
		});
	});

	test('unrelated sentiment updates preserve the query, results, pagination and scroll position', async () => {
		const { container, widget, service, setSentiment } = createWidget();
		setSearch(container, 'review');
		widget.setVisible(true);
		const firstPage = Array.from({ length: 12 }, (_, index) => createResource(`First ${index}`));
		const secondPage = Array.from({ length: 12 }, (_, index) => createResource(`Second ${index}`));
		await service.requests[0].result.complete({ items: firstPage, nextCursor: createCursor('page-2', 'review') });
		getButton(container, 'Load More').click();
		await service.requests[1].result.complete({ items: secondPage, nextCursor: createCursor('page-3', 'review') });
		const scroll = getElement(container, '.customization-marketplace-scroll-content');
		scroll.scrollTop = 120;
		widget.layout();

		for (const field of ['completed', 'disabled', 'untrusted', 'installed', 'later', 'registered'] as const) {
			setSentiment({ [field]: true });
		}
		const unchanged = {
			requests: service.requests.length,
			query: getElement<HTMLInputElement>(container, '.customization-marketplace-search input').value,
			names: getCardNames(container),
			scrollTop: scroll.scrollTop,
		};
		getButton(container, 'Load More').click();
		const nextRequest = service.requests[2];
		await nextRequest.result.complete({ items: [createResource('Last')] });

		assert.deepStrictEqual({ unchanged, nextRequest: nextRequest.options }, {
			unchanged: {
				requests: 2, query: 'review', names: [...firstPage, ...secondPage].map(item => item.displayName), scrollTop: 120,
			},
			nextRequest: { query: 'review', mediaType: undefined, pageSize: 24, cursor: createCursor('page-3', 'review') },
		});
	});

	test('renders initial errors and a successful empty retry in the accessible view', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.error(new Error('Try later'));
		const errorContent = widget.getAccessibilityContent();
		getButton(container, 'Retry').click();
		await service.requests[1].result.complete({ items: [], total: 0 });

		assert.deepStrictEqual({
			errorContent,
			emptyVisible: getElement(container, '.customization-marketplace-empty').style.display !== 'none',
			errorVisible: getElement(container, '.customization-marketplace-error').style.display !== 'none',
			content: widget.getAccessibilityContent(),
		}, {
			errorContent: 'Marketplace\n\nCould not load the marketplace. Try later',
			emptyVisible: true,
			errorVisible: false,
			content: 'Marketplace\n\nShowing 0 of 0 resources\n\nNo resources found. Try a different search or resource type.',
		});
	});

	test('cancellation does not display an error or play an error signal', async () => {
		const { container, widget, service, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.error(new CancellationError());

		assert.deepStrictEqual({
			error: getElement(container, '.customization-marketplace-error').textContent,
			retryVisible: getButton(container, 'Retry').style.display !== 'none',
			busy: getElement(container, '.customization-marketplace-results').getAttribute('aria-busy'),
			signals,
		}, { error: '', retryVisible: false, busy: 'false', signals: [] });
	});

	test('installation actions follow service state without interpreting catalog provenance', async () => {
		const { container, widget, service, installService, hovers } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')] });
		const button = getElement(container, '.customization-marketplace-install-button');
		const presentations = [getInstallPresentation(container)];
		for (const kind of ['installing', 'installed'] as const) {
			installService.setState(createResource('Review'), { kind });
			button.click();
			presentations.push(getInstallPresentation(container));
		}
		const reason = 'Installation is disabled by your organization.';
		installService.setState(createResource('Review'), { kind: 'unavailable', message: reason });
		button.click();
		presentations.push(getInstallPresentation(container));
		const hover = hovers.find(([target]) => target === button)?.[1];

		assert.deepStrictEqual({
			presentations,
			calls: installService.requests.length,
			label: button.getAttribute('aria-label'),
			hover: typeof hover === 'function' ? hover().content : hover?.content,
			accessibleStatus: widget.getAccessibilityContent().split('\n').at(-1),
		}, {
			presentations: [
				{ label: 'Install', enabled: true, busy: false, error: '' },
				{ label: 'Installing...', enabled: false, busy: true, error: '' },
				{ label: 'Installed', enabled: false, busy: false, error: '' },
				{ label: 'Install', enabled: false, busy: false, error: '' },
			],
			calls: 0,
			label: `Install Review. ${reason}`,
			hover: `Installation unavailable. ${reason}`,
			accessibleStatus: `Installation unavailable. ${reason}`,
		});
	});

	test('installation and accessible states remain independent across sources and versions', async () => {
		const { container, widget, service, installService } = createWidget();
		const first = createResource('shared', { displayName: 'First source', version: '1.0.0' });
		const second = createResource('shared', { sourceId: 'otherTestSource', displayName: 'Second source', version: '1.0.0' });
		const nextVersion = createResource('shared', { displayName: 'Next version', version: '2.0.0' });
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [first, second, nextVersion], total: 3 });
		installService.setState(first, { kind: 'installed' });
		installService.setState(second, { kind: 'unavailable', message: 'This source does not support installation.' });
		installService.setState(nextVersion, { kind: 'installing' });
		const cards = Array.from(container.querySelectorAll<HTMLElement>('.customization-marketplace-card'));

		assert.deepStrictEqual({
			names: getCardNames(container),
			actions: cards.map(card => ({
				...getInstallPresentation(card),
				ariaLabel: getElement(card, '.customization-marketplace-install-button').getAttribute('aria-label'),
			})),
			accessibleStates: widget.getAccessibilityContent().split('\n\n').slice(2).map(content => content.split('\n').at(-1)),
			installs: installService.requests.length,
		}, {
			names: ['First source', 'Second source', 'Next version'],
			actions: [
				{ label: 'Installed', enabled: false, busy: false, error: '', ariaLabel: 'Installed: First source' },
				{ label: 'Install', enabled: false, busy: false, error: '', ariaLabel: 'Install Second source. This source does not support installation.' },
				{ label: 'Installing...', enabled: false, busy: true, error: '', ariaLabel: 'Installing...: Next version' },
			],
			accessibleStates: ['Installed', 'Installation unavailable. This source does not support installation.', 'Installing...'],
			installs: 0,
		});
	});

	test('installation suppresses duplicate activation and preserves focus and catalog controls', async () => {
		const { container, widget, service, installService, opened } = createWidget();
		const resource = createResource('Review', { url: URI.parse('https://example.com/review') });
		widget.setVisible(true);
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		await service.requests[1].result.complete({ items: [resource] });
		const button = getElement(container, '.customization-marketplace-install-button');
		button.focus();
		pressKey(button, 'Enter', 13);
		button.click();
		pressKey(button, ' ', 32);
		const pending = getInstallPresentation(container);
		installService.setState(resource, { kind: 'installed' });
		await installService.requests[0].result.complete();
		const installationKeptFocus = DOM.getActiveElement() === button;
		getElement<HTMLAnchorElement>(container, '.customization-marketplace-card a[href]').click();

		assert.deepStrictEqual({
			calls: installService.requests.map(request => request.resource),
			pending,
			completed: getInstallPresentation(container),
			installationKeptFocus,
			query: getElement<HTMLInputElement>(container, '.customization-marketplace-search input').value,
			names: getCardNames(container),
			catalogCalls: service.requests.length,
			opened,
		}, {
			calls: [resource],
			pending: { label: 'Installing...', enabled: false, busy: true, error: '' },
			completed: { label: 'Installed', enabled: false, busy: false, error: '' },
			installationKeptFocus: true,
			query: 'review',
			names: ['Review'],
			catalogCalls: 2,
			opened: [[resource.url, { openExternal: true, allowCommands: false, allowContributedOpeners: false }]],
		});
	});

	test('cancelled installation restores Install without an error or a success state', async () => {
		const { container, widget, service, installService, notifications, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')] });
		const button = getElement(container, '.customization-marketplace-install-button');
		button.focus();
		button.click();
		await installService.requests[0].result.error(new CancellationError());

		assert.deepStrictEqual({
			action: getInstallPresentation(container),
			focused: DOM.getActiveElement() === button,
			notifications,
			signals,
			accessibleStatus: widget.getAccessibilityContent().split('\n').at(-1),
		}, {
			action: { label: 'Install', enabled: true, busy: false, error: '' },
			focused: true,
			notifications: [],
			signals: [],
			accessibleStatus: 'Available to install',
		});
	});

	test('failed installation shows an inline retry without clearing the catalog or marking it installed', async () => {
		const { container, widget, service, installService, notifications, signals } = createWidget();
		widget.setVisible(true);
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		await service.requests[1].result.complete({ items: [createResource('Review')] });
		const button = getElement(container, '.customization-marketplace-install-button');
		button.focus();
		button.click();
		await installService.requests[0].result.error(new Error('Destination is not writable'));
		const failed = getInstallPresentation(container);
		const error = getElement(container, '.customization-marketplace-install-error');
		const errorAssociatedWithButton = button.getAttribute('aria-describedby') === error.id;
		const accessibleError = widget.getAccessibilityContent().split('\n').at(-1);
		button.click();
		const retrying = getInstallPresentation(container);
		installService.setState(createResource('Review'), { kind: 'installed' });
		await installService.requests[1].result.complete();

		assert.deepStrictEqual({
			failed,
			errorAssociatedWithButton,
			accessibleError,
			retrying,
			completed: getInstallPresentation(container),
			query: getElement<HTMLInputElement>(container, '.customization-marketplace-search input').value,
			names: getCardNames(container),
			requests: installService.requests.length,
			focused: DOM.getActiveElement() === button,
			notifications,
			signals,
		}, {
			failed: {
				label: 'Retry Install', enabled: true, busy: false,
				error: 'Could not install Review. Destination is not writable',
			},
			errorAssociatedWithButton: true,
			accessibleError: 'Could not install Review. Destination is not writable',
			retrying: { label: 'Installing...', enabled: false, busy: true, error: '' },
			completed: { label: 'Installed', enabled: false, busy: false, error: '' },
			query: 'review',
			names: ['Review'],
			requests: 2,
			focused: true,
			notifications: [],
			signals: [[AccessibilitySignal.taskFailed, { modality: 'sound' }]],
		});
	});

	test('a resolved install promise alone never marks a resource Installed', async () => {
		const { container, widget, service, installService, notifications, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')] });
		getElement(container, '.customization-marketplace-install-button').click();
		await installService.requests[0].result.complete();

		assert.deepStrictEqual({
			action: getInstallPresentation(container),
			accessibleStatus: widget.getAccessibilityContent().split('\n').at(-1),
			notifications,
			signals,
		}, {
			action: { label: 'Install', enabled: true, busy: false, error: '' },
			accessibleStatus: 'Available to install',
			notifications: [],
			signals: [],
		});
	});

	test('hiding cancels catalog paging but leaves installation owned by its service', async () => {
		const { container, widget, service, installService, notifications, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('Review')],
			nextCursor: createCursor('next-page'),
		});
		getElement(container, '.customization-marketplace-install-button').click();
		getButton(container, 'Load More').click();
		widget.setVisible(false);
		const installationStillPending = !installService.requests[0].result.isSettled;
		installService.setState(createResource('Review'), { kind: 'installed' });
		await installService.requests[0].result.complete();
		await service.requests[1].result.complete({ items: [createResource('Hidden result')] });
		widget.setVisible(true);

		assert.deepStrictEqual({
			installationStillPending,
			catalogCancelled: service.requests[1].token.isCancellationRequested,
			action: getInstallPresentation(container),
			names: getCardNames(container),
			installCalls: installService.requests.length,
			catalogCalls: service.requests.length,
			notifications,
			signals,
		}, {
			installationStillPending: true,
			catalogCancelled: true,
			action: { label: 'Installed', enabled: false, busy: false, error: '' },
			names: ['Review'],
			installCalls: 1,
			catalogCalls: 2,
			notifications: [],
			signals: [],
		});
	});

	test('disposing unsubscribes installation updates and prevents late mutations of destroyed cards', async () => {
		const { container, widget, service, installService, notifications, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')] });
		getElement(container, '.customization-marketplace-install-button').click();
		const card = getElement(container, '.customization-marketplace-card');
		widget.dispose();
		const disposedMarkup = card.innerHTML;
		installService.stateReads.length = 0;
		installService.setState(createResource('Review'), { kind: 'installed' });
		await installService.requests[0].result.complete();

		assert.deepStrictEqual({
			mutated: card.innerHTML !== disposedMarkup,
			stateReads: installService.stateReads,
			notifications,
			signals,
		}, { mutated: false, stateReads: [], notifications: [], signals: [] });
	});

	test('changing catalog search releases old installation views while the service operation continues', async () => {
		const { container, widget, service, installService } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')] });
		getElement(container, '.customization-marketplace-install-button').click();
		const oldCard = getElement(container, '.customization-marketplace-card');
		pressKey(setSearch(container, 'browser'), 'Enter', 13);
		const oldMarkup = oldCard.innerHTML;
		await service.requests[1].result.complete({ items: [createResource('Browser')] });
		installService.stateReads.length = 0;
		installService.setState(createResource('Review'), { kind: 'installed' });
		await installService.requests[0].result.complete();

		assert.deepStrictEqual({
			oldCardMutated: oldCard.innerHTML !== oldMarkup,
			updatedResources: [...new Set(installService.stateReads)],
			names: getCardNames(container),
			action: getInstallPresentation(container),
			installCalls: installService.requests.length,
		}, {
			oldCardMutated: false,
			updatedResources: ['Browser'],
			names: ['Browser'],
			action: { label: 'Install', enabled: true, busy: false, error: '' },
			installCalls: 1,
		});
	});

	for (const lifecycle of ['hidden', 'disposed'] as const) {
		test(`installation failures remain visible as notifications after the widget is ${lifecycle}`, async () => {
			const { container, widget, service, installService, notifications, signals } = createWidget();
			widget.setVisible(true);
			await service.requests[0].result.complete({ items: [createResource('Review')] });
			getElement(container, '.customization-marketplace-install-button').click();
			if (lifecycle === 'hidden') {
				widget.setVisible(false);
			} else {
				widget.dispose();
			}
			const beforeFailure = container.innerHTML;
			await installService.requests[0].result.error(new Error('Installation failed'));

			assert.deepStrictEqual({
				notifications,
				signals,
				disposedMarkupUnchanged: lifecycle !== 'disposed' || container.innerHTML === beforeFailure,
				presentation: lifecycle === 'hidden' ? getInstallPresentation(container) : undefined,
			}, {
				notifications: ['Could not install Review. Installation failed'],
				signals: [],
				disposedMarkupUnchanged: true,
				presentation: lifecycle === 'hidden' ? {
					label: 'Retry Install', enabled: true, busy: false, error: 'Could not install Review. Installation failed',
				} : undefined,
			});
		});
	}

	test('renders untrusted content as text and opens only external resource links', async () => {
		const { container, widget, service, opened } = createWidget();
		const resource = createResource('unsafe-text', {
			displayName: '<img src=x onerror=alert(1)>',
			description: '<script>alert("description")</script> [command](command:workbench.action.closeWindow)',
			publisher: '<b>Publisher</b>',
			tags: ['<img src=x>', 'two', 'three', 'four', 'five'],
			capabilities: ['<a href="command:run">Capability</a>'],
			representativeQueries: ['<iframe src="https://example.com">'],
			url: URI.parse('https://example.com/skill'),
			repository: URI.parse('https://github.com/example/skill'),
		});
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [resource] });
		const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.customization-marketplace-card a[href]'));
		for (const link of links) {
			link.click();
		}

		assert.deepStrictEqual({
			name: getElement(container, '.customization-marketplace-name').textContent,
			description: getElement(container, '.customization-marketplace-card-description').textContent,
			publisher: getElement(container, '.customization-marketplace-publisher').textContent,
			executableElements: container.querySelectorAll('.customization-marketplace-card img, .customization-marketplace-card script, .customization-marketplace-card iframe').length,
			actions: links.map(link => ({ label: link.textContent, rel: link.rel })),
			inlineTags: Array.from(container.querySelectorAll('.customization-marketplace-tag'), tag => tag.textContent),
			details: Array.from(container.querySelectorAll('.customization-marketplace-details li'), item => item.textContent),
			opened,
		}, {
			name: resource.displayName,
			description: resource.description,
			publisher: resource.publisher,
			executableElements: 0,
			actions: [
				{ label: 'Open Resource', rel: 'noopener noreferrer' },
				{ label: 'View Repository', rel: 'noopener noreferrer' },
			],
			inlineTags: resource.tags.slice(0, 4),
			details: [...resource.capabilities, ...resource.representativeQueries, ...resource.tags],
			opened: [resource.url, resource.repository].map(uri => [uri, {
				openExternal: true, allowCommands: false, allowContributedOpeners: false,
			}]),
		});
	});

	test('reports failures opening external resources without removing results', async () => {
		const { container, widget, service, notifications, setOpenError } = createWidget();
		setOpenError(new Error('Browser unavailable'));
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('Review', { url: URI.parse('https://example.com/review') })],
		});
		getElement<HTMLAnchorElement>(container, '.customization-marketplace-card a[href]').click();
		await Promise.resolve();

		assert.deepStrictEqual({
			names: getCardNames(container),
			notifications,
		}, {
			names: ['Review'],
			notifications: ['Could not open the marketplace resource. Browser unavailable'],
		});
	});

	test('preserves escaped separators in external resource links and accessible destinations', async () => {
		const { container, widget, service, opened, hovers } = createWidget();
		const externalUrl = 'https://example.com/mcp/example%2Fbrowser-tools?reference=feature%2Fone';
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('Encoded server', {
				mediaType: CustomizationMarketplaceMediaType.McpServer,
				url: URI.parse(externalUrl),
				externalUrl,
			})],
		});
		const link = getElement<HTMLAnchorElement>(container, '.customization-marketplace-card a[href]');
		const hoverOptions = hovers.find(([target]) => target === link)?.[1];
		link.click();

		assert.deepStrictEqual({
			href: link.href,
			hover: typeof hoverOptions === 'function' ? hoverOptions().content : hoverOptions?.content,
			accessibleDestination: widget.getAccessibilityContent().split('\n').at(-1),
			opened,
		}, {
			href: externalUrl,
			hover: externalUrl,
			accessibleDestination: `Resource: ${externalUrl}`,
			opened: [[externalUrl, { openExternal: true, allowCommands: false, allowContributedOpeners: false }]],
		});
	});

	test('keeps fallback icons until images load and restores them on failure', async () => {
		const { container, widget, service } = createWidget();
		const icon = URI.parse('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E');
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [
				createResource('Loaded', { icon }),
				createResource('Failed', { icon, mediaType: CustomizationMarketplaceMediaType.McpServer }),
				createResource('No icon', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin }),
			],
		});
		const cards = container.querySelectorAll<HTMLElement>('.customization-marketplace-card');
		const loadedImage = getElement<HTMLImageElement>(cards[0], 'img');
		const failedImage = getElement<HTMLImageElement>(cards[1], 'img');
		const beforeLoad = {
			imageOpacity: loadedImage.style.opacity,
			imageInLayout: loadedImage.style.display !== 'none',
			fallbackDisplay: getElement(cards[0], '.codicon').style.display,
			loading: loadedImage.loading,
		};
		loadedImage.dispatchEvent(new Event('load'));
		failedImage.dispatchEvent(new Event('load'));
		const failedFallbackAfterLoad = getElement(cards[1], '.codicon-server').style.display;
		failedImage.dispatchEvent(new Event('error'));

		assert.deepStrictEqual({
			beforeLoad,
			loaded: {
				imageOpacity: loadedImage.style.opacity,
				fallbackDisplay: getElement(cards[0], '.codicon').style.display,
				alt: loadedImage.alt,
				referrerPolicy: loadedImage.referrerPolicy,
				iconHidden: getElement(cards[0], '.customization-marketplace-icon').getAttribute('aria-hidden'),
			},
			failed: {
				fallbackAfterLoad: failedFallbackAfterLoad,
				image: cards[1].querySelector('img'),
				fallbackDisplay: getElement(cards[1], '.codicon-server').style.display,
			},
			absent: {
				image: cards[2].querySelector('img'),
				fallbackDisplay: getElement(cards[2], '.codicon-extensions').style.display,
			},
		}, {
			beforeLoad: { imageOpacity: '0', imageInLayout: true, fallbackDisplay: '', loading: 'lazy' },
			loaded: { imageOpacity: '1', fallbackDisplay: 'none', alt: '', referrerPolicy: 'no-referrer', iconHidden: 'true' },
			failed: { fallbackAfterLoad: 'none', image: null, fallbackDisplay: '' },
			absent: { image: null, fallbackDisplay: '' },
		});
	});

	test('cards support keyboard navigation without stealing keys from their links', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: ['First', 'Second', 'Third'].map(name => createResource(name, { url: URI.parse('https://example.com/resource') })),
		});
		const results = getElement(container, '.customization-marketplace-results');
		results.style.gridTemplateColumns = '1fr';
		const cards = Array.from(container.querySelectorAll<HTMLElement>('.customization-marketplace-card'));
		cards[0].focus();
		const focused: number[] = [];
		for (const [key, keyCode] of [['ArrowRight', 39], ['End', 35], ['ArrowDown', 40], ['Home', 36], ['ArrowDown', 40], ['ArrowUp', 38], ['ArrowLeft', 37]] as const) {
			pressKey(DOM.getActiveElement() as HTMLElement, key, keyCode);
			focused.push(cards.indexOf(DOM.getActiveElement() as HTMLElement));
		}
		const link = getElement<HTMLAnchorElement>(cards[1], 'a[href]');
		link.focus();
		const linkKey = pressKey(link, 'ArrowRight', 39);
		const tabKey = pressKey(cards[0], 'Tab', 9);
		const linkKeptFocus = DOM.getActiveElement() === link;
		widget.focus();

		assert.deepStrictEqual({
			focused,
			tabIndexes: cards.map(card => card.tabIndex),
			linkKeyPrevented: linkKey.defaultPrevented,
			tabKeyPrevented: tabKey.defaultPrevented,
			linkKeptFocus,
			searchFocused: DOM.getActiveElement() === getElement(container, '.customization-marketplace-search input'),
		}, {
			focused: [1, 2, 2, 0, 1, 0, 0],
			tabIndexes: [0, 0, 0],
			linkKeyPrevented: false,
			tabKeyPrevented: false,
			linkKeptFocus: true,
			searchFocused: true,
		});
	});

	test('loading more from the keyboard moves focus to the first new card', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First')],
			nextCursor: createCursor('next-page'),
		});
		const button = getButton(container, 'Load More');
		button.focus();
		pressKey(button, 'Enter', 13);
		await service.requests[1].result.complete({ items: [createResource('First'), createResource('Second')] });

		assert.deepStrictEqual({
			names: getCardNames(container),
			focused: DOM.getActiveElement()?.querySelector('.customization-marketplace-name')?.textContent,
		}, { names: ['First', 'Second'], focused: 'Second' });
	});

	test('a completed Load More request does not steal focus after leaving its button', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First')],
			nextCursor: createCursor('next-page'),
		});
		const button = getButton(container, 'Load More');
		button.focus();
		pressKey(button, 'Enter', 13);
		widget.focus();
		await service.requests[1].result.complete({ items: [createResource('Second')] });

		assert.deepStrictEqual({
			names: getCardNames(container),
			searchFocused: DOM.getActiveElement() === getElement(container, '.customization-marketplace-search input'),
		}, { names: ['First', 'Second'], searchFocused: true });
	});

	test('page errors and successful retries respect focus moved to other controls', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First')],
			nextCursor: createCursor('next-page'),
		});
		const button = getButton(container, 'Load More');
		button.focus();
		pressKey(button, 'Enter', 13);
		widget.focus();
		await service.requests[1].result.error(new Error('Try again'));
		const searchFocusedAfterFailure = DOM.getActiveElement() === getElement(container, '.customization-marketplace-search input');
		const retry = getButton(container, 'Retry');
		retry.focus();
		pressKey(retry, 'Enter', 13);
		const firstCard = getElement(container, '.customization-marketplace-card');
		firstCard.focus();
		await service.requests[2].result.complete({ items: [createResource('Second')] });

		assert.deepStrictEqual({
			searchFocusedAfterFailure,
			firstCardFocusedAfterRetry: DOM.getActiveElement() === firstCard,
			names: getCardNames(container),
		}, {
			searchFocusedAfterFailure: true,
			firstCardFocusedAfterRetry: true,
			names: ['First', 'Second'],
		});
	});

	test('accessible content includes all metadata, tags and external destinations', async () => {
		const { container, widget, service } = createWidget();
		const resource = createResource('Browser tools', {
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			publisher: 'Example Publisher',
			version: '2.4.0',
			stars: 12,
			tags: ['browser', 'testing', 'automation', 'web', 'screenshots'],
			capabilities: ['Read the current page', 'Take a screenshot'],
			representativeQueries: ['Find the failing checkout step'],
			url: URI.parse('https://example.com/browser'),
			repository: URI.parse('https://github.com/example/browser'),
		});
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [resource], total: 1 });

		assert.deepStrictEqual({
			label: getElement(container, '.customization-marketplace-card').getAttribute('aria-label'),
			content: widget.getAccessibilityContent(),
		}, {
			label: 'Browser tools, MCP server. Description of Browser tools',
			content: [
				'Marketplace',
				'Showing 1 of 1 resources',
				[
					'Browser tools', 'MCP server', 'Example Publisher', 'Description of Browser tools',
					'Version 2.4.0', '12 stars',
					'Tags:', ...resource.tags,
					'Capabilities:', ...resource.capabilities,
					'Example queries:', ...resource.representativeQueries,
					'Available to install',
					'Resource: https://example.com/browser', 'Repository: https://github.com/example/browser',
				].join('\n'),
			].join('\n\n'),
		});
	});

	test('accessible content omits absent metadata groups and destinations', async () => {
		const { widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')], total: 1 });

		assert.strictEqual(widget.getAccessibilityContent(), [
			'Marketplace',
			'Showing 1 of 1 resources',
			['Review', 'Skill', 'Description of Review', 'Available to install'].join('\n'),
		].join('\n\n'));
	});

	test('accessibility hints follow the verbosity setting and keybinding changes', async () => {
		const { container, configuration, setHelpKeybinding } = createWidget();
		const input = getElement(container, '.customization-marketplace-search input');
		const labels = [input.getAttribute('aria-label')];
		setHelpKeybinding(new USLayoutResolvedKeybinding(
			[new KeyCodeChord(true, false, false, false, KeyCode.KeyH)], OperatingSystem.Linux));
		labels.push(input.getAttribute('aria-label'));
		await configuration.setUserConfiguration(AccessibilityVerbositySettingId.CustomizationMarketplace, false);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === AccessibilityVerbositySettingId.CustomizationMarketplace; }
		}());
		labels.push(input.getAttribute('aria-label'));
		await configuration.setUserConfiguration(AccessibilityVerbositySettingId.CustomizationMarketplace, true);
		setHelpKeybinding(undefined);
		labels.push(input.getAttribute('aria-label'));

		assert.deepStrictEqual(labels, [
			'Search marketplace. Use Alt+F1 for accessibility help.',
			'Search marketplace. Use Control+H for accessibility help.',
			'Search marketplace',
			'Search marketplace',
		]);
	});
});
