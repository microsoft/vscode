/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveElement } from '../../../../../../base/browser/dom.js';
import type { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import type { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IDetachedTerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ChatBackgroundShellOutputAccessibleView } from '../../../browser/accessibility/chatBackgroundShellOutputAccessibleView.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { BackgroundShellOutputView } from '../../../browser/sessionBackgroundShellOutputView.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import type { ChatBackgroundShellOutput } from '../../../common/sessionChatPills.js';

suite('ChatBackgroundShellOutputAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the focused output as text and returns focus to it, or to the chat input once it is gone', () => {
		let chatInputFocus = 0;
		const instantiationService = store.add(new TestInstantiationService());
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			// The text comes from the output itself, so the view never needs its terminal here.
			override createDetachedTerminal(): Promise<IDetachedTerminalInstance> {
				return new Promise<IDetachedTerminalInstance>(() => { });
			}
		}());
		instantiationService.stub(IMarkdownRendererService, new class extends mock<IMarkdownRendererService>() {
			override render(markdown: IMarkdownString): IRenderedMarkdown {
				const element = document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose: () => { } };
			}
		}());
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint(): string | null {
				return 'Open it with Alt+F2';
			}
		}());
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly lastFocusedWidget = new class extends mock<IChatWidget>() {
				override focusInput(): void {
					chatInputFocus++;
				}
			}();
		}());
		const output = observableValue<ChatBackgroundShellOutput>('output', { status: 'running', text: '\x1b[32mstep 1\x1b[0m\nstep 2\n' });
		const view = instantiationService.createInstance(BackgroundShellOutputView, 'build.sh', output, []);
		mainWindow.document.body.appendChild(view.element);
		const region = view.element.querySelector<HTMLElement>('.chat-terminal-output-container');
		assert.ok(region);
		const accessibleView = new ChatBackgroundShellOutputAccessibleView();
		const getProvider = () => instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));

		const unfocused = getProvider();
		region.focus();
		const provider = getProvider();
		assert.ok(provider);
		store.add(provider);
		// The text is read when the view opens, before the picker closes.
		output.set({ status: 'exited', text: 'step 2\n', exitCode: 0 }, undefined);
		region.blur();
		provider.onClose();
		const refocused = getActiveElement() === region;
		const shown = {
			region: { role: region.getAttribute('role'), tabIndex: region.tabIndex, label: region.getAttribute('aria-label') },
			inRegion: contextKeyService.getContext(region).getValue(ChatContextKeys.inChatBackgroundShellOutput.key),
			outsideRegion: contextKeyService.getContext(mainWindow.document.body).getValue(ChatContextKeys.inChatBackgroundShellOutput.key),
		};
		// The picker releases the output view when it closes.
		view.dispose();
		provider.onClose();

		assert.deepStrictEqual({
			shown,
			unfocused,
			provider: {
				id: provider.id,
				type: provider.options.type,
				language: provider.options.language,
				verbositySettingKey: provider.verbositySettingKey,
				content: provider.provideContent(),
			},
			refocused,
			chatInputFocus,
			removed: !region.isConnected,
		}, {
			shown: {
				region: { role: 'region', tabIndex: 0, label: 'Terminal output for build.sh, Open it with Alt+F2' },
				inRegion: true,
				outsideRegion: undefined,
			},
			unfocused: undefined,
			provider: {
				id: AccessibleViewProviderId.ChatBackgroundShellOutput,
				type: AccessibleViewType.View,
				language: 'text',
				verbositySettingKey: AccessibilityVerbositySettingId.TerminalChatOutput,
				content: 'Command: build.sh\nStatus: Running\nstep 1\nstep 2',
			},
			refocused: true,
			chatInputFocus: 1,
			removed: true,
		});
	});
});
