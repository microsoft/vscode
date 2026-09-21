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
import { AgentFinderMediaType, IAgentFinderPage, IAgentFinderQuery, IAgentFinderResource, IAgentFinderService } from '../../../../../../platform/agentFinder/common/agentFinderService.js';
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
import { AgentFinderWidget } from '../../../browser/aiCustomization/agentFinderWidget.js';
import { AgentFinderInstallState, IAgentFinderInstallService } from '../../../common/agentFinderInstallService.js';

interface IRecordedQuery {
	readonly options: IAgentFinderQuery;
	readonly token: CancellationToken;
	readonly result: DeferredPromise<IAgentFinderPage>;
}

class TestAgentFinderService extends mock<IAgentFinderService>() {
	readonly requests: IRecordedQuery[] = [];

	override query(options: IAgentFinderQuery, token: CancellationToken): Promise<IAgentFinderPage> {
		const result = new DeferredPromise<IAgentFinderPage>();
		this.requests.push({ options, token, result });
		return result.p;
	}
}

class TestAgentFinderInstallService extends Disposable implements IAgentFinderInstallService {
	declare readonly _serviceBrand: undefined;
	private readonly changeEmitter = this._register(new Emitter<void>());
	readonly onDidChange = this.changeEmitter.event;
	private readonly states = new Map<string, AgentFinderInstallState>();
	readonly requests: { resource: IAgentFinderResource; result: DeferredPromise<void> }[] = [];
	readonly stateReads: string[] = [];

	getInstallState(resource: IAgentFinderResource): AgentFinderInstallState {
		this.stateReads.push(resource.identifier);
		return this.states.get(resource.identifier) ?? { kind: 'available' };
	}

	install(resource: IAgentFinderResource): Promise<void> {
		const result = new DeferredPromise<void>();
		this.requests.push({ resource, result });
		return result.p;
	}

	setState(identifier: string, state: AgentFinderInstallState): void {
		this.states.set(identifier, state);
		this.changeEmitter.fire();
	}
}

function createResource(identifier: string, overrides: Partial<IAgentFinderResource> = {}): IAgentFinderResource {
	return {
		identifier,
		displayName: identifier,
		description: `Description of ${identifier}`,
		mediaType: AgentFinderMediaType.Skill,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		...overrides,
	};
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
	return Array.from(container.querySelectorAll('.agent-finder-name'), element => element.textContent ?? '');
}

function getInstallPresentation(container: HTMLElement) {
	const button = getElement(container, '.agent-finder-install-button');
	const error = getElement(container, '.agent-finder-install-error');
	return {
		label: button.textContent,
		enabled: button.getAttribute('aria-disabled') === 'false',
		busy: button.getAttribute('aria-busy') === 'true',
		error: error.hidden ? '' : error.textContent,
	};
}

function setSearch(container: HTMLElement, value: string): HTMLInputElement {
	const input = getElement<HTMLInputElement>(container, '.agent-finder-search input');
	input.value = value;
	input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
	return input;
}

function pressKey(element: HTMLElement, key: string, keyCode: number, isComposing = false): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true, isComposing });
	element.dispatchEvent(event);
	return event;
}

