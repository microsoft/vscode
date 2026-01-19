/*---------------------------------------------------------------------------------------------
 *  Chat Webview Contribution
 *  注册 Kiro 风格的 AI 聊天 Webview 面板
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { IViewsRegistry, Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation, ViewContainer } from '../../../../common/views.js';
import { ChatWebviewPane, CHAT_WEBVIEW_ID } from './chatWebviewPane.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

// --- Icons
const chatWebviewIcon = registerIcon('chat-webview-icon', Codicon.comment, localize('chatWebviewIcon', 'View icon of the AI chat panel.'));

// --- View Container (独立的侧边栏容器)
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.chatWebviewContainer',
	title: localize2('aiChat', 'AI Chat'),
	icon: chatWebviewIcon,
	order: 5,
	ctorDescriptor: new SyncDescriptor(ChatWebviewPane),
	storageId: 'workbench.view.chatWebviewContainer.state',
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true }); // 放在辅助侧边栏，设为默认

// --- Register View
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: CHAT_WEBVIEW_ID,
	name: localize2('aiChatPane', 'AI Chat'),
	containerIcon: chatWebviewIcon,
	ctorDescriptor: new SyncDescriptor(ChatWebviewPane),
	canToggleVisibility: true,
	canMoveView: true,
	hideByDefault: false,
	collapsed: false,
	order: 1,
	weight: 100,
	focusCommand: { id: 'chatWebview.focus' }
}], VIEW_CONTAINER);

// --- Commands

// 打开 Chat Webview 面板
CommandsRegistry.registerCommand('aicore.openChatWebview', async (accessor) => {
	const viewsService = accessor.get(IViewsService);
	await viewsService.openView(CHAT_WEBVIEW_ID, true);
});

// 注意: chatWebview.focus 命令由 ViewsService 自动注册（基于 focusCommand 配置）

// --- Keybindings

// Ctrl+Shift+L 打开 AI Chat 面板
KeybindingsRegistry.registerKeybindingRule({
	id: 'aicore.openChatWebview',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
	when: undefined,
});
