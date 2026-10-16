/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { retry } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IChatAttachmentWidgetInstance, IChatAttachmentWidgetRegistry } from '../../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { createChatReferenceVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { IChatSessionCost } from '../../../../common/model/chatModel.js';
import { MockChatModel } from '../../../common/model/mockChatModel.js';
import '../../../../browser/widget/media/chat.css';

suite('ChatInputPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('session-cost listener updates the usage widget without another turn and detaches on chat switches', () => {
		const first = store.add(new MockChatModel(URI.parse('test:/first')));
		const peer = store.add(new MockChatModel(URI.parse('test:/peer')));
		const widget = { viewModel: { model: first } };
		const costs: IChatSessionCost[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_contextUsageDisposables: store.add(new MutableDisposable()),
			_widget: widget,
			contextUsageWidget: {
				update: () => { },
				updateSessionCost: (credits: number, status?: IChatSessionCost['status']) => costs.push({ credits, status }),
			},
			languageModelsService: { onDidChangeLanguageModels: Event.None },
		}) as { updateContextUsageWidget(): void };

		inputPart.updateContextUsageWidget();
		first.setSessionCost({ credits: 0.6, status: 'complete' });
		widget.viewModel.model = peer;
		inputPart.updateContextUsageWidget();
		first.setSessionCost({ credits: 1.2, status: 'complete' });
		peer.setSessionCost({ credits: 0.25, status: 'partial' });
		assert.deepStrictEqual(costs, [
			{ credits: 0, status: undefined },
			{ credits: 0.6, status: 'complete' },
			{ credits: 0, status: undefined },
			{ credits: 0.25, status: 'partial' },
		]);
	});

	test('renders contributed attachment widgets for the session of the input model that holds the attachments, else the widget session', () => {
		const restoredSession = URI.parse('remote-remote.example__1-copilotcli:/restored');
		const chip = createChatReferenceVariableEntry(URI.parse('ahp-chat://default/c2Vzc2lvbg'), undefined, 'Chat');
		const createdFor: (string | undefined)[] = [];
		// While setInputModel restores the incoming session's attachments, the
		// widget's view model is still absent (first load) or the outgoing session.
		const render = (inputModelSession: URI | undefined, viewModelSession: URI | undefined) => {
			const attachedContextDisposables = store.add(new MutableDisposable());
			const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
				attachedContextContainer: dom.$('div'),
				attachmentsContainer: dom.$('div'),
				attachedContextDisposables,
				_attachmentModel: { attachments: [chip] },
				configurationService: { getValue: () => false },
				options: {},
				_currentLanguageModel: observableValue('model', undefined),
				_indexOfLastAttachedContextDeletedWithKeyboard: -1,
				_indexOfLastOpenedContext: -1,
				_inputModelSessionResource: inputModelSession,
				_widget: viewModelSession && { viewModel: { sessionResource: viewModelSession } },
				_chatAttachmentWidgetRegistry: {
					createWidget: (_attachment, _options, _container, sessionResource): IChatAttachmentWidgetInstance => {
						createdFor.push(sessionResource?.toString());
						return { element: dom.$('div'), onDidDelete: Event.None, onDidOpen: Event.None, dispose: () => { } };
					},
				} satisfies Pick<IChatAttachmentWidgetRegistry, 'createWidget'>,
			}) as ChatInputPart;
			inputPart.renderAttachedContext();
			attachedContextDisposables.dispose();
		};

		const editedRequestSession = URI.parse('agent-host-copilotcli:/edited');
		render(restoredSession, undefined);
		render(restoredSession, URI.parse('agent-host-copilotcli:/outgoing'));
		// The inline request-edit input part never binds an input model.
		render(undefined, editedRequestSession);

		assert.deepStrictEqual(createdFor, [restoredSession.toString(), restoredSession.toString(), editedRequestSession.toString()]);
	});

	test('uses the Sessions content gutter for composer layout', () => {
		const followupsContainer = dom.$('div');
		const editorLayouts: { width: number; height: number }[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { isSessionsWindow: true },
			inputContainer: dom.$('div'),
			followupsContainer,
			_inputEditor: {
				getScrollWidth: () => 100,
				getContentHeight: () => 20,
				layout: (dimension: { width: number; height: number }) => editorLayouts.push(dimension),
			},
			inputEditorMaxHeight: 250,
			inputEditorMinHeight: undefined,
			singleLineInputEditorHeight: 20,
			inputEditorTrailingSpace: 0,
			ignoreInputEditorContentSizeChanges: false,
		}) as ChatInputPart;

		inputPart.layout(800);

		assert.deepStrictEqual({
			followupsWidth: followupsContainer.style.width,
			editorLayouts,
		}, {
			followupsWidth: '752px',
			editorLayouts: [{ width: 740, height: 20 }],
		});
	});

	test('working borders rotate fixed gradients inside masks at any input aspect ratio', async () => {
		const host = mainWindow.document.body.appendChild(dom.$('.monaco-workbench'));
		host.style.cssText = '--vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px;';
		store.add(toDisposable(() => host.remove()));
		const session = dom.append(host, dom.$('.interactive-session'));
		const inputPart = dom.append(session, dom.$('.interactive-input-part'));
		const input = dom.append(inputPart, dom.$('.chat-input-container.working'));
		const beam = dom.append(input, dom.$('.chat-input-working-border'));
		const glow = dom.append(input, dom.$('.chat-input-working-border.chat-input-working-border-glow'));
		await retry(async () => assert.strictEqual(mainWindow.getComputedStyle(beam).position, 'absolute'), 10, 100);
		const geometry = [];
		for (const [width, height] of [[400, 80], [200, 300], [333.33, 97.25]]) {
			input.style.width = `${width}px`;
			input.style.height = `${height}px`;
			geometry.push(...[beam, glow].map(border => {
				const bounds = border.getBoundingClientRect();
				const style = mainWindow.getComputedStyle(border, '::before');
				// Allow 1/64px layout rounding plus computed-style serialization.
				return {
					coversCorners: Math.abs(parseFloat(style.width) - Math.hypot(bounds.width, bounds.height)) < 0.02,
					animation: style.animationName,
					timing: style.animationTimingFunction,
				};
			}));
		}
		const animations = input.getAnimations({ subtree: true }).filter(animation => animation instanceof mainWindow.CSSAnimation);
		const keyframes = animations.map(animation => animation.effect instanceof mainWindow.KeyframeEffect
			? animation.effect.getKeyframes().map(frame => frame.transform)
			: []);
		const reduced = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
		input.classList.remove('working');

		assert.deepStrictEqual({
			geometry,
			keyframes,
			idleAnimations: input.getAnimations({ subtree: true }).filter(animation => animation instanceof mainWindow.CSSAnimation).length,
		}, {
			geometry: Array.from({ length: 6 }, () => ({
				coversCorners: true, animation: reduced ? 'none' : 'chat-input-working-border-spin', timing: reduced ? 'ease' : 'linear',
			})),
			keyframes: reduced ? [] : Array.from({ length: 2 }, () => ['translate(-50%, -50%) rotate(0deg)', 'translate(-50%, -50%) rotate(360deg)']),
			idleAnimations: 0,
		});
	});

	test('decorative input borders do not increase ancestor scroll overflow', async () => {
		const snapshots = [];
		for (const compact of [false, true]) {
			for (const working of [false, true]) {
				const host = mainWindow.document.body.appendChild(dom.$('.monaco-workbench'));
				host.style.cssText = 'position: relative; width: 500px; height: 100px; overflow: hidden; --vscode-strokeThickness: 1px;';
				store.add(toDisposable(() => host.remove()));
				const session = dom.append(host, dom.$('.interactive-session'));
				const inputPart = dom.append(session, dom.$('.interactive-input-part'));
				inputPart.classList.toggle('compact', compact);
				const input = dom.append(inputPart, dom.$('.chat-input-container'));
				input.classList.toggle('working', working);
				input.style.cssText = 'width: 400px; height: 40px;';
				await retry(async () => assert.strictEqual(mainWindow.getComputedStyle(input).position, 'relative'), 10, 100);
				const before = { width: host.scrollWidth, height: host.scrollHeight };
				dom.append(input, dom.$('.chat-input-working-border'));
				dom.append(input, dom.$('.chat-input-working-border.chat-input-working-border-glow'));
				snapshots.push({
					compact,
					working,
					widthIncrease: host.scrollWidth - before.width,
					heightIncrease: host.scrollHeight - before.height,
				});
			}
		}
		assert.deepStrictEqual(snapshots, [
			{ compact: false, working: false, widthIncrease: 0, heightIncrease: 0 },
			{ compact: false, working: true, widthIncrease: 0, heightIncrease: 0 },
			{ compact: true, working: false, widthIncrease: 0, heightIncrease: 0 },
			{ compact: true, working: true, widthIncrease: 0, heightIncrease: 0 },
		]);
	});
});
