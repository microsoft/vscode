/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
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
import { DefaultChatViewFactory } from '../../../browser/chat/defaultChatViewFactory.js';
import { registerChatBackgroundConfiguration } from '../../../browser/chatBackgroundActions.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { IEditorWindowChatPartService } from '../../../browser/agentsView/agentsChatPartContribution.js';
import { EditorWindowChatBackgroundConfiguration } from '../../../browser/editorWindow/editorWindowChatBackground.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, SessionsChatBackgroundTint } from '../../../browser/chatBackgroundTint.js';
import { Color } from '../../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchThemeService } from '../../../../../services/themes/common/workbenchThemeService.js';
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

	test('an editor window offers the chat background\'s commands while its chat part shows, as the Agents window does, and its settings while something holds them, such as its chat area while enabled', () => {
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
		// Once, however many hold them, until the last lets go; the Agents window, as another suite loads it, holds them for good
		const unheld = registered();
		const first = registerChatBackgroundConfiguration();
		const second = registerChatBackgroundConfiguration();
		first.dispose();
		const stillHeld = registered();
		second.dispose();

		assert.deepStrictEqual({
			chatPart: shown({ ...background, agentsChatPartVisible: true }),
			agentsWindow: shown({ ...background, isSessionsWindow: true }),
			editorWindowWithoutChatPart: shown(background),
			highContrast: shown({ ...background, sessionsChatBackgroundAvailable: false, agentsChatPartVisible: true }),
			settings: { held: stillHeld, released: registered() === unheld },
		}, {
			chatPart: [true, true, true],
			agentsWindow: [true, true, true],
			editorWindowWithoutChatPart: [false, false, false],
			highContrast: [false, false, false],
			settings: { held: true, released: true },
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
			chatArea: [true, true, true],
			agentsWindow: [true, true, true],
			otherChat: [false, false, false],
		});
	});

	test('an editor window has the chat background\'s settings and tint while its chat area is enabled, also beside the hold of an Agents window, and none of a tint saved while it is not', async () => {
		const registered = () => !!Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()['chat.agentSessions.preferredDarkBackgroundImage'];
		const enabled = observableValue('enabled', false);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorWindowChatPartService, upcastPartial<IEditorWindowChatPartService>({ enabled }));
		// Saved in the settings: an image, and the tint on
		const image = URI.file('/backgrounds/koi.png');
		instantiationService.stub(ISessionsChatBackgroundService, upcastPartial<ISessionsChatBackgroundService>({
			onDidChangeBackground: Event.None,
			getBackground: () => ({ kind: 'image', backgroundImage: `url(${image.toString()})`, backgroundRepeat: 'repeat', backgroundSize: 'auto', backgroundPosition: 'center' }),
			getConfiguredBackgroundImage: () => image,
		}));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING]: true }));
		let overlays = 0;
		instantiationService.stub(IWorkbenchThemeService, upcastPartial<IWorkbenchThemeService>({ registerColorThemeOverlay: () => { overlays++; return toDisposable(() => overlays--); } }));
		instantiationService.stub(ILogService, new NullLogService());
		let samples = 0;
		class TestTint extends SessionsChatBackgroundTint {
			protected override async readImageColor(): Promise<Color | undefined> {
				samples++;
				return Color.fromHex('#3366cc');
			}
		}
		class TestConfiguration extends EditorWindowChatBackgroundConfiguration {
			protected override createTint(instantiationService: IInstantiationService): SessionsChatBackgroundTint {
				return instantiationService.createInstance(TestTint);
			}
		}
		const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
		const state = () => ({ settings: registered(), samples, overlays });
		// Unless another suite has loaded the Agents window, which holds the settings for good
		const before = registered();
		const contribution = instantiationService.createInstance(TestConfiguration);
		await settle();
		const disabled = state();
		enabled.set(true, undefined);
		await settle();
		const enabledState = state();
		enabled.set(false, undefined);
		await settle();
		const disabledAgain = state();
		// Beside another hold, such as the Agents window's, disabling the chat area keeps the settings
		const other = registerChatBackgroundConfiguration();
		enabled.set(true, undefined);
		enabled.set(false, undefined);
		const besideOther = registered();
		other.dispose();
		contribution.dispose();

		assert.deepStrictEqual({ disabled, enabled: enabledState, disabledAgain, besideOther, after: registered() === before }, {
			disabled: { settings: before, samples: 0, overlays: 0 },
			enabled: { settings: true, samples: 1, overlays: 1 },
			disabledAgain: { settings: before, samples: 1, overlays: 0 },
			besideOther: true,
			after: true,
		});
	});
});
