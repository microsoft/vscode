/*---------------------------------------------------------------------------------------------
 *  AI Core Specs Pane Contribution
 *  注册 Specs 侧边栏面板
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { IViewsRegistry, Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation, ViewContainer } from '../../../common/views.js';
import { SpecsPane, SPECS_VIEW_ID } from './specsPane.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ISpecModeService } from '../../../services/aiCore/browser/specModeService.js';
import { IChatModeService } from '../../../services/aiCore/browser/chatModeService.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

// --- Icons
const specsViewIcon = registerIcon('specs-view-icon', Codicon.notebook, localize('specsViewIcon', 'View icon of the specs panel.'));

// --- View Container (独立的侧边栏容器)
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.specsContainer',
	title: localize2('specs', 'Specs'),
	icon: specsViewIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(SpecsPane),
	storageId: 'workbench.view.specsContainer.state',
	hideIfEmpty: false,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: false }); // 放在辅助侧边栏

// --- Register View
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: SPECS_VIEW_ID,
	name: localize2('specsPane', 'Specs'),
	containerIcon: specsViewIcon,
	ctorDescriptor: new SyncDescriptor(SpecsPane),
	canToggleVisibility: true,
	canMoveView: true,
	hideByDefault: false,
	collapsed: false,
	order: 1,
	weight: 100,
	focusCommand: { id: 'specs.focus' }
}], VIEW_CONTAINER);

// --- Commands

// 打开 Specs 面板
CommandsRegistry.registerCommand('aicore.openSpecsPane', async (_accessor) => {
	// 聚焦到 Specs 视图
});

// 新建 Spec
CommandsRegistry.registerCommand('aicore.newSpec', async (accessor) => {
	const chatModeService = accessor.get(IChatModeService);

	// 切换到 Spec 模式
	chatModeService.setMode('spec');

	// 打开聊天面板
	// commandService.executeCommand('workbench.action.chat.open');
});

// Vibe → Spec 转换命令
CommandsRegistry.registerCommand('aicore.vibeToSpec', async (accessor) => {
	const chatModeService = accessor.get(IChatModeService);

	// 如果当前在 Vibe 模式，切换到 Spec 模式
	if (chatModeService.getCurrentMode() === 'vibe') {
		chatModeService.setMode('spec');

		// 如果有聊天历史，可以基于它创建 Spec 会话
		// 这里简化处理，直接切换模式
	}
});

// 检查已完成任务
CommandsRegistry.registerCommand('aicore.checkCompletedTasks', async (accessor) => {
	const specService = accessor.get(ISpecModeService);
	await specService.scanCompletedTasks?.();
});

// 执行所有任务
CommandsRegistry.registerCommand('aicore.executeAllTasks', async (accessor) => {
	const specService = accessor.get(ISpecModeService);
	const session = specService.getCurrentSession();

	if (!session) {
		return;
	}

	// 逐个执行待处理任务
	let nextTask = specService.getNextTask();
	while (nextTask) {
		await specService.executeTaskWithLLM(nextTask);
		nextTask = specService.getNextTask();
	}
});

// --- Keybindings

// Ctrl+Shift+S 打开 Specs 面板
KeybindingsRegistry.registerKeybindingRule({
	id: 'aicore.openSpecsPane',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
	when: undefined,
});

// --- Menu Items

// 在 View 菜单中添加 Specs 面板
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
	command: {
		id: 'aicore.newSpec',
		title: localize('newSpec', 'New Spec'),
		icon: Codicon.add
	},
	when: undefined,
	group: 'navigation',
	order: 1
});

// 在聊天面板添加 "生成规格说明" 选项
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
	command: {
		id: 'aicore.vibeToSpec',
		title: localize('generateSpec', 'Generate Spec from Chat'),
		icon: Codicon.notebook
	},
	when: undefined,
	group: 'navigation',
	order: 100
});
