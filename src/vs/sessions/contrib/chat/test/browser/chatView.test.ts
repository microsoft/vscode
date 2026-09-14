/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { isChatInputStackSlotShowing } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { ResponseModelState } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsChatBackgroundRenderer, SessionsChatBackgroundReplica } from '../../../../services/chatBackground/browser/chatBackgroundRenderer.js';
import { ISessionsChatBackground } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { ChatView, findInitialTranscriptContextEntry, findTranscriptContextEntry, getSessionChatItemHorizontalPadding, getTranscriptProgress, isFocusChatPillsKeyDown, NewChatView, shouldShowSessionChatTip, shouldShowTranscriptPreparationCompletion, shouldShowTranscriptPreparationProgress } from '../../browser/chatView.js';
import { SessionsChatViewStateService } from '../../browser/chatViewStateService.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/media/chatAgentMergeContent.css';
import '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/media/chatRequestOrigin.css';
import { ISelectWorkspaceOptions } from '../../../../browser/parts/chatView.js';

suite('Sessions - Chat View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards workspace acknowledgement only from a new-session widget', () => {
		const calls: { folder: URI; options?: ISelectWorkspaceOptions }[] = [];
		const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
			selectWorkspace: (folder: URI, options?: ISelectWorkspaceOptions) => {
				calls.push({ folder, options });
				return 'applied';
			},
		});
		const results = [undefined, Object.create(NewChatInSessionWidget.prototype), widget].map(_widget => {
			const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), { _widget });
			return view.selectWorkspace(URI.file('/requested'), { isDefault: true });
		});
		assert.deepStrictEqual({ results, calls }, {
			results: ['notReady', 'notReady', 'applied'],
			calls: [{ folder: URI.file('/requested'), options: { isDefault: true } }],
		});
	});

	/** Reaches the banner without standing up the widget's whole service graph. */
	interface ISubSessionTipRenderer {
		_renderSubSessionTip(): void;
	}

	interface IStickyBackgroundChatView {
		_layoutStickyScrollBackground(): void;
		_updateChatBackground(): void;
	}

	function createBackgroundReplicaHost(background: ISessionsChatBackground) {
		const store = disposables.add(new DisposableStore());
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-foreground', '#ffffff');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		part.style.position = 'relative';
		part.style.width = '600px';
		part.style.height = '400px';
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const interactiveList = dom.append(session, dom.$('.interactive-list'));
		const list = dom.append(interactiveList, dom.$('.monaco-list'));
		const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
		const stickyContainer = dom.append(scrollable, dom.$('.monaco-tree-sticky-container'));
		stickyContainer.style.position = 'absolute';
		stickyContainer.style.left = '80px';
		stickyContainer.style.top = '40px';
		stickyContainer.style.width = '440px';
		stickyContainer.style.height = '64px';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		store.add(toDisposable(() => workbench.remove()));

		const sourceRenderer = store.add(new SessionsChatBackgroundRenderer(part));
		sourceRenderer.setBackground(background);
		const source = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		if (!source) {
			throw new Error('Sessions background renderer did not create its background layer');
		}

		return { store, part, chatView, stickyContainer, source, sourceRenderer };
	}

	function getBackgroundReplicaElements(stickyContainer: HTMLElement) {
		const viewport = stickyContainer.querySelector<HTMLElement>(':scope > .sessions-chat-background-replica-viewport');
		const replica = viewport?.querySelector<HTMLElement>(':scope > .sessions-chat-background-replica');
		return { viewport, replica };
	}

	test('retries an unresolved chat when its content provider is registered', () => {
		const resource = URI.parse('remote-agent:/session');
		const loads: URI[] = [];
		const modelRef = { value: undefined as object | undefined };
		const view = Object.assign(Object.create(ChatView.prototype), {
			_currentChatResource: resource,
			_currentSessionObs: { get: () => undefined },
			_modelRef: modelRef,
			_loadChat: (chatResource: URI) => loads.push(chatResource),
		}) as {
			_retryUnresolvedChatLoad(addedSessionTypes: readonly string[]): void;
		};

		view._retryUnresolvedChatLoad(['other-agent']);
		view._retryUnresolvedChatLoad(['remote-agent']);
		modelRef.value = {};
		view._retryUnresolvedChatLoad(['remote-agent']);

		assert.deepStrictEqual(loads, [resource]);
	});

	test('shows the external session banner only in the primary chat group', () => {
		const session = Object.create(null) as ISession;
		const bannerSessions: Array<ISession | undefined> = [];
		const view = Object.assign(Object.create(ChatView.prototype), {
			_isPrimaryObs: observableValue(disposables, true),
			_currentSessionObs: observableValue<ISession | undefined>(disposables, session),
			_externalSessionBanner: { setSession: (value: ISession | undefined) => bannerSessions.push(value) },
		}) as ChatView;

		view.setPrimary(false);
		view.setPrimary(true);

		assert.deepStrictEqual(bannerSessions, [undefined, session]);
	});

	test('updates chat visibility before making the archive nudge eligible for exposure', () => {
		const isVisible = observableValue(disposables, false);
		const forwarded: boolean[] = [];
		const view: ChatView = Object.assign(Object.create(ChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: { setVisible: () => forwarded.push(isVisible.get()) },
		});

		view.setVisible(true);
		view.setVisible(false);

		assert.deepStrictEqual({ forwarded, isVisible: isVisible.get() }, { forwarded: [false, true], isVisible: false });
	});

	test('forwards new chat visibility to the aquarium host', () => {
		const forwarded: boolean[] = [];
		const isVisible = observableValue(disposables, true);
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				setHostVisible: (visible: boolean) => forwarded.push(visible),
			}),
		});

		view.setVisible(false);
		view.setVisible(true);

		assert.deepStrictEqual({ forwarded, petHostVisible: isVisible.get() }, { forwarded: [false, true], petHostVisible: true });
	});

	test('hides the phone combined picker label when compact', () => {
		const toolbar = dom.append(document.body, dom.$('.sessions-chat-config-toolbar'));
		disposables.add(toDisposable(() => toolbar.remove()));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.compact-picker'));
		const label = dom.append(item, dom.$('.chat-input-picker-label'));

		assert.strictEqual(dom.getWindow(label).getComputedStyle(label).display, 'none');
	});

	test('keeps the model configuration label beside the compact model icon', () => {
		const toolbar = dom.append(document.body, dom.$('.sessions-chat-config-toolbar'));
		disposables.add(toDisposable(() => toolbar.remove()));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.chat-input-picker-item.compact-picker.model-picker-item'));
		const picker = dom.append(item, dom.$('.action-label.model-picker-split.compact'));
		const name = dom.append(picker, dom.$('.model-picker-section.model-picker-name'));
		name.style.minWidth = '22px';
		const icon = dom.append(name, dom.$('span.codicon'));
		icon.style.width = '12px';
		icon.style.height = '12px';
		const config = dom.append(picker, dom.$('.model-picker-section.model-picker-config'));
		const configLabel = dom.append(config, dom.$('span.chat-input-picker-label'));
		configLabel.textContent = 'High';

		const nameBounds = name.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			configVisible: dom.getWindow(configLabel).getComputedStyle(configLabel).display !== 'none',
			configWidth: config.getBoundingClientRect().width > 0,
			name: { width: nameBounds.width, height: nameBounds.height },
			iconOffset: {
				x: iconBounds.left - nameBounds.left,
				y: iconBounds.top - nameBounds.top,
			},
		}, {
			configVisible: true,
			configWidth: true,
			name: { width: 22, height: 22 },
			iconOffset: { x: 5, y: 5 },
		});
	});

	test('centers compact empty-state picker icons inside their action item', () => {
		const inputPart = dom.append(document.body, dom.$('.interactive-input-part'));
		disposables.add(toDisposable(() => inputPart.remove()));
		const toolbar = dom.append(inputPart, dom.$('.sessions-chat-config-toolbar'));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.compact-picker'));
		const slot = dom.append(item, dom.$('.sessions-chat-picker-slot'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, dom.$('span.codicon'));
		icon.style.width = '12px';
		icon.style.height = '12px';

		const itemBounds = item.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			iconOffset: {
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
			iconEscapes: iconBounds.left < itemBounds.left || iconBounds.right > itemBounds.right,
		}, {
			item: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			iconOffset: { x: 5, y: 5 },
			iconEscapes: false,
		});
	});

	test('centers compact bottom-row picker glyphs inside their action item', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const widget = dom.append(workbench, dom.$('.new-chat-widget-container.revealed'));
		const row = dom.append(widget, dom.$('.new-chat-bottom-container'));
		const actionBar = dom.append(row, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.compact-picker'));
		const slot = dom.append(item, dom.$('.sessions-chat-picker-slot.compact-picker'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, dom.$('span.codicon'));
		icon.style.width = '12px';
		icon.style.height = '12px';

		const itemBounds = item.getBoundingClientRect();
		const slotBounds = slot.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			slot: { width: slotBounds.width, height: slotBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			icon: { width: iconBounds.width, height: iconBounds.height },
			iconOffset: {
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
			iconEscapes: iconBounds.left < itemBounds.left || iconBounds.right > itemBounds.right,
		}, {
			item: { width: 22, height: 22 },
			slot: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			icon: { width: 12, height: 12 },
			iconOffset: { x: 5, y: 5 },
			iconEscapes: false,
		});
	});

	test('new-chat primary pickers match the input control height without clipping split model sections', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-spacing-size60', '6px');
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const states = [];
		for (const newChatInSession of [false, true]) {
			const host = dom.append(workbench, dom.$(newChatInSession ? '.new-chat-in-session' : 'div'));
			const widget = dom.append(host, dom.$('.new-chat-widget-container.revealed'));
			const toolbar = dom.append(widget, dom.$('.sessions-chat-toolbar'));
			const config = dom.append(toolbar, dom.$('.sessions-chat-config-toolbar'));
			const actionBar = dom.append(config, dom.$('.monaco-action-bar'));
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			const agentItem = dom.append(actions, dom.$('li.action-item.chat-input-picker-item'));
			const agent = dom.append(agentItem, dom.$('a.action-label'));
			const agentIcon = dom.append(agent, dom.$('span.codicon.codicon-agent-compact'));
			dom.append(agent, dom.$('span.chat-input-picker-label', undefined, 'Agent'));
			const modelItem = dom.append(actions, dom.$('li.action-item.chat-input-picker-item.model-picker-item'));
			const model = dom.append(modelItem, dom.$('div.action-label.model-picker-split'));
			const modelName = dom.append(model, dom.$('a.model-picker-section.model-picker-name'));
			const modelIcon = dom.append(modelName, dom.$('span.codicon.codicon-rocket-compact'));
			dom.append(modelName, dom.$('span.chat-input-picker-label', undefined, 'GPT-5.6 Sol Fast'));
			const modelConfig = dom.append(model, dom.$('a.model-picker-section.model-picker-config', undefined, 'Max'));
			const bounds = actions.getBoundingClientRect();
			states.push({
				newChatInSession,
				controlHeights: [agent, model, modelName, modelConfig].map(node => node.getBoundingClientRect().height),
				iconSizes: [agentIcon, modelIcon].map(icon => {
					const rect = icon.getBoundingClientRect();
					return { width: rect.width, height: rect.height, fontSize: dom.getWindow(icon).getComputedStyle(icon).fontSize };
				}),
				modelPadding: dom.getWindow(model).getComputedStyle(model).padding,
				sectionsFit: [modelName, modelConfig].every(section => {
					const rect = section.getBoundingClientRect();
					const parent = model.getBoundingClientRect();
					return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.top >= parent.top && rect.bottom <= parent.bottom;
				}),
			});
		}
		assert.deepStrictEqual(states, [false, true].map(newChatInSession => ({
			newChatInSession,
			controlHeights: [22, 22, 22, 22],
			iconSizes: [{ width: 12, height: 12, fontSize: '12px' }, { width: 12, height: 12, fontSize: '12px' }],
			modelPadding: '0px',
			sectionsFit: true,
		})));
	});

	test('uses the compact control box for bottom-row status icons', () => {
		const workbench = dom.append(document.body, dom.$('.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const widget = dom.append(workbench, dom.$('.new-chat-widget-container.revealed'));
		const row = dom.append(widget, dom.$('.new-chat-bottom-container'));
		const statusToolbar = dom.append(row, dom.$('.new-chat-status-toolbar'));
		const actionBar = dom.append(statusToolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.new-chat-status-icon-action'));
		const label = dom.append(item, dom.$('a.action-label.codicon.codicon-warning'));

		const itemBounds = item.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			iconFontSize: dom.getWindow(label).getComputedStyle(label).fontSize,
		}, {
			item: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			iconFontSize: '12px',
		});
	});

	test('keeps text-only bottom-row status actions intrinsic and centered', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		const widget = dom.append(workbench, dom.$('.new-chat-widget-container.revealed'));
		const row = dom.append(widget, dom.$('.new-chat-bottom-container'));
		const statusToolbar = dom.append(row, dom.$('.new-chat-status-toolbar'));
		const actionBar = dom.append(statusToolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item'));
		const label = dom.append(item, dom.$('a.action-label'));
		label.textContent = 'Status';

		assert.deepStrictEqual({
			itemIsSquareIconAction: item.classList.contains('new-chat-status-icon-action'),
			itemWiderThanCompactControl: item.getBoundingClientRect().width > 22,
			labelHeight: label.getBoundingClientRect().height,
			labelAlignItems: dom.getWindow(label).getComputedStyle(label).alignItems,
			labelIsNotClipped: label.scrollWidth <= label.clientWidth,
			text: label.textContent,
		}, {
			itemIsSquareIconAction: false,
			itemWiderThanCompactControl: true,
			labelHeight: 22,
			labelAlignItems: 'center',
			labelIsNotClipped: true,
			text: 'Status',
		});
	});

	test('centers text-only in-session secondary actions', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		const session = dom.append(workbench, dom.$('.interactive-session'));
		const toolbar = dom.append(session, dom.$('.chat-secondary-toolbar'));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item'));
		const label = dom.append(item, dom.$('a.action-label'));
		label.textContent = 'Plan';

		assert.deepStrictEqual({
			labelHeight: label.getBoundingClientRect().height,
			labelAlignItems: dom.getWindow(label).getComputedStyle(label).alignItems,
			labelIsNotClipped: label.scrollWidth <= label.clientWidth,
			text: label.textContent,
		}, {
			labelHeight: 22,
			labelAlignItems: 'center',
			labelIsNotClipped: true,
			text: 'Plan',
		});
	});

	test('centers compact in-session picker glyphs inside their action item', () => {
		const workbench = dom.append(document.body, dom.$('.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const session = dom.append(workbench, dom.$('.interactive-session'));
		const toolbar = dom.append(session, dom.$('.chat-secondary-input-toolbar'));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const actionsContainer = dom.append(actionBar, dom.$('.actions-container'));
		actionsContainer.style.display = 'flex';
		const item = dom.append(actionsContainer, dom.$('.action-item.compact-picker'));
		const slot = dom.append(item, dom.$('.sessions-chat-picker-slot'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, dom.$('span.codicon'));
		dom.append(label, dom.$('span.sessions-chat-dropdown-label', undefined, 'Autopilot'));

		const itemBounds = item.getBoundingClientRect();
		const slotBounds = slot.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			slot: { width: slotBounds.width, height: slotBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			icon: {
				width: iconBounds.width,
				height: iconBounds.height,
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
		}, {
			item: { width: 22, height: 22 },
			slot: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			icon: { width: 12, height: 12, x: 5, y: 5 },
		});
	});

	test('keeps the voice toolbar visible when picker actions run out of space', () => {
		const session = dom.append(document.body, dom.$('.interactive-session'));
		disposables.add(toDisposable(() => session.remove()));
		const toolbars = dom.append(session, dom.$('.chat-input-toolbars'));
		toolbars.style.width = '180px';
		const inputToolbar = dom.append(toolbars, dom.$('.monaco-toolbar.responsive.chat-input-toolbar'));
		inputToolbar.style.width = '240px';
		const executeToolbar = dom.append(toolbars, dom.$('.chat-execute-toolbar'));
		executeToolbar.style.width = '70px';

		assert.deepStrictEqual({
			inputWidth: inputToolbar.getBoundingClientRect().width,
			executeWidth: executeToolbar.getBoundingClientRect().width,
			executeEscapes: executeToolbar.getBoundingClientRect().right > toolbars.getBoundingClientRect().right,
		}, {
			inputWidth: 108,
			executeWidth: 70,
			executeEscapes: false,
		});
	});

	test('focuses the embedded composer frame only for editor focus', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-agentsChatInput-border', 'rgb(255, 0, 0)');
		workbench.style.setProperty('--vscode-agentsChatInput-focusBorder', 'rgb(0, 255, 0)');
		const widget = dom.append(workbench, dom.$('.new-chat-in-session'));
		const inputArea = dom.append(widget, dom.$('.new-chat-input-area'));
		const picker = dom.append(inputArea, dom.$<HTMLButtonElement>('button'));

		picker.focus();
		const pickerFocusedBorder = dom.getWindow(inputArea).getComputedStyle(inputArea).borderColor;
		inputArea.classList.add('focused');

		assert.deepStrictEqual({
			pickerFocusedBorder,
			editorFocusedBorder: dom.getWindow(inputArea).getComputedStyle(inputArea).borderColor,
		}, {
			pickerFocusedBorder: 'rgb(255, 0, 0)',
			editorFocusedBorder: 'rgb(0, 255, 0)',
		});
	});

	test('does not forward aquarium visibility to the peer chat composer', () => {
		const isVisible = observableValue(disposables, true);
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: Object.create(NewChatInSessionWidget.prototype),
		});

		assert.doesNotThrow(() => view.setVisible(false));
		assert.strictEqual(isVisible.get(), false);
	});

	test('configures the peer chat composer without repository controls', () => {
		let inputOptions: { readonly renderRepositoryControls?: boolean } | undefined;
		const input = Object.assign(Object.create(NewChatInputWidget.prototype), { dispose: () => { } }) as NewChatInputWidget;
		const instantiationService = new class extends mock<IInstantiationService>() {
			override createInstance = ((ctor: unknown, options: { readonly renderRepositoryControls?: boolean }) => {
				assert.strictEqual(ctor, NewChatInputWidget);
				inputOptions = options;
				return input;
			}) as IInstantiationService['createInstance'];
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
		}();
		disposables.add(new NewChatInSessionWidget(
			{},
			instantiationService,
			new class extends mock<ILogService>() { }(),
			new class extends mock<ISessionsManagementService>() { }(),
			sessionsService,
			new class extends mock<IStorageService>() { }(),
		));

		assert.strictEqual(inputOptions?.renderRepositoryControls, false);
	});

	test('positions peer chat content for centered attachment growth', () => {
		const widget = dom.append(document.body, dom.$('.new-chat-in-session'));
		disposables.add(toDisposable(() => widget.remove()));
		const content = dom.append(widget, dom.$('.new-chat-widget-content'));

		assert.strictEqual(dom.getWindow(content).getComputedStyle(content).position, 'relative');
	});

	test('applies and clears background CSS on the sessions part', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part));
		renderer.setBackground({
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto',
			backgroundPosition: 'right bottom',
		});
		const backgroundLayer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const applied = {
			enabled: part.classList.contains('has-chat-background'),
			imageEnabled: part.classList.contains('has-chat-background-image'),
			hidden: backgroundLayer?.hidden,
			image: backgroundLayer?.style.backgroundImage,
			repeat: backgroundLayer?.style.backgroundRepeat,
			size: backgroundLayer?.style.backgroundSize,
			position: backgroundLayer?.style.backgroundPosition,
			zIndex: backgroundLayer ? dom.getWindow(backgroundLayer).getComputedStyle(backgroundLayer).zIndex : undefined,
		};
		renderer.setBackground(undefined);

		assert.deepStrictEqual({
			applied,
			cleared: {
				enabled: part.classList.contains('has-chat-background'),
				imageEnabled: part.classList.contains('has-chat-background-image'),
				hidden: backgroundLayer?.hidden,
				image: backgroundLayer?.style.backgroundImage,
				repeat: backgroundLayer?.style.backgroundRepeat,
				size: backgroundLayer?.style.backgroundSize,
				position: backgroundLayer?.style.backgroundPosition,
			},
		}, {
			applied: {
				enabled: true,
				imageEnabled: true,
				hidden: false,
				image: 'url("file:///textures/kirby.png")',
				repeat: 'no-repeat',
				size: 'auto',
				position: 'right bottom',
				zIndex: '0',
			},
			cleared: { enabled: false, imageEnabled: false, hidden: true, image: '', repeat: '', size: '', position: '' },
		});
	});

	test('renders the codicons background preset from decorative in-memory icons', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--vscode-foreground', '#202020');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part));
		renderer.setBackground({ kind: 'codicons' });
		const backgroundLayer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const layer = backgroundLayer?.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-background');
		const firstIcon = layer?.querySelector<HTMLElement>('.codicon');

		assert.deepStrictEqual({
			enabled: part.classList.contains('has-chat-background'),
			imageEnabled: part.classList.contains('has-chat-background-image'),
			backgroundImage: backgroundLayer?.style.backgroundImage,
			backgroundLayerHidden: backgroundLayer?.hidden,
			layerHidden: layer?.hidden,
			layerAriaHidden: layer?.ariaHidden,
			layerColor: layer ? dom.getWindow(layer).getComputedStyle(layer).color : undefined,
			layerPointerEvents: layer ? dom.getWindow(layer).getComputedStyle(layer).pointerEvents : undefined,
			hasIcons: (layer?.querySelectorAll('.codicon').length ?? 0) > 0,
			firstIconAriaHidden: firstIcon?.ariaHidden,
		}, {
			enabled: true,
			imageEnabled: false,
			backgroundImage: '',
			backgroundLayerHidden: false,
			layerHidden: false,
			layerAriaHidden: 'true',
			layerColor: 'color(srgb 0.12549 0.12549 0.12549 / 0.1)',
			layerPointerEvents: 'none',
			hasIcons: true,
			firstIconAriaHidden: 'true',
		});
	});

	test('keeps existing codicons stable when the background grid resizes', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		part.style.width = '960px';
		part.style.height = '800px';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part));
		renderer.setBackground({ kind: 'codicons' });
		const layer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background > .sessions-chat-codicon-background');
		const firstIcon = layer?.querySelector<HTMLElement>('.codicon');
		const firstIconLeft = firstIcon?.style.left;
		const firstIconTop = firstIcon?.style.top;
		const initialIconCount = layer?.querySelectorAll('.codicon').length;

		part.style.width = '961px';
		renderer.setBackground({ kind: 'codicons' });
		const expandedFirstIcon = layer?.querySelector<HTMLElement>('.codicon');
		const expandedIconCount = layer?.querySelectorAll('.codicon').length;

		part.style.width = '960px';
		renderer.setBackground({ kind: 'codicons' });
		const shrunkFirstIcon = layer?.querySelector<HTMLElement>('.codicon');

		assert.deepStrictEqual({
			initialIconCount,
			expandedIconCount,
			shrunkIconCount: layer?.querySelectorAll('.codicon').length,
			reusedFirstIconWhenExpanded: expandedFirstIcon === firstIcon,
			reusedFirstIconWhenShrunk: shrunkFirstIcon === firstIcon,
			firstIconPositions: [
				{ left: firstIconLeft, top: firstIconTop },
				{ left: expandedFirstIcon?.style.left, top: expandedFirstIcon?.style.top },
				{ left: shrunkFirstIcon?.style.left, top: shrunkFirstIcon?.style.top },
			],
		}, {
			initialIconCount: 109,
			expandedIconCount: 117,
			shrunkIconCount: 109,
			reusedFirstIconWhenExpanded: true,
			reusedFirstIconWhenShrunk: true,
			firstIconPositions: [
				{ left: '125.6px', top: '46.4px' },
				{ left: '125.6px', top: '46.4px' },
				{ left: '125.6px', top: '46.4px' },
			],
		});
	});

	test('keeps the user request bubble opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const request = dom.append(session, dom.$('.interactive-item-container.interactive-request'));
		const value = dom.append(request, dom.$('.value'));
		const bubble = dom.append(value, dom.$('.rendered-markdown'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainRequest = dom.append(plainSession, dom.$('.interactive-item-container.interactive-request'));
		const plainValue = dom.append(plainRequest, dom.$('.value'));
		const plainBubble = dom.append(plainValue, dom.$('.rendered-markdown'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const style = dom.getWindow(bubble).getComputedStyle(bubble);
		const plainStyle = dom.getWindow(plainBubble).getComputedStyle(plainBubble);
		assert.deepStrictEqual({
			backgroundColor: style.backgroundColor,
			backgroundImage: style.backgroundImage,
			plainBackgroundColor: plainStyle.backgroundColor,
			plainBackgroundImage: plainStyle.backgroundImage,
		}, {
			backgroundColor: 'rgb(32, 32, 32)',
			backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			plainBackgroundColor: 'rgba(255, 255, 255, 0.3)',
			plainBackgroundImage: 'none',
		});
	});

	test('keeps the side-chat request origin opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const appendOrigin = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			return dom.append(chatView, dom.$('.chat-request-origin'));
		};
		const backgroundPart = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const origin = appendOrigin(backgroundPart);
		const delegationOrigin = appendOrigin(backgroundPart);
		delegationOrigin.classList.add('delegation');
		const plainOrigin = appendOrigin(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const style = dom.getWindow(origin).getComputedStyle(origin);
		const delegationStyle = dom.getWindow(delegationOrigin).getComputedStyle(delegationOrigin);
		const plainStyle = dom.getWindow(plainOrigin).getComputedStyle(plainOrigin);
		assert.deepStrictEqual({
			backgroundColor: style.backgroundColor,
			backgroundImage: style.backgroundImage,
			delegationBackgroundColor: delegationStyle.backgroundColor,
			delegationBackgroundImage: delegationStyle.backgroundImage,
			plainBackgroundColor: plainStyle.backgroundColor,
			plainBackgroundImage: plainStyle.backgroundImage,
		}, {
			backgroundColor: 'rgb(32, 32, 32)',
			backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			delegationBackgroundColor: 'rgba(0, 0, 0, 0)',
			delegationBackgroundImage: 'none',
			plainBackgroundColor: 'rgba(255, 255, 255, 0.3)',
			plainBackgroundImage: 'none',
		});
	});

	test('keeps request attachment pills opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const appendAttachment = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request'));
			const value = dom.append(request, dom.$('.value'));
			const attachments = dom.append(value, dom.$('.chat-attached-context'));
			return dom.append(attachments, dom.$('.chat-attached-context-attachment.agent-feedback-attachment'));
		};
		const attachment = appendAttachment(dom.append(workbench, dom.$('.part.sessionspart.has-chat-background')));
		const plainAttachment = appendAttachment(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const style = dom.getWindow(attachment).getComputedStyle(attachment);
		const plainStyle = dom.getWindow(plainAttachment).getComputedStyle(plainAttachment);
		assert.deepStrictEqual({
			backgroundColor: style.backgroundColor,
			backgroundImage: style.backgroundImage,
			plainBackgroundColor: plainStyle.backgroundColor,
			plainBackgroundImage: plainStyle.backgroundImage,
		}, {
			backgroundColor: 'rgb(32, 32, 32)',
			backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			plainBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainBackgroundImage: 'none',
		});
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`keeps the agent merge card opaque over the chat background (${theme})`, () => {
			const workbench = dom.$(`.monaco-workbench.agent-sessions-workbench.${theme}`);
			workbench.style.setProperty('--session-view-background', '#202020');
			workbench.style.setProperty('--vscode-chat-statusBackground', 'rgba(255, 255, 255, 0.3)');
			const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request'));
			const merge = dom.append(request, dom.$('.chat-agent-merge'));
			const card = dom.append(merge, dom.$('.chat-agent-merge-card'));
			dom.getWindow(workbench).document.body.appendChild(workbench);
			disposables.add(toDisposable(() => workbench.remove()));

			const background = () => {
				const style = dom.getWindow(card).getComputedStyle(card);
				return { color: style.backgroundColor, image: style.backgroundImage };
			};
			const expanded = background();
			merge.classList.add('collapsed');
			const collapsed = background();
			part.classList.remove('has-chat-background');
			const plain = background();

			const opaqueBackground = {
				color: 'rgb(32, 32, 32)',
				image: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			};
			assert.deepStrictEqual({ expanded, collapsed, plain }, {
				expanded: opaqueBackground,
				collapsed: opaqueBackground,
				plain: { color: 'rgba(255, 255, 255, 0.3)', image: 'none' },
			});
		});
	}

	test('keeps the request edit input opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const appendEditInput = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request.editing'));
			const editContainer = dom.append(request, dom.$('.chat-edit-input-container'));
			const inlineInputPart = dom.append(editContainer, dom.$('.interactive-input-part'));
			const composerInputPart = dom.append(session, dom.$('.interactive-input-part.editing'));
			return {
				inline: dom.append(inlineInputPart, dom.$('.chat-input-container')),
				composer: dom.append(composerInputPart, dom.$('.chat-input-container')),
			};
		};
		const background = appendEditInput(dom.append(workbench, dom.$('.part.sessionspart.has-chat-background')));
		const plain = appendEditInput(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const inlineStyle = dom.getWindow(background.inline).getComputedStyle(background.inline);
		const composerStyle = dom.getWindow(background.composer).getComputedStyle(background.composer);
		const plainInlineStyle = dom.getWindow(plain.inline).getComputedStyle(plain.inline);
		assert.deepStrictEqual({
			inlineBackgroundColor: inlineStyle.backgroundColor,
			inlineBackgroundImage: inlineStyle.backgroundImage,
			composerBackgroundColor: composerStyle.backgroundColor,
			composerBackgroundImage: composerStyle.backgroundImage,
			plainInlineBackgroundColor: plainInlineStyle.backgroundColor,
			plainInlineBackgroundImage: plainInlineStyle.backgroundImage,
		}, {
			inlineBackgroundColor: 'rgb(32, 32, 32)',
			inlineBackgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			composerBackgroundColor: 'rgb(32, 32, 32)',
			composerBackgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			plainInlineBackgroundColor: 'rgba(255, 255, 255, 0.3)',
			plainInlineBackgroundImage: 'none',
		});
	});

	test('keeps checkpoint and fork row containers transparent over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		const appendCheckpointRows = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const checkpoint = dom.append(session, dom.$('.checkpoint-container'));
			const restore = dom.append(session, dom.$('.checkpoint-restore-container'));
			const checkpointToolbar = dom.append(checkpoint, dom.$('.monaco-toolbar'));
			const restoreToolbar = dom.append(restore, dom.$('.monaco-toolbar'));
			return {
				checkpointToolbar,
				checkpointAction: dom.append(dom.append(checkpointToolbar, dom.$('.action-item')), dom.$('.action-label')),
				label: dom.append(restore, dom.$('span.checkpoint-label-text')),
				separator: dom.append(restore, dom.$('span.checkpoint-dot-separator')),
				restoreToolbar,
				restoreAction: dom.append(dom.append(restoreToolbar, dom.$('.action-item')), dom.$('.action-label')),
			};
		};
		const background = appendCheckpointRows(dom.append(workbench, dom.$('.part.sessionspart.has-chat-background')));
		const plain = appendCheckpointRows(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const fill = (element: HTMLElement) => dom.getWindow(element).getComputedStyle(element).backgroundColor;
		assert.deepStrictEqual({
			checkpointToolbar: fill(background.checkpointToolbar),
			label: fill(background.label),
			separator: fill(background.separator),
			restoreToolbar: fill(background.restoreToolbar),
			checkpointAction: fill(background.checkpointAction),
			restoreAction: fill(background.restoreAction),
			plainCheckpointToolbar: fill(plain.checkpointToolbar),
			plainLabel: fill(plain.label),
			plainSeparator: fill(plain.separator),
			plainRestoreToolbar: fill(plain.restoreToolbar),
			plainCheckpointAction: fill(plain.checkpointAction),
			plainRestoreAction: fill(plain.restoreAction),
		}, {
			checkpointToolbar: 'rgba(0, 0, 0, 0)',
			label: 'rgba(0, 0, 0, 0)',
			separator: 'rgba(0, 0, 0, 0)',
			restoreToolbar: 'rgba(0, 0, 0, 0)',
			checkpointAction: 'rgb(32, 32, 32)',
			restoreAction: 'rgb(32, 32, 32)',
			plainCheckpointToolbar: 'rgba(0, 0, 0, 0)',
			plainLabel: 'rgba(0, 0, 0, 0)',
			plainSeparator: 'rgba(0, 0, 0, 0)',
			plainRestoreToolbar: 'rgba(0, 0, 0, 0)',
			plainCheckpointAction: 'rgba(0, 0, 0, 0)',
			plainRestoreAction: 'rgba(0, 0, 0, 0)',
		});
	});

	test('uses a distinct padded assistant bubble over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#ffffff');
		workbench.style.setProperty('--vscode-editorWidget-background', '#f8f8f8');
		workbench.style.setProperty('--vscode-cornerRadius-medium', '6px');
		workbench.style.setProperty('--vscode-spacing-size80', '8px');
		workbench.style.setProperty('--vscode-spacing-size120', '12px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const response = dom.append(session, dom.$('.interactive-item-container.interactive-response'));
		response.style.width = '600px';
		const value = dom.append(response, dom.$('.value'));
		const footer = dom.append(response, dom.$('.chat-footer-toolbar'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainResponse = dom.append(plainSession, dom.$('.interactive-item-container.interactive-response'));
		const createHighContrastResponse = (themeClass: 'hc-black' | 'hc-light') => {
			const highContrastWorkbench = dom.$(`.monaco-workbench.agent-sessions-workbench.${themeClass}`);
			highContrastWorkbench.style.setProperty('--session-view-background', '#ffffff');
			highContrastWorkbench.style.setProperty('--vscode-editorWidget-background', '#f8f8f8');
			highContrastWorkbench.style.setProperty('--vscode-cornerRadius-medium', '6px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size80', '8px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size120', '12px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size320', '32px');
			highContrastWorkbench.style.setProperty('--vscode-strokeThickness', '1px');
			highContrastWorkbench.style.setProperty('--vscode-contrastBorder', '#ff0000');
			const highContrastPart = dom.append(highContrastWorkbench, dom.$('.part.sessionspart.has-chat-background'));
			const highContrastChatView = dom.append(highContrastPart, dom.$('.chat-view'));
			const highContrastResponse = dom.append(highContrastChatView, dom.$('.interactive-item-container.interactive-response'));
			dom.getWindow(highContrastWorkbench).document.body.appendChild(highContrastWorkbench);
			return { highContrastWorkbench, highContrastResponse };
		};
		const highContrastDark = createHighContrastResponse('hc-black');
		const highContrastLight = createHighContrastResponse('hc-light');
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => {
			workbench.remove();
			highContrastDark.highContrastWorkbench.remove();
			highContrastLight.highContrastWorkbench.remove();
		}));

		const responseStyle = dom.getWindow(response).getComputedStyle(response);
		const bubbleStyle = dom.getWindow(response).getComputedStyle(response, '::before');
		const highContrastDarkBubbleStyle = dom.getWindow(highContrastDark.highContrastResponse).getComputedStyle(highContrastDark.highContrastResponse, '::before');
		const highContrastLightBubbleStyle = dom.getWindow(highContrastLight.highContrastResponse).getComputedStyle(highContrastLight.highContrastResponse, '::before');
		assert.deepStrictEqual({
			responseBackgroundColor: responseStyle.backgroundColor,
			responseBackgroundImage: responseStyle.backgroundImage,
			responseBorderStyle: responseStyle.borderStyle,
			responseBoxShadow: responseStyle.boxShadow,
			responseOverflow: responseStyle.overflow,
			responsePadding: responseStyle.padding,
			bubbleBackgroundColor: bubbleStyle.backgroundColor,
			bubbleBackgroundImage: bubbleStyle.backgroundImage,
			bubbleBorderRadius: bubbleStyle.borderRadius,
			bubbleInset: bubbleStyle.inset,
			backgroundContentHorizontalPadding: getSessionChatItemHorizontalPadding(true),
			plainContentHorizontalPadding: getSessionChatItemHorizontalPadding(false),
			valueBackgroundColor: dom.getWindow(value).getComputedStyle(value).backgroundColor,
			footerBackgroundColor: dom.getWindow(footer).getComputedStyle(footer).backgroundColor,
			plainResponseBackgroundColor: dom.getWindow(plainResponse).getComputedStyle(plainResponse).backgroundColor,
			plainResponseBackgroundImage: dom.getWindow(plainResponse).getComputedStyle(plainResponse).backgroundImage,
			plainResponseBorderStyle: dom.getWindow(plainResponse).getComputedStyle(plainResponse).borderStyle,
			plainResponsePadding: dom.getWindow(plainResponse).getComputedStyle(plainResponse).padding,
			highContrastDarkBubbleBorder: highContrastDarkBubbleStyle.border,
			highContrastLightBubbleBorder: highContrastLightBubbleStyle.border,
		}, {
			responseBackgroundColor: 'rgba(0, 0, 0, 0)',
			responseBackgroundImage: 'none',
			responseBorderStyle: 'none',
			responseBoxShadow: 'none',
			responseOverflow: 'visible',
			responsePadding: '8px 44px',
			bubbleBackgroundColor: 'rgb(248, 248, 248)',
			bubbleBackgroundImage: 'none',
			bubbleBorderRadius: '6px',
			bubbleInset: '0px 32px',
			backgroundContentHorizontalPadding: 88,
			plainContentHorizontalPadding: 64,
			valueBackgroundColor: 'rgba(0, 0, 0, 0)',
			footerBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainResponseBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainResponseBackgroundImage: 'none',
			plainResponseBorderStyle: 'none',
			plainResponsePadding: '0px 32px',
			highContrastDarkBubbleBorder: '1px solid rgb(255, 0, 0)',
			highContrastLightBubbleBorder: '1px solid rgb(255, 0, 0)',
		});
	});

	test('keeps background-image composer controls on complete opaque surfaces', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#ffffff');
		workbench.style.setProperty('--vscode-button-secondaryBackground', 'rgba(0, 0, 0, 0.08)');
		workbench.style.setProperty('--vscode-button-secondaryHoverBackground', 'rgba(0, 0, 0, 0.16)');
		workbench.style.setProperty('--vscode-button-secondaryBorder', '#808080');
		workbench.style.setProperty('--vscode-button-secondaryForeground', '#202020');
		workbench.style.setProperty('--vscode-commandCenter-inactiveBorder', '#606060');
		workbench.style.setProperty('--vscode-cornerRadius-small', '4px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		chatView.style.setProperty('--vscode-chat-list-background', '#ffffff');
		const newChatWidget = dom.append(chatView, dom.$('.sessions-chat-widget'));
		const newChatContent = dom.append(newChatWidget, dom.$('.new-chat-widget-content'));
		const newChatContainer = dom.append(newChatWidget, dom.$('.new-chat-widget-container'));
		const bottomContainer = dom.append(newChatContainer, dom.$('.new-chat-bottom-container'));
		const bottomAction = dom.append(bottomContainer, dom.$('.action-label'));
		const combinedBottomAction = dom.append(bottomContainer, dom.$('.action-label.agent-host-mode-permissions-trigger'));
		combinedBottomAction.setAttribute('data-mode-permissions-picker-open', 'true');
		const workspacePickerSlot = dom.append(newChatContainer, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		const workspacePill = dom.append(workspacePickerSlot, dom.$('.action-label'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const secondaryToolbar = dom.append(session, dom.$('.chat-secondary-toolbar'));
		const secondaryAction = dom.append(secondaryToolbar, dom.$('.action-label'));
		const combinedSecondaryAction = dom.append(secondaryToolbar, dom.$('.action-label.agent-host-mode-permissions-trigger'));
		combinedSecondaryAction.setAttribute('data-mode-permissions-picker-open', 'true');
		const contextUsage = dom.append(secondaryToolbar, dom.$('.chat-context-usage-widget'));
		const newSessionView = dom.append(part, dom.$('.session-view'));
		const newSessionViewContent = dom.append(newSessionView, dom.$('.session-view-content'));
		const productionNewChatView = dom.append(newSessionViewContent, dom.$('.chat-view-new'));
		const productionNewChatWidget = dom.append(productionNewChatView, dom.$('.sessions-chat-widget'));
		const productionNewChatContainer = dom.append(productionNewChatWidget, dom.$('.new-chat-widget-container'));
		const productionBottomContainer = dom.append(productionNewChatContainer, dom.$('.new-chat-bottom-container'));
		const productionBottomAction = dom.append(productionBottomContainer, dom.$('.action-label'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainSecondaryToolbar = dom.append(plainSession, dom.$('.chat-secondary-toolbar'));
		const plainSecondaryAction = dom.append(plainSecondaryToolbar, dom.$('.action-label'));
		const plainContextUsage = dom.append(plainSecondaryToolbar, dom.$('.chat-context-usage-widget'));
		const plainNewChatWidget = dom.append(plainChatView, dom.$('.sessions-chat-widget'));
		const plainNewChatContainer = dom.append(plainNewChatWidget, dom.$('.new-chat-widget-container'));
		const plainBottomContainer = dom.append(plainNewChatContainer, dom.$('.new-chat-bottom-container'));
		const plainBottomAction = dom.append(plainBottomContainer, dom.$('.action-label'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const newChatStyle = dom.getWindow(newChatContent).getComputedStyle(newChatContent);
		const bottomActionStyle = dom.getWindow(bottomAction).getComputedStyle(bottomAction);
		const combinedBottomActionStyle = dom.getWindow(combinedBottomAction).getComputedStyle(combinedBottomAction);
		const workspacePillStyle = dom.getWindow(workspacePill).getComputedStyle(workspacePill);
		const secondaryActionStyle = dom.getWindow(secondaryAction).getComputedStyle(secondaryAction);
		const combinedSecondaryActionStyle = dom.getWindow(combinedSecondaryAction).getComputedStyle(combinedSecondaryAction);
		const contextUsageStyle = dom.getWindow(contextUsage).getComputedStyle(contextUsage);
		const productionBottomActionStyle = dom.getWindow(productionBottomAction).getComputedStyle(productionBottomAction);
		assert.deepStrictEqual({
			newChatBackgroundColor: newChatStyle.backgroundColor,
			newChatPadding: newChatStyle.padding,
			bottomActionBackgroundColor: bottomActionStyle.backgroundColor,
			bottomActionBorderColor: bottomActionStyle.borderColor,
			bottomActionBorderStyle: bottomActionStyle.borderStyle,
			bottomActionBorderRadius: bottomActionStyle.borderRadius,
			combinedBottomActionBackgroundImage: combinedBottomActionStyle.backgroundImage,
			workspacePillBackgroundColor: workspacePillStyle.backgroundColor,
			secondaryActionBackgroundColor: secondaryActionStyle.backgroundColor,
			secondaryActionBackgroundImage: secondaryActionStyle.backgroundImage,
			secondaryActionBorderColor: secondaryActionStyle.borderColor,
			secondaryActionBorderStyle: secondaryActionStyle.borderStyle,
			combinedSecondaryActionBackgroundImage: combinedSecondaryActionStyle.backgroundImage,
			contextUsageBackgroundColor: contextUsageStyle.backgroundColor,
			contextUsageBackgroundImage: contextUsageStyle.backgroundImage,
			contextUsageBorderRadius: contextUsageStyle.borderRadius,
			productionBottomActionBackgroundColor: productionBottomActionStyle.backgroundColor,
			productionBottomActionBackgroundImage: productionBottomActionStyle.backgroundImage,
			productionBottomActionBorderColor: productionBottomActionStyle.borderColor,
			productionBottomActionForeground: productionBottomActionStyle.color,
			plainSecondaryActionBackgroundColor: dom.getWindow(plainSecondaryAction).getComputedStyle(plainSecondaryAction).backgroundColor,
			plainSecondaryActionBorderStyle: dom.getWindow(plainSecondaryAction).getComputedStyle(plainSecondaryAction).borderStyle,
			plainContextUsageBackgroundColor: dom.getWindow(plainContextUsage).getComputedStyle(plainContextUsage).backgroundColor,
			plainContextUsageBorderStyle: dom.getWindow(plainContextUsage).getComputedStyle(plainContextUsage).borderStyle,
			plainBottomActionBackgroundColor: dom.getWindow(plainBottomAction).getComputedStyle(plainBottomAction).backgroundColor,
			plainBottomActionBorderStyle: dom.getWindow(plainBottomAction).getComputedStyle(plainBottomAction).borderStyle,
		}, {
			newChatBackgroundColor: 'rgba(0, 0, 0, 0)',
			newChatPadding: '0px',
			bottomActionBackgroundColor: 'rgb(255, 255, 255)',
			bottomActionBorderColor: 'rgb(128, 128, 128)',
			bottomActionBorderStyle: 'solid',
			bottomActionBorderRadius: '4px',
			combinedBottomActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16))',
			workspacePillBackgroundColor: 'rgb(255, 255, 255)',
			secondaryActionBackgroundColor: 'rgb(255, 255, 255)',
			secondaryActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			secondaryActionBorderColor: 'rgb(128, 128, 128)',
			secondaryActionBorderStyle: 'solid',
			combinedSecondaryActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16))',
			contextUsageBackgroundColor: 'rgb(255, 255, 255)',
			contextUsageBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			contextUsageBorderRadius: '4px',
			productionBottomActionBackgroundColor: 'rgb(255, 255, 255)',
			productionBottomActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			productionBottomActionBorderColor: 'rgb(128, 128, 128)',
			productionBottomActionForeground: 'rgb(32, 32, 32)',
			plainSecondaryActionBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainSecondaryActionBorderStyle: 'none',
			plainContextUsageBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainContextUsageBorderStyle: 'none',
			plainBottomActionBackgroundColor: 'rgb(255, 255, 255)',
			plainBottomActionBorderStyle: 'none',
		});
	});

	test('keeps selected chat rows transparent in dark themes', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const interactiveList = dom.append(chatView, dom.$('.interactive-list'));
		const list = dom.append(interactiveList, dom.$('.monaco-list'));
		const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
		const rows = dom.append(scrollable, dom.$('.monaco-list-rows'));
		const focusedRequest = dom.append(rows, dom.$('.monaco-list-row.request.focused'));
		const selectedResponse = dom.append(rows, dom.$('.monaco-list-row.response.selected'));
		const selectedPendingDivider = dom.append(rows, dom.$('.monaco-list-row.pending-divider.selected'));
		selectedPendingDivider.style.backgroundColor = 'rgb(255, 0, 0)';
		const highContrastWorkbench = dom.$('.monaco-workbench.hc-black.agent-sessions-workbench');
		const highContrastPart = dom.append(highContrastWorkbench, dom.$('.part.sessionspart'));
		const highContrastList = dom.append(highContrastPart, dom.$('.interactive-list'));
		const highContrastMonacoList = dom.append(highContrastList, dom.$('.monaco-list'));
		const highContrastScrollable = dom.append(highContrastMonacoList, dom.$('.monaco-scrollable-element'));
		const highContrastRows = dom.append(highContrastScrollable, dom.$('.monaco-list-rows'));
		const highContrastSelectedResponse = dom.append(highContrastRows, dom.$('.monaco-list-row.response.selected'));
		highContrastSelectedResponse.style.backgroundColor = 'rgb(255, 0, 0)';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		dom.getWindow(highContrastWorkbench).document.body.appendChild(highContrastWorkbench);
		disposables.add(toDisposable(() => {
			workbench.remove();
			highContrastWorkbench.remove();
		}));

		assert.deepStrictEqual({
			rows: dom.getWindow(rows).getComputedStyle(rows).backgroundColor,
			focusedRequest: dom.getWindow(focusedRequest).getComputedStyle(focusedRequest).backgroundColor,
			selectedResponse: dom.getWindow(selectedResponse).getComputedStyle(selectedResponse).backgroundColor,
			selectedPendingDivider: dom.getWindow(selectedPendingDivider).getComputedStyle(selectedPendingDivider).backgroundColor,
			highContrastSelectedResponse: dom.getWindow(highContrastSelectedResponse).getComputedStyle(highContrastSelectedResponse).backgroundColor,
		}, {
			rows: 'rgba(0, 0, 0, 0)',
			focusedRequest: 'rgba(0, 0, 0, 0)',
			selectedResponse: 'rgba(0, 0, 0, 0)',
			selectedPendingDivider: 'rgb(255, 0, 0)',
			highContrastSelectedResponse: 'rgb(255, 0, 0)',
		});
	});

	test('keeps the floating persistent content transparent only over chat backgrounds', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		const createPersistentContent = (hasBackground: boolean) => {
			const part = dom.append(workbench, dom.$(`.part.sessionspart${hasBackground ? '.has-chat-background' : ''}`));
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session.chat-floating-persistent-content'));
			const inputPart = dom.append(session, dom.$('.interactive-input-part'));
			return dom.append(inputPart, dom.$('.chat-input-persistent-content.chat-persistent-content-visible'));
		};
		const background = createPersistentContent(true);
		const plain = createPersistentContent(false);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		assert.deepStrictEqual({
			background: dom.getWindow(background).getComputedStyle(background, '::before').content,
			plain: dom.getWindow(plain).getComputedStyle(plain, '::before').content,
		}, {
			background: 'none',
			plain: '""',
		});
	});

	test('keeps sticky request chrome transparent over chat backgrounds', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		workbench.style.setProperty('--vscode-sideBar-background', '#ff0000');
		workbench.style.setProperty('--vscode-chat-list-background', '#ff0000');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const createStickyRequest = (parent: HTMLElement) => {
			const chatView = dom.append(parent, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const interactiveList = dom.append(session, dom.$('.interactive-list'));
			const list = dom.append(interactiveList, dom.$('.monaco-list'));
			const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
			const stickyContainer = dom.append(scrollable, dom.$('.monaco-tree-sticky-container'));
			const replicaViewport = dom.append(stickyContainer, dom.$('.sessions-chat-background-replica-viewport'));
			const stickyRow = dom.append(stickyContainer, dom.$('.monaco-tree-sticky-row.monaco-list-row.request.passive-focused'));
			const treeRow = dom.append(stickyRow, dom.$('.monaco-tl-row'));
			const treeContents = dom.append(treeRow, dom.$('.monaco-tl-contents'));
			const request = dom.append(treeContents, dom.$('.interactive-item-container.editing-session.interactive-request.show-verbose-details'));
			const value = dom.append(request, dom.$('.value'));
			const bubble = dom.append(value, dom.$('.rendered-markdown'));
			return { stickyContainer, replicaViewport, stickyRow, treeContents, request, bubble };
		};
		const background = createStickyRequest(part);
		const plain = createStickyRequest(plainPart);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		assert.deepStrictEqual({
			container: dom.getWindow(background.stickyContainer).getComputedStyle(background.stickyContainer).backgroundColor,
			overflow: dom.getWindow(background.stickyContainer).getComputedStyle(background.stickyContainer).overflow,
			replicaOverflow: dom.getWindow(background.replicaViewport).getComputedStyle(background.replicaViewport).overflow,
			row: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).backgroundColor,
			rowZIndex: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).zIndex,
			contents: dom.getWindow(background.treeContents).getComputedStyle(background.treeContents).backgroundColor,
			hoverBackground: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).getPropertyValue('--vscode-chat-list-background'),
			request: dom.getWindow(background.request).getComputedStyle(background.request).backgroundColor,
			bubble: dom.getWindow(background.bubble).getComputedStyle(background.bubble).backgroundColor,
			plainContainer: dom.getWindow(plain.stickyContainer).getComputedStyle(plain.stickyContainer).backgroundColor,
			plainOverflow: dom.getWindow(plain.stickyContainer).getComputedStyle(plain.stickyContainer).overflow,
			plainReplicaOverflow: dom.getWindow(plain.replicaViewport).getComputedStyle(plain.replicaViewport).overflow,
			plainRow: dom.getWindow(plain.stickyRow).getComputedStyle(plain.stickyRow).backgroundColor,
			plainHoverBackground: dom.getWindow(plain.stickyRow).getComputedStyle(plain.stickyRow).getPropertyValue('--vscode-chat-list-background'),
			plainRequest: dom.getWindow(plain.request).getComputedStyle(plain.request).backgroundColor,
		}, {
			container: 'rgba(0, 0, 0, 0)',
			overflow: 'visible',
			replicaOverflow: 'hidden',
			row: 'rgba(0, 0, 0, 0)',
			rowZIndex: '1',
			contents: 'rgba(0, 0, 0, 0)',
			hoverBackground: 'transparent',
			request: 'rgba(0, 0, 0, 0)',
			bubble: 'rgb(32, 32, 32)',
			plainContainer: 'rgb(255, 0, 0)',
			plainOverflow: 'visible',
			plainReplicaOverflow: 'hidden',
			plainRow: 'rgb(255, 0, 0)',
			plainHoverBackground: '#ff0000',
			plainRequest: 'rgba(0, 0, 0, 0)',
		});
	});

	test('hides transcript and sticky tree shadows only over chat backgrounds', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		const createShadows = (hasBackground: boolean) => {
			const part = dom.append(workbench, dom.$(`.part.sessionspart${hasBackground ? '.has-chat-background' : ''}`));
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const interactiveList = dom.append(session, dom.$('.interactive-list'));
			const list = dom.append(interactiveList, dom.$('.monaco-list'));
			const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
			const topShadow = dom.append(scrollable, dom.$('.shadow.top'));
			const topLeftShadow = dom.append(scrollable, dom.$('.shadow.top-left-corner.top'));
			const stickyContainer = dom.append(scrollable, dom.$('.monaco-tree-sticky-container'));
			const stickyShadow = dom.append(stickyContainer, dom.$('.monaco-tree-sticky-container-shadow'));
			return { topShadow, topLeftShadow, stickyShadow };
		};
		const background = createShadows(true);
		const plain = createShadows(false);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const display = (element: HTMLElement) => dom.getWindow(element).getComputedStyle(element).display;

		assert.deepStrictEqual({
			background: {
				top: display(background.topShadow),
				topLeft: display(background.topLeftShadow),
				sticky: display(background.stickyShadow),
			},
			plain: {
				top: display(plain.topShadow),
				topLeft: display(plain.topLeftShadow),
				sticky: display(plain.stickyShadow),
			},
		}, {
			background: {
				top: 'none',
				topLeft: 'none',
				sticky: 'none',
			},
			plain: {
				top: 'block',
				topLeft: 'block',
				sticky: 'block',
			},
		});
	});

	test('aligns an image replica to the full sessions background canvas', () => {
		const background: ISessionsChatBackground = {
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'repeat-x',
			backgroundSize: '125px 175px',
			backgroundPosition: '37px 19px',
		};
		const { store, stickyContainer, source } = createBackgroundReplicaHost(background);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(background);
		replica.layout();

		const { viewport, replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);
		const replicaLayer = replicaElement?.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		if (!viewport || !replicaElement || !replicaLayer) {
			throw new Error('Sticky background replica did not render');
		}
		const sourceBounds = source.getBoundingClientRect();
		const stickyBounds = stickyContainer.getBoundingClientRect();
		const viewportBounds = viewport.getBoundingClientRect();
		const replicaBounds = replicaElement.getBoundingClientRect();
		const viewportStyle = dom.getWindow(viewport).getComputedStyle(viewport);
		const replicaStyle = dom.getWindow(replicaElement).getComputedStyle(replicaElement);

		assert.deepStrictEqual({
			source: { left: sourceBounds.left, top: sourceBounds.top, width: sourceBounds.width, height: sourceBounds.height },
			sticky: { width: stickyBounds.width, height: stickyBounds.height, overflow: dom.getWindow(stickyContainer).getComputedStyle(stickyContainer).overflow },
			viewport: {
				left: viewportBounds.left,
				top: viewportBounds.top,
				width: viewportBounds.width,
				height: viewportBounds.height,
				overflow: viewportStyle.overflow,
				pointerEvents: viewportStyle.pointerEvents,
				ariaHidden: viewport.ariaHidden,
			},
			replica: {
				left: replicaBounds.left,
				top: replicaBounds.top,
				width: replicaBounds.width,
				height: replicaBounds.height,
				styleLeft: replicaElement.style.left,
				styleTop: replicaElement.style.top,
			},
			sourceImage: {
				image: source.style.backgroundImage,
				repeat: source.style.backgroundRepeat,
				size: source.style.backgroundSize,
				position: source.style.backgroundPosition,
			},
			replicaImage: {
				image: replicaLayer.style.backgroundImage,
				repeat: replicaLayer.style.backgroundRepeat,
				size: replicaLayer.style.backgroundSize,
				position: replicaLayer.style.backgroundPosition,
			},
			base: replicaStyle.backgroundColor,
			pointerEvents: replicaStyle.pointerEvents,
			ariaHidden: replicaElement.ariaHidden,
		}, {
			source: { left: sourceBounds.left, top: sourceBounds.top, width: 600, height: 400 },
			sticky: { width: 440, height: 64, overflow: 'visible' },
			viewport: {
				left: stickyBounds.left,
				top: stickyBounds.top,
				width: 440,
				height: 64,
				overflow: 'hidden',
				pointerEvents: 'none',
				ariaHidden: 'true',
			},
			replica: {
				left: sourceBounds.left,
				top: sourceBounds.top,
				width: 600,
				height: 400,
				styleLeft: '-80px',
				styleTop: '-40px',
			},
			sourceImage: {
				image: 'url("file:///textures/kirby.png")',
				repeat: 'repeat-x',
				size: '125px 175px',
				position: '37px 19px',
			},
			replicaImage: {
				image: 'url("file:///textures/kirby.png")',
				repeat: 'repeat-x',
				size: '125px 175px',
				position: '37px 19px',
			},
			base: 'rgb(32, 32, 32)',
			pointerEvents: 'none',
			ariaHidden: 'true',
		});
	});

	test('keeps source and replica Codicons synchronized across resize', () => {
		const background = { kind: 'codicons' } as const;
		const { store, part, stickyContainer, source, sourceRenderer } = createBackgroundReplicaHost(background);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(background);
		const iconLayout = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>('.codicon'))
			.map(icon => ({
				className: icon.className,
				left: icon.style.left,
				top: icon.style.top,
				transform: icon.style.transform,
			}))
			.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
		const initialSourceLayout = iconLayout(source);
		const initialReplicaLayout = iconLayout(stickyContainer);

		part.style.width = '720px';
		part.style.height = '480px';
		sourceRenderer.setBackground(background);
		replica.layout();
		replica.setBackground(background);
		const resizedSourceLayout = iconLayout(source);
		const resizedReplicaLayout = iconLayout(stickyContainer);
		const { replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);

		assert.deepStrictEqual({
			initial: {
				hasIcons: initialSourceLayout.length > 0,
				sourceCount: initialSourceLayout.length,
				replicaCount: initialReplicaLayout.length,
				replicaLayout: initialReplicaLayout,
			},
			resized: {
				hasMoreIcons: resizedSourceLayout.length > initialSourceLayout.length,
				sourceCount: resizedSourceLayout.length,
				replicaCount: resizedReplicaLayout.length,
				replicaLayout: resizedReplicaLayout,
				replicaWidth: replicaElement?.getBoundingClientRect().width,
				replicaHeight: replicaElement?.getBoundingClientRect().height,
			},
		}, {
			initial: {
				hasIcons: true,
				sourceCount: initialSourceLayout.length,
				replicaCount: initialSourceLayout.length,
				replicaLayout: initialSourceLayout,
			},
			resized: {
				hasMoreIcons: true,
				sourceCount: resizedSourceLayout.length,
				replicaCount: resizedSourceLayout.length,
				replicaLayout: resizedSourceLayout,
				replicaWidth: 720,
				replicaHeight: 480,
			},
		});
	});

	test('updates and clears replica rendering from explicit background state', () => {
		const image: ISessionsChatBackground = {
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto',
			backgroundPosition: 'right bottom',
		};
		const codicons = { kind: 'codicons' } as const;
		const { store, stickyContainer, source, sourceRenderer } = createBackgroundReplicaHost(image);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(image);
		const { viewport, replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);
		const replicaLayer = replicaElement?.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const codiconLayer = replicaLayer?.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-background');
		if (!viewport || !replicaElement || !replicaLayer || !codiconLayer) {
			throw new Error('Sticky background replica did not render its layers');
		}
		const imageState = {
			viewportHidden: viewport.hidden,
			hasBackground: replicaElement.classList.contains('has-chat-background'),
			hasImage: replicaElement.classList.contains('has-chat-background-image'),
			image: replicaLayer.style.backgroundImage,
			layerHidden: replicaLayer.hidden,
		};

		sourceRenderer.setBackground(codicons);
		replica.setBackground(codicons);
		const codiconState = {
			viewportHidden: viewport.hidden,
			hasBackground: replicaElement.classList.contains('has-chat-background'),
			hasImage: replicaElement.classList.contains('has-chat-background-image'),
			image: replicaLayer.style.backgroundImage,
			layerHidden: replicaLayer.hidden,
			codiconLayerHidden: codiconLayer.hidden,
			iconCountMatches: source.querySelectorAll('.codicon').length === replicaElement.querySelectorAll('.codicon').length,
		};

		sourceRenderer.setBackground(undefined);
		replica.setBackground(undefined);
		const clearedStyle = dom.getWindow(replicaElement).getComputedStyle(replicaElement);

		assert.deepStrictEqual({
			image: imageState,
			codicons: codiconState,
			cleared: {
				viewportHidden: viewport.hidden,
				viewportDisplay: dom.getWindow(viewport).getComputedStyle(viewport).display,
				hasBackground: replicaElement.classList.contains('has-chat-background'),
				hasImage: replicaElement.classList.contains('has-chat-background-image'),
				display: clearedStyle.display,
				layerHidden: replicaLayer.hidden,
				codiconLayerHidden: codiconLayer.hidden,
				iconCount: replicaElement.querySelectorAll('.codicon').length,
			},
		}, {
			image: {
				viewportHidden: false,
				hasBackground: true,
				hasImage: true,
				image: 'url("file:///textures/kirby.png")',
				layerHidden: false,
			},
			codicons: {
				viewportHidden: false,
				hasBackground: true,
				hasImage: false,
				image: '',
				layerHidden: false,
				codiconLayerHidden: false,
				iconCountMatches: true,
			},
			cleared: {
				viewportHidden: true,
				viewportDisplay: 'none',
				hasBackground: false,
				hasImage: false,
				display: 'block',
				layerHidden: true,
				codiconLayerHidden: true,
				iconCount: 0,
			},
		});
	});

	test('reuses, replaces, and disposes the ChatView sticky background replica', () => {
		const image: ISessionsChatBackground = {
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto',
			backgroundPosition: 'center center',
		};
		const codicons = { kind: 'codicons' } as const;
		const { store, chatView, stickyContainer, sourceRenderer } = createBackgroundReplicaHost(image);
		const replicaSlot = store.add(new MutableDisposable<SessionsChatBackgroundReplica>());
		let background: ISessionsChatBackground | undefined = image;
		let stickyScrollDomNode: HTMLElement | undefined = stickyContainer;
		let paddingUpdates = 0;
		const view = Object.assign(Object.create(ChatView.prototype), {
			element: chatView,
			_widget: {
				get stickyScrollDomNode() { return stickyScrollDomNode; },
				setContentHorizontalPadding: () => paddingUpdates++,
			},
			_stickyScrollBackgroundReplica: replicaSlot,
			chatBackgroundService: { getBackground: () => background },
			_chatItemHorizontalPadding: getSessionChatItemHorizontalPadding(true),
		}) as IStickyBackgroundChatView;

		view._layoutStickyScrollBackground();
		const firstReplicaElement = getBackgroundReplicaElements(stickyContainer).replica;
		view._layoutStickyScrollBackground();
		const secondReplicaElement = getBackgroundReplicaElements(stickyContainer).replica;

		background = codicons;
		sourceRenderer.setBackground(background);
		view._updateChatBackground();
		view._updateChatBackground();
		const updatedReplicaElement = getBackgroundReplicaElements(stickyContainer).replica;

		stickyScrollDomNode = undefined;
		view._layoutStickyScrollBackground();
		const oldReplicaCountAfterDisable = stickyContainer.querySelectorAll(':scope > .sessions-chat-background-replica-viewport').length;

		const replacementStickyContainer = dom.append(stickyContainer.parentElement!, dom.$('.monaco-tree-sticky-container'));
		replacementStickyContainer.style.position = 'absolute';
		replacementStickyContainer.style.left = '80px';
		replacementStickyContainer.style.top = '40px';
		replacementStickyContainer.style.width = '440px';
		replacementStickyContainer.style.height = '64px';
		stickyScrollDomNode = replacementStickyContainer;
		view._layoutStickyScrollBackground();
		const replacementReplicaElement = getBackgroundReplicaElements(replacementStickyContainer).replica;

		background = undefined;
		sourceRenderer.setBackground(background);
		view._updateChatBackground();
		const replacementViewport = getBackgroundReplicaElements(replacementStickyContainer).viewport;
		const hiddenBeforeDispose = replacementViewport ? dom.getWindow(replacementViewport).getComputedStyle(replacementViewport).display : undefined;
		const replicaCountBeforeDispose = replacementStickyContainer.querySelectorAll(':scope > .sessions-chat-background-replica-viewport').length;
		replicaSlot.dispose();

		assert.deepStrictEqual({
			created: !!firstReplicaElement,
			reusedOnLayout: secondReplicaElement === firstReplicaElement,
			reusedOnBackgroundUpdate: updatedReplicaElement === firstReplicaElement,
			oldReplicaCountAfterDisable,
			replacementCreated: !!replacementReplicaElement,
			recreatedForReplacement: !!replacementReplicaElement && replacementReplicaElement !== firstReplicaElement,
			replicaCountBeforeDispose,
			hiddenBeforeDispose,
			paddingUpdates,
			replicaCountAfterDispose: replacementStickyContainer.querySelectorAll(':scope > .sessions-chat-background-replica-viewport').length,
		}, {
			created: true,
			reusedOnLayout: true,
			reusedOnBackgroundUpdate: true,
			oldReplicaCountAfterDisable: 0,
			replacementCreated: true,
			recreatedForReplacement: true,
			replicaCountBeforeDispose: 1,
			hiddenBeforeDispose: 'none',
			paddingUpdates: 1,
			replicaCountAfterDispose: 0,
		});
	});

	test('stores view state independently by chat resource', () => {
		const service = new SessionsChatViewStateService();
		const first = URI.parse('test:///first');
		const second = URI.parse('test:///second');

		service.set(first, { scrollTop: 120, isAtBottom: false });
		service.set(second, { scrollTop: 700, isAtBottom: true });
		assert.deepStrictEqual({
			first: service.get(first),
			second: service.get(second),
		}, {
			first: { scrollTop: 120, isAtBottom: false },
			second: { scrollTop: 700, isAtBottom: true },
		});
	});

	test('bounds stored view state', () => {
		const service = new SessionsChatViewStateService();
		for (let index = 0; index <= CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT; index++) {
			service.set(URI.parse(`test:///${index}`), { scrollTop: index });
		}

		assert.deepStrictEqual({
			evicted: service.get(URI.parse('test:///0')),
			retained: service.get(URI.parse(`test:///${CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT}`)),
		}, {
			evicted: undefined,
			retained: { scrollTop: CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT },
		});
	});


	test('allows transcript progress until a hidden bootstrap completes or visible content appears', () => {
		assert.deepStrictEqual({
			empty: shouldShowTranscriptPreparationProgress(0, 0, undefined),
			hiddenPending: shouldShowTranscriptPreparationProgress(1, 0, true),
			hiddenComplete: shouldShowTranscriptPreparationProgress(1, 0, false),
			visiblePending: shouldShowTranscriptPreparationProgress(2, 1, true),
		}, {
			empty: true,
			hiddenPending: true,
			hiddenComplete: false,
			visiblePending: false,
		});
	});

	test('shows transcript preparation completion until visible content appears', () => {
		assert.deepStrictEqual({
			hiddenComplete: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Complete, 'Session ready'),
			hiddenPending: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Pending, 'Session ready'),
			hiddenFailed: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Failed, 'Session ready'),
			hiddenCancelled: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Cancelled, 'Session ready'),
			visibleRequest: shouldShowTranscriptPreparationCompletion(2, 1, ResponseModelState.Complete, 'Session ready'),
			noReadyMessage: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Complete, undefined),
		}, {
			hiddenComplete: true,
			hiddenPending: false,
			hiddenFailed: false,
			hiddenCancelled: false,
			visibleRequest: false,
			noReadyMessage: false,
		});
	});

	test('shows the session-list status message in the pre-request progress surface', () => {
		assert.deepStrictEqual({
			fallback: getTranscriptProgress(true, 'Working...'),
			activity: getTranscriptProgress(true, 'Creating isolated worktree (42%)'),
			noActivity: getTranscriptProgress(true, undefined),
			visibleRequest: getTranscriptProgress(false, 'Creating isolated worktree (42%)'),
		}, {
			fallback: 'Working...',
			activity: 'Creating isolated worktree (42%)',
			noActivity: undefined,
			visibleRequest: undefined,
		});
	});

	test('does not show chat tips while the initial request is active', () => {
		assert.deepStrictEqual({
			unbound: shouldShowSessionChatTip(undefined),
			untitled: shouldShowSessionChatTip(SessionStatus.Untitled),
			inProgress: shouldShowSessionChatTip(SessionStatus.InProgress),
			needsInput: shouldShowSessionChatTip(SessionStatus.NeedsInput),
			completed: shouldShowSessionChatTip(SessionStatus.Completed),
		}, {
			unbound: true,
			untitled: true,
			inProgress: false,
			needsInput: false,
			completed: true,
		});
	});

	test('recognizes an unmodified Shift+Tab as the chat-pills focus shortcut', () => {
		const base = { keyCode: KeyCode.Tab, shiftKey: true, ctrlKey: false, metaKey: false, altKey: false };
		assert.deepStrictEqual({
			shiftTab: isFocusChatPillsKeyDown(base),
			plainTab: isFocusChatPillsKeyDown({ ...base, shiftKey: false }),
			ctrlShiftTab: isFocusChatPillsKeyDown({ ...base, ctrlKey: true }),
			metaShiftTab: isFocusChatPillsKeyDown({ ...base, metaKey: true }),
			altShiftTab: isFocusChatPillsKeyDown({ ...base, altKey: true }),
			otherKey: isFocusChatPillsKeyDown({ ...base, keyCode: KeyCode.Escape }),
		}, {
			shiftTab: true,
			plainTab: false,
			ctrlShiftTab: false,
			metaShiftTab: false,
			altShiftTab: false,
			otherKey: false,
		});
	});

	test('only cancels the chat input keydown when the pills accept focus', () => {
		const handleKeyDown = (event: { keyCode: KeyCode; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault(): void; stopPropagation(): void }, focusFirst: () => boolean) => {
			if (isFocusChatPillsKeyDown(event) && focusFirst()) {
				event.preventDefault();
				event.stopPropagation();
			}
		};
		const fire = (shiftKey: boolean, focusFirstResult: boolean) => {
			const calls: string[] = [];
			handleKeyDown(
				{ keyCode: KeyCode.Tab, shiftKey, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') },
				() => focusFirstResult,
			);
			return calls;
		};

		assert.deepStrictEqual({
			matchingAndFocused: fire(true, true),
			matchingButNoPills: fire(true, false),
			nonMatching: fire(false, true),
		}, {
			matchingAndFocused: ['preventDefault', 'stopPropagation'],
			matchingButNoPills: [],
			nonMatching: [],
		});
	});

	test('finds transcript context in hidden request attachments', () => {
		const attachment: IChatRequestTranscriptContextVariableEntry = {
			kind: 'transcriptContext',
			id: 'pr',
			name: 'PR',
			value: '{}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};

		assert.strictEqual(findTranscriptContextEntry([{
			variableData: { variables: [] },
			attachedContext: [attachment],
		}]), attachment);

		const bootstrap = {
			isRequestHiddenFromTranscript: true,
			variableData: { variables: [] },
			attachedContext: [attachment],
		};
		const requestOnlyHiddenNotice = {
			isRequestHiddenFromTranscript: true,
			variableData: { variables: [] },
		};
		const visibleRequest = {
			isRequestHiddenFromTranscript: false,
			variableData: { variables: [] },
		};
		assert.deepStrictEqual({
			afterNotice: findInitialTranscriptContextEntry([bootstrap, requestOnlyHiddenNotice]),
			afterVisibleRequest: findInitialTranscriptContextEntry([bootstrap, visibleRequest]),
		}, {
			afterNotice: attachment,
			afterVisibleRequest: undefined,
		});
	});

	test('the sub-session tip yields the space to a notification and comes back', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const container = dom.$('div');
		store.add(toDisposable(() => container.remove()));

		// Built through the prototype: the banner only needs its storage key, the
		// input's notice host and host slot, and somewhere to keep its listeners.
		const widget = Object.create(NewChatInSessionWidget.prototype) as ISubSessionTipRenderer;
		Object.assign(widget, {
			storageService: { getBoolean: () => false, store: () => { } },
			_newChatInput: { noticeHost, focus: () => { }, hostNoticeContainerElement: container },
			_tipDisposable: store.add(new MutableDisposable()),
		});
		widget._renderSubSessionTip();

		// The composer owns the slot, so the tip reports on the container itself.
		const showing = () => isChatInputStackSlotShowing(container);
		const shownInitially = showing();
		// A notification owns the space outright, so the banner must not stack with it.
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => { } });
		const shownUnderNotification = showing();
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, false);

		assert.deepStrictEqual(
			{ shownInitially, shownUnderNotification, shownAfter: showing() },
			{ shownInitially: true, shownUnderNotification: false, shownAfter: true });
	});

});
