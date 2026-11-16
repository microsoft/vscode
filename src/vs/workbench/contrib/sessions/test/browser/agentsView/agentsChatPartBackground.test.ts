/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import '../../../browser/chatBackgroundActions.js';
import { Menus } from '../../../browser/menus.js';
import { DefaultChatViewFactory } from '../../../browser/chat/defaultChatViewFactory.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ISessionsChatBackground, ISessionsChatBackgroundService } from '../../../browser/chatBackgroundService.js';

suite('Agents Chat Part - chat background', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let workbench: HTMLElement;
	setup(() => {
		workbench = mainWindow.document.body.appendChild($('.monaco-workbench'));
	});
	teardown(() => workbench.remove());

	test('the chat part shows the chat background through its editor part, which the editor background otherwise covers, and follows the background as it changes', () => {
		const onDidChangeBackground = store.add(new Emitter<void>());
		let background: ISessionsChatBackground | undefined = { kind: 'image', backgroundImage: 'linear-gradient(red, blue)', backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center' };
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
			override readonly onDidChangeBackground = onDidChangeBackground.event;
			override getBackground() { return background; }
		}());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		// As the chat part creates its editor part, which paints the editor background inline on it, its content and its editors
		const editorBackground = 'rgb(30, 30, 30)';
		const part = append(workbench, $('.agents-chat-part.part.editor'));
		part.style.cssText = `width: 400px; height: 300px; background-color: ${editorBackground};`;
		const content = append(part, $('.content'));
		content.style.backgroundColor = editorBackground;
		const editor = append(content, $('.editor-container'));
		editor.style.backgroundColor = editorBackground;

		// As the chat part paints the chat background, with the chat view factory of editor windows
		const factory = instantiationService.createInstance(DefaultChatViewFactory);
		const surface = factory.createChatBackground(part, instantiationService);
		const read = () => {
			const layer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
			return {
				hasImage: part.classList.contains('has-chat-background-image'),
				// Behind the part, as large as it is
				layer: !!layer && !layer.hidden && layer.getBoundingClientRect().width === 400 && layer.getBoundingClientRect().height === 300 && mainWindow.getComputedStyle(layer).backgroundImage.includes('gradient'),
				// What would cover it: the editor background, inline on the part's content and its editors
				contentCovers: mainWindow.getComputedStyle(content).backgroundColor !== 'rgba(0, 0, 0, 0)',
				editorCovers: mainWindow.getComputedStyle(editor).backgroundColor !== 'rgba(0, 0, 0, 0)',
			};
		};
		const shown = read();
		background = undefined;
		onDidChangeBackground.fire();
		const cleared = read();
		surface.dispose();

		assert.deepStrictEqual({ shown, cleared }, {
			shown: { hasImage: true, layer: true, contentCovers: false, editorCovers: false },
			cleared: { hasImage: false, layer: false, contentCovers: false, editorCovers: false },
		});
	});

	test('an editor window offers the chat background\'s commands while its chat part shows, as the Agents window does, except the tint, and has its settings, always', () => {
		const commands = ['workbench.action.chat.changeAgentSessionsBackground', 'workbench.action.chat.changeAgentSessionsBackgroundLayout', 'workbench.action.chat.toggleAgentSessionsBackgroundTint'];
		const palette = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem);
		const shown = (values: Record<string, ContextKeyValue>) => commands.map(id => {
			const item = palette.find(candidate => candidate.command.id === id);
			// The tint toggle is in the palette by its f1 and its precondition
			const when = item?.when ?? MenuRegistry.getCommand(id)?.precondition;
			return !!when?.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T });
		});
		const background = { 'chatIsEnabled': true, 'sessionsChatBackgroundAvailable': true, 'sessionsChatBackgroundImageConfigured': true };
		const settingKeys = ['chat.agentSessions.preferredDarkBackgroundImage', 'chat.agentSessions.preferredLightBackgroundImage', 'chat.agentSessions.preferredDarkBackgroundImageLayout', 'chat.agentSessions.preferredLightBackgroundImageLayout', 'chat.agentSessions.backgroundImageTint'];
		const registered = () => {
			const properties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
			return settingKeys.every(key => !!properties[key]);
		};
		assert.deepStrictEqual({
			chatPart: shown({ ...background, agentsChatPartVisible: true }),
			agentsWindow: shown({ ...background, isSessionsWindow: true }),
			editorWindowWithoutChatPart: shown(background),
			highContrast: shown({ ...background, sessionsChatBackgroundAvailable: false, agentsChatPartVisible: true }),
			settings: registered(),
		}, {
			chatPart: [true, true, false],
			agentsWindow: [true, true, true],
			editorWindowWithoutChatPart: [false, false, false],
			highContrast: [false, false, false],
			settings: true,
		});
	});

	test('the chat background context menu lists its commands in the Agents window and while the chat area shows, not in an editor window whose chat area is hidden', () => {
		const commands = ['workbench.action.chat.changeAgentSessionsBackground', 'workbench.action.chat.changeAgentSessionsBackgroundLayout'];
		const menu = MenuRegistry.getMenuItems(Menus.SessionChatBackgroundContext).filter(isIMenuItem);
		const shown = (values: Record<string, ContextKeyValue>) => commands.map(id => !!menu.find(item => item.command.id === id)?.when?.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T }));
		const background = { 'chatIsEnabled': true, 'sessionsChatBackgroundAvailable': true, 'sessionsChatBackgroundImageConfigured': true };

		assert.deepStrictEqual({
			chatAreaVisible: shown({ ...background, agentsChatPartVisible: true }),
			agentsWindow: shown({ ...background, isSessionsWindow: true }),
			chatAreaHidden: shown(background),
		}, {
			chatAreaVisible: [true, true],
			agentsWindow: [true, true],
			chatAreaHidden: [false, false],
		});
	});

	test('the context menu of a chat offers the chat background\'s commands in the Agents window and in the chat area, not in another chat of an editor window whose chat area shows', () => {
		const commands = ['workbench.action.chat.changeAgentSessionsBackground', 'workbench.action.chat.changeAgentSessionsBackgroundLayout', 'workbench.action.chat.toggleAgentSessionsBackgroundTint'];
		const menu = MenuRegistry.getMenuItems(MenuId.ChatContext).filter(isIMenuItem);
		const shown = (values: Record<string, ContextKeyValue>) => commands.map(id => !!menu.find(item => item.command.id === id)?.when?.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T }));
		const background = { 'chatIsEnabled': true, 'sessionsChatBackgroundAvailable': true, 'sessionsChatBackgroundImageConfigured': true, 'chatContextMenuIsBackground': true };

		assert.deepStrictEqual({
			chatArea: shown({ ...background, agentsChatPartVisible: true, inAgentsChatPart: true }),
			agentsWindow: shown({ ...background, isSessionsWindow: true }),
			otherChat: shown({ ...background, agentsChatPartVisible: true }),
		}, {
			chatArea: [true, true, false],
			agentsWindow: [true, true, true],
			otherChat: [false, false, false],
		});
	});
});