suite('AgentFinderWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(hidden = false, parent: HTMLElement = document.body, widgetConstructor: typeof AgentFinderWidget = AgentFinderWidget) {
		const container = DOM.append(parent, DOM.$('.agent-finder-test'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '900px';
		container.style.height = '600px';

		const service = new TestAgentFinderService();
		const installService = store.add(new TestAgentFinderInstallService());
		const sentimentChanged = store.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden };
			override readonly onDidChangeSentiment = sentimentChanged.event;
		}();
		const configuration = new TestConfigurationService({ [AccessibilityVerbositySettingId.AgentFinder]: true });
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
		class AuxiliaryWindowWidget extends AgentFinderWidget {
			override layout(): void {
				super.layout();
				if (captureLayout) {
					const message = 'ResizeObserver loop completed with undelivered notifications.';
					const auxiliaryContext = DOM.getRecentDisposableResizeObserverContextForLoopError(message, auxiliaryWindow);
					const mainContext = DOM.getRecentDisposableResizeObserverContextForLoopError(message, mainWindow);
					if (auxiliaryContext?.includes('AgentFinderWidget') || mainContext?.includes('AgentFinderWidget')) {
						void observed.complete(!!auxiliaryContext?.includes('AgentFinderWidget'));
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

	test('loads only when visible and reuses completed results on reactivation', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(false);
		widget.layout();
		const beforeVisible = service.requests.length;
		widget.setVisible(true);
		widget.setVisible(true);
		const loading = getElement(container, '.agent-finder-results').getAttribute('aria-busy');
		await service.requests[0].result.complete({ items: [createResource('Review')], total: 1 });
		widget.setVisible(false);
		widget.setVisible(true);

		assert.deepStrictEqual({
			beforeVisible,
			queries: service.requests.map(request => request.options),
			loading,
			busy: getElement(container, '.agent-finder-results').getAttribute('aria-busy'),
			names: getCardNames(container),
			status: getElement(container, '.agent-finder-status').textContent,
		}, {
			beforeVisible: 0,
			queries: [{ query: '', mediaType: undefined, pageSize: 24, cursor: undefined }],
			loading: 'true',
			busy: 'false',
			names: ['Review'],
			status: 'Showing 1 of 1 resources',
		});
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
			busy: getElement(container, '.agent-finder-results').getAttribute('aria-busy'),
			names: getCardNames(container),
			error: getElement(container, '.agent-finder-error').textContent,
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
			status: getElement(container, '.agent-finder-status').textContent,
		}, { names: ['Current'], status: 'Showing 1 of 1 resources' });
	});

	test('applies all resource type filters immediately and resets pagination', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('Original')],
			nextCursor: { kind: 'browse', offset: 24 },
		});
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		const select = getElement<HTMLSelectElement>(container, '.agent-finder-type-filter select');
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
				AgentFinderMediaType.Skill, AgentFinderMediaType.McpServer,
				AgentFinderMediaType.CopilotPlugin, AgentFinderMediaType.ClaudePlugin,
				AgentFinderMediaType.CursorPlugin, undefined,
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
			nextCursor: { kind: 'browse', offset: 24 },
		});
		const loadMoreButton = getButton(container, 'Load More');
		loadMoreButton.focus();
		pressKey(loadMoreButton, 'Enter', 13);
		await service.requests[1].result.error(new Error('Network unavailable'));
		const retryButton = getButton(container, 'Retry');
		const afterFailure = {
			names: getCardNames(container),
			error: getElement(container, '.agent-finder-error').textContent,
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
			error: getElement(container, '.agent-finder-error').textContent,
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
			status: getElement(container, '.agent-finder-status').textContent,
			retryVisible: getButton(container, 'Retry').style.display !== 'none',
			loadMoreVisible: getButton(container, 'Load More').style.display !== 'none',
			focused: DOM.getActiveElement()?.querySelector('.agent-finder-name')?.textContent,
			signals,
		}, {
			afterFailure: {
				names: ['First'],
				error: 'Could not load AgentFinder. Network unavailable',
				retryVisible: true,
				loadMoreVisible: false,
				retryFocused: true,
			},
			pendingRetry: {
				requests: 3,
				names: ['First'],
				error: 'Could not load AgentFinder. Network unavailable',
				visible: true,
				disabled: 'true',
				focused: true,
			},
			cursors: [{ kind: 'browse', offset: 24 }, { kind: 'browse', offset: 24 }],
			names: ['First', 'Second', 'Third'],
			status: 'Showing 3 of 3 resources',
			retryVisible: false,
			loadMoreVisible: false,
			focused: 'Second',
			signals: [[AccessibilitySignal.taskFailed, { modality: 'sound' }]],
		});
	});

	test('refresh replaces the current search from the first page', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		await service.requests[1].result.complete({
			items: [createResource('Original')],
			nextCursor: { kind: 'search', pageToken: 'next-page' },
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
			pagination: { query: 'review', mediaType: undefined, pageSize: 24, cursor: { kind: 'search', pageToken: 'next-page' } },
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
		await service.requests[0].result.complete({ items: firstPage, nextCursor: { kind: 'search', pageToken: 'page-2' } });
		getButton(container, 'Load More').click();
		await service.requests[1].result.complete({ items: secondPage, nextCursor: { kind: 'search', pageToken: 'page-3' } });
		const scroll = getElement(container, '.agent-finder-scroll-content');
		scroll.scrollTop = 120;
		widget.layout();

		for (const field of ['completed', 'disabled', 'untrusted', 'installed', 'later', 'registered'] as const) {
			setSentiment({ [field]: true });
		}
		const unchanged = {
			requests: service.requests.length,
			query: getElement<HTMLInputElement>(container, '.agent-finder-search input').value,
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
			nextRequest: { query: 'review', mediaType: undefined, pageSize: 24, cursor: { kind: 'search', pageToken: 'page-3' } },
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
			emptyVisible: getElement(container, '.agent-finder-empty').style.display !== 'none',
			errorVisible: getElement(container, '.agent-finder-error').style.display !== 'none',
			content: widget.getAccessibilityContent(),
		}, {
			errorContent: 'AgentFinder\n\nCould not load AgentFinder. Try later',
			emptyVisible: true,
			errorVisible: false,
			content: 'AgentFinder\n\nShowing 0 of 0 resources\n\nNo resources found. Try a different search or resource type.',
		});
	});

	test('cancellation does not display an error or play an error signal', async () => {
		const { container, widget, service, signals } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.error(new CancellationError());

		assert.deepStrictEqual({
			error: getElement(container, '.agent-finder-error').textContent,
			retryVisible: getButton(container, 'Retry').style.display !== 'none',
			busy: getElement(container, '.agent-finder-results').getAttribute('aria-busy'),
			signals,
		}, { error: '', retryVisible: false, busy: 'false', signals: [] });
	});

	test('installation actions follow service state without interpreting catalog provenance', async () => {
		const { container, widget, service, installService, hovers } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({ items: [createResource('Review')] });
		const button = getElement(container, '.agent-finder-install-button');
		const presentations = [getInstallPresentation(container)];
		for (const kind of ['installing', 'installed'] as const) {
			installService.setState('Review', { kind });
			button.click();
			presentations.push(getInstallPresentation(container));
		}
		const reason = 'Installation is disabled by your organization.';
		installService.setState('Review', { kind: 'unavailable', message: reason });
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

	test('installation suppresses duplicate activation and preserves focus and catalog controls', async () => {
		const { container, widget, service, installService, opened } = createWidget();
		const resource = createResource('Review', { url: URI.parse('https://example.com/review') });
		widget.setVisible(true);
		pressKey(setSearch(container, 'review'), 'Enter', 13);
		await service.requests[1].result.complete({ items: [resource] });
		const button = getElement(container, '.agent-finder-install-button');
		button.focus();
		pressKey(button, 'Enter', 13);
		button.click();
		pressKey(button, ' ', 32);
		const pending = getInstallPresentation(container);
		installService.setState(resource.identifier, { kind: 'installed' });
		await installService.requests[0].result.complete();
		const installationKeptFocus = DOM.getActiveElement() === button;
		getElement<HTMLAnchorElement>(container, '.agent-finder-card a[href]').click();

		assert.deepStrictEqual({
			calls: installService.requests.map(request => request.resource),
			pending,
			completed: getInstallPresentation(container),
			installationKeptFocus,
			query: getElement<HTMLInputElement>(container, '.agent-finder-search input').value,
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
		const button = getElement(container, '.agent-finder-install-button');
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
		const button = getElement(container, '.agent-finder-install-button');
		button.focus();
		button.click();
		await installService.requests[0].result.error(new Error('Destination is not writable'));
		const failed = getInstallPresentation(container);
		const error = getElement(container, '.agent-finder-install-error');
		const errorAssociatedWithButton = button.getAttribute('aria-describedby') === error.id;
		const accessibleError = widget.getAccessibilityContent().split('\n').at(-1);
		button.click();
		const retrying = getInstallPresentation(container);
		installService.setState('Review', { kind: 'installed' });
		await installService.requests[1].result.complete();

		assert.deepStrictEqual({
			failed,
			errorAssociatedWithButton,
			accessibleError,
			retrying,
			completed: getInstallPresentation(container),
			query: getElement<HTMLInputElement>(container, '.agent-finder-search input').value,
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
		getElement(container, '.agent-finder-install-button').click();
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
			nextCursor: { kind: 'browse', offset: 24 },
		});
		getElement(container, '.agent-finder-install-button').click();
		getButton(container, 'Load More').click();
		widget.setVisible(false);
		const installationStillPending = !installService.requests[0].result.isSettled;
		installService.setState('Review', { kind: 'installed' });
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
		getElement(container, '.agent-finder-install-button').click();
		const card = getElement(container, '.agent-finder-card');
		widget.dispose();
		const disposedMarkup = card.innerHTML;
		installService.stateReads.length = 0;
		installService.setState('Review', { kind: 'installed' });
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
		getElement(container, '.agent-finder-install-button').click();
		const oldCard = getElement(container, '.agent-finder-card');
		pressKey(setSearch(container, 'browser'), 'Enter', 13);
		const oldMarkup = oldCard.innerHTML;
		await service.requests[1].result.complete({ items: [createResource('Browser')] });
		installService.stateReads.length = 0;
		installService.setState('Review', { kind: 'installed' });
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
			getElement(container, '.agent-finder-install-button').click();
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
		const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.agent-finder-card a[href]'));
		for (const link of links) {
			link.click();
		}

		assert.deepStrictEqual({
			name: getElement(container, '.agent-finder-name').textContent,
			description: getElement(container, '.agent-finder-card-description').textContent,
			publisher: getElement(container, '.agent-finder-publisher').textContent,
			executableElements: container.querySelectorAll('.agent-finder-card img, .agent-finder-card script, .agent-finder-card iframe').length,
			actions: links.map(link => ({ label: link.textContent, rel: link.rel })),
			inlineTags: Array.from(container.querySelectorAll('.agent-finder-tag'), tag => tag.textContent),
			details: Array.from(container.querySelectorAll('.agent-finder-details li'), item => item.textContent),
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
		getElement<HTMLAnchorElement>(container, '.agent-finder-card a[href]').click();
		await Promise.resolve();

		assert.deepStrictEqual({
			names: getCardNames(container),
			notifications,
		}, {
			names: ['Review'],
			notifications: ['Could not open the AgentFinder resource. Browser unavailable'],
		});
	});

	test('preserves escaped separators in external resource links and accessible destinations', async () => {
		const { container, widget, service, opened, hovers } = createWidget();
		const externalUrl = 'https://example.com/mcp/example%2Fbrowser-tools?reference=feature%2Fone';
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('Encoded server', {
				mediaType: AgentFinderMediaType.McpServer,
				url: URI.parse(externalUrl),
				externalUrl,
			})],
		});
		const link = getElement<HTMLAnchorElement>(container, '.agent-finder-card a[href]');
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
				createResource('Failed', { icon, mediaType: AgentFinderMediaType.McpServer }),
				createResource('No icon', { mediaType: AgentFinderMediaType.CopilotPlugin }),
			],
		});
		const cards = container.querySelectorAll<HTMLElement>('.agent-finder-card');
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
				iconHidden: getElement(cards[0], '.agent-finder-icon').getAttribute('aria-hidden'),
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
		const results = getElement(container, '.agent-finder-results');
		results.style.gridTemplateColumns = '1fr';
		const cards = Array.from(container.querySelectorAll<HTMLElement>('.agent-finder-card'));
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
			searchFocused: DOM.getActiveElement() === getElement(container, '.agent-finder-search input'),
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
			nextCursor: { kind: 'browse', offset: 24 },
		});
		const button = getButton(container, 'Load More');
		button.focus();
		pressKey(button, 'Enter', 13);
		await service.requests[1].result.complete({ items: [createResource('First'), createResource('Second')] });

		assert.deepStrictEqual({
			names: getCardNames(container),
			focused: DOM.getActiveElement()?.querySelector('.agent-finder-name')?.textContent,
		}, { names: ['First', 'Second'], focused: 'Second' });
	});

	test('a completed Load More request does not steal focus after leaving its button', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First')],
			nextCursor: { kind: 'browse', offset: 24 },
		});
		const button = getButton(container, 'Load More');
		button.focus();
		pressKey(button, 'Enter', 13);
		widget.focus();
		await service.requests[1].result.complete({ items: [createResource('Second')] });

		assert.deepStrictEqual({
			names: getCardNames(container),
			searchFocused: DOM.getActiveElement() === getElement(container, '.agent-finder-search input'),
		}, { names: ['First', 'Second'], searchFocused: true });
	});

	test('page errors and successful retries respect focus moved to other controls', async () => {
		const { container, widget, service } = createWidget();
		widget.setVisible(true);
		await service.requests[0].result.complete({
			items: [createResource('First')],
			nextCursor: { kind: 'browse', offset: 24 },
		});
		const button = getButton(container, 'Load More');
		button.focus();
		pressKey(button, 'Enter', 13);
		widget.focus();
		await service.requests[1].result.error(new Error('Try again'));
		const searchFocusedAfterFailure = DOM.getActiveElement() === getElement(container, '.agent-finder-search input');
		const retry = getButton(container, 'Retry');
		retry.focus();
		pressKey(retry, 'Enter', 13);
		const firstCard = getElement(container, '.agent-finder-card');
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
			mediaType: AgentFinderMediaType.McpServer,
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
			label: getElement(container, '.agent-finder-card').getAttribute('aria-label'),
			content: widget.getAccessibilityContent(),
		}, {
			label: 'Browser tools, MCP server. Description of Browser tools',
			content: [
				'AgentFinder',
				'Showing 1 of 1 resources',
				[
					'Browser tools', 'MCP server', 'Example Publisher', 'Description of Browser tools',
					'Version 2.4.0', '12 GitHub stars',
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
			'AgentFinder',
			'Showing 1 of 1 resources',
			['Review', 'Skill', 'Description of Review', 'Available to install'].join('\n'),
		].join('\n\n'));
	});

	test('accessibility hints follow the verbosity setting and keybinding changes', async () => {
		const { container, configuration, setHelpKeybinding } = createWidget();
		const input = getElement(container, '.agent-finder-search input');
		const labels = [input.getAttribute('aria-label')];
		setHelpKeybinding(new USLayoutResolvedKeybinding(
			[new KeyCodeChord(true, false, false, false, KeyCode.KeyH)], OperatingSystem.Linux));
		labels.push(input.getAttribute('aria-label'));
		await configuration.setUserConfiguration(AccessibilityVerbositySettingId.AgentFinder, false);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === AccessibilityVerbositySettingId.AgentFinder; }
		}());
		labels.push(input.getAttribute('aria-label'));
		await configuration.setUserConfiguration(AccessibilityVerbositySettingId.AgentFinder, true);
		setHelpKeybinding(undefined);
		labels.push(input.getAttribute('aria-label'));

		assert.deepStrictEqual(labels, [
			'Search AgentFinder. Use Alt+F1 for accessibility help.',
			'Search AgentFinder. Use Control+H for accessibility help.',
			'Search AgentFinder',
			'Search AgentFinder',
		]);
	});
});
