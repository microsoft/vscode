/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { isChatInputStackSlotShowing } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { ResponseModelState } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionsChatBackgroundRenderer } from '../../../../services/chatBackground/browser/chatBackgroundRenderer.js';
import { ChatView, findInitialTranscriptContextEntry, findTranscriptContextEntry, getTranscriptProgress, NewChatView, shouldShowSessionChatTip, shouldShowTranscriptPreparationCompletion, shouldShowTranscriptPreparationProgress } from '../../browser/chatView.js';
import { SessionsChatViewStateService } from '../../browser/chatViewStateService.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';

suite('Sessions - Chat View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** Reaches the banner without standing up the widget's whole service graph. */
	interface ISubSessionTipRenderer {
		_renderSubSessionTip(): void;
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
		const workbench = dom.append(document.body, dom.$('.agent-sessions-workbench'));
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

	test('leaves text-only bottom-row status actions at their intrinsic width', () => {
		const workbench = dom.append(document.body, dom.$('.agent-sessions-workbench'));
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
			labelIsNotClipped: label.scrollWidth <= label.clientWidth,
			text: label.textContent,
		}, {
			itemIsSquareIconAction: false,
			itemWiderThanCompactControl: true,
			labelIsNotClipped: true,
			text: 'Status',
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

	test('applies a borderless translucent side fade to the complete assistant response', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#ffffff');
		workbench.style.setProperty('--vscode-cornerRadius-medium', '6px');
		workbench.style.setProperty('--vscode-spacing-size160', '16px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const response = dom.append(session, dom.$('.interactive-item-container.interactive-response'));
		const value = dom.append(response, dom.$('.value'));
		const footer = dom.append(response, dom.$('.chat-footer-toolbar'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainResponse = dom.append(plainSession, dom.$('.interactive-item-container.interactive-response'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const responseStyle = dom.getWindow(response).getComputedStyle(response);
		assert.deepStrictEqual({
			responseBackgroundColor: responseStyle.backgroundColor,
			responseBackgroundImage: responseStyle.backgroundImage,
			responseBackdropFilter: responseStyle.getPropertyValue('backdrop-filter'),
			responseWebkitBackdropFilter: responseStyle.getPropertyValue('-webkit-backdrop-filter') || 'none',
			responseBorderStyle: responseStyle.borderStyle,
			responseBorderRadius: responseStyle.borderRadius,
			responseBoxShadow: responseStyle.boxShadow,
			responseOverflow: responseStyle.overflow,
			responsePaddingBottom: responseStyle.paddingBottom,
			valueBackgroundColor: dom.getWindow(value).getComputedStyle(value).backgroundColor,
			footerBackgroundColor: dom.getWindow(footer).getComputedStyle(footer).backgroundColor,
			plainResponseBackgroundColor: dom.getWindow(plainResponse).getComputedStyle(plainResponse).backgroundColor,
			plainResponseBorderStyle: dom.getWindow(plainResponse).getComputedStyle(plainResponse).borderStyle,
			plainResponsePaddingBottom: dom.getWindow(plainResponse).getComputedStyle(plainResponse).paddingBottom,
		}, {
			responseBackgroundColor: 'rgba(0, 0, 0, 0)',
			responseBackgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0), color(srgb 1 1 1 / 0.88) 32px, color(srgb 1 1 1 / 0.88) calc(100% - 32px), rgba(0, 0, 0, 0))',
			responseBackdropFilter: 'none',
			responseWebkitBackdropFilter: 'none',
			responseBorderStyle: 'none',
			responseBorderRadius: '6px',
			responseBoxShadow: 'none',
			responseOverflow: 'hidden',
			responsePaddingBottom: '16px',
			valueBackgroundColor: 'rgba(0, 0, 0, 0)',
			footerBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainResponseBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainResponseBorderStyle: 'none',
			plainResponsePaddingBottom: '0px',
		});
	});

	test('keeps background-image composer controls on complete opaque surfaces', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#ffffff');
		workbench.style.setProperty('--vscode-chat-list-background', '#ffffff');
		workbench.style.setProperty('--vscode-button-secondaryBackground', 'rgba(0, 0, 0, 0.08)');
		workbench.style.setProperty('--vscode-button-secondaryBorder', '#808080');
		workbench.style.setProperty('--vscode-button-secondaryForeground', '#202020');
		workbench.style.setProperty('--vscode-commandCenter-inactiveBorder', '#606060');
		workbench.style.setProperty('--vscode-cornerRadius-small', '4px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const newChatWidget = dom.append(chatView, dom.$('.sessions-chat-widget'));
		const newChatContent = dom.append(newChatWidget, dom.$('.new-chat-widget-content'));
		const newChatContainer = dom.append(newChatWidget, dom.$('.new-chat-widget-container'));
		const bottomContainer = dom.append(newChatContainer, dom.$('.new-chat-bottom-container'));
		const bottomAction = dom.append(bottomContainer, dom.$('.action-label'));
		const workspacePickerSlot = dom.append(newChatContainer, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		const workspacePill = dom.append(workspacePickerSlot, dom.$('.action-label'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const secondaryToolbar = dom.append(session, dom.$('.chat-secondary-toolbar'));
		const secondaryAction = dom.append(secondaryToolbar, dom.$('.action-label'));
		const contextUsage = dom.append(secondaryToolbar, dom.$('.chat-context-usage-widget'));
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
		const workspacePillStyle = dom.getWindow(workspacePill).getComputedStyle(workspacePill);
		const secondaryActionStyle = dom.getWindow(secondaryAction).getComputedStyle(secondaryAction);
		const contextUsageStyle = dom.getWindow(contextUsage).getComputedStyle(contextUsage);
		assert.deepStrictEqual({
			newChatBackgroundColor: newChatStyle.backgroundColor,
			newChatPadding: newChatStyle.padding,
			bottomActionBackgroundColor: bottomActionStyle.backgroundColor,
			bottomActionBorderColor: bottomActionStyle.borderColor,
			bottomActionBorderStyle: bottomActionStyle.borderStyle,
			bottomActionBorderRadius: bottomActionStyle.borderRadius,
			workspacePillBackgroundColor: workspacePillStyle.backgroundColor,
			secondaryActionBackgroundColor: secondaryActionStyle.backgroundColor,
			secondaryActionBackgroundImage: secondaryActionStyle.backgroundImage,
			secondaryActionBorderColor: secondaryActionStyle.borderColor,
			secondaryActionBorderStyle: secondaryActionStyle.borderStyle,
			contextUsageBackgroundColor: contextUsageStyle.backgroundColor,
			contextUsageBackgroundImage: contextUsageStyle.backgroundImage,
			contextUsageBorderRadius: contextUsageStyle.borderRadius,
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
			bottomActionBorderColor: 'rgb(96, 96, 96)',
			bottomActionBorderStyle: 'solid',
			bottomActionBorderRadius: '4px',
			workspacePillBackgroundColor: 'rgb(255, 255, 255)',
			secondaryActionBackgroundColor: 'rgb(255, 255, 255)',
			secondaryActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			secondaryActionBorderColor: 'rgb(128, 128, 128)',
			secondaryActionBorderStyle: 'solid',
			contextUsageBackgroundColor: 'rgb(255, 255, 255)',
			contextUsageBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			contextUsageBorderRadius: '4px',
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

	test('keeps sticky request gutters transparent over chat backgrounds', () => {
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
			const stickyRow = dom.append(stickyContainer, dom.$('.monaco-tree-sticky-row.monaco-list-row.request.passive-focused'));
			const treeRow = dom.append(stickyRow, dom.$('.monaco-tl-row'));
			const treeContents = dom.append(treeRow, dom.$('.monaco-tl-contents'));
			const request = dom.append(treeContents, dom.$('.interactive-item-container.editing-session.interactive-request.show-verbose-details'));
			const value = dom.append(request, dom.$('.value'));
			const bubble = dom.append(value, dom.$('.rendered-markdown'));
			return { stickyContainer, stickyRow, treeContents, request, bubble };
		};
		const background = createStickyRequest(part);
		const plain = createStickyRequest(plainPart);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		assert.deepStrictEqual({
			container: dom.getWindow(background.stickyContainer).getComputedStyle(background.stickyContainer).backgroundColor,
			row: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).backgroundColor,
			contents: dom.getWindow(background.treeContents).getComputedStyle(background.treeContents).backgroundColor,
			hoverBackground: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).getPropertyValue('--vscode-chat-list-background'),
			request: dom.getWindow(background.request).getComputedStyle(background.request).backgroundColor,
			bubble: dom.getWindow(background.bubble).getComputedStyle(background.bubble).backgroundColor,
			plainContainer: dom.getWindow(plain.stickyContainer).getComputedStyle(plain.stickyContainer).backgroundColor,
			plainRow: dom.getWindow(plain.stickyRow).getComputedStyle(plain.stickyRow).backgroundColor,
			plainRequest: dom.getWindow(plain.request).getComputedStyle(plain.request).backgroundColor,
		}, {
			container: 'rgba(0, 0, 0, 0)',
			row: 'rgba(0, 0, 0, 0)',
			contents: 'rgba(0, 0, 0, 0)',
			hoverBackground: 'transparent',
			request: 'rgb(32, 32, 32)',
			bubble: 'rgb(32, 32, 32)',
			plainContainer: 'rgb(255, 0, 0)',
			plainRow: 'rgb(255, 0, 0)',
			plainRequest: 'rgba(0, 0, 0, 0)',
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
