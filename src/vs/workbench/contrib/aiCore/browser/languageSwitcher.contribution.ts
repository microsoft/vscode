/*---------------------------------------------------------------------------------------------
 *  Language Switcher Contribution
 *  在标题栏右上角添加中英文切换功能
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { ILanguagePackItem } from '../../../../platform/languagePacks/common/languagePacks.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Language } from '../../../../base/common/platform.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

// ============================================================================
// 语言切换命令 - 在标题栏显示
// ============================================================================
registerAction2(class SwitchLanguageAction extends Action2 {
	constructor() {
		super({
			id: 'aicore.switchLanguage',
			title: {
				value: localize('aicore.switchLanguage', 'Switch Language / 切换语言'),
				original: 'Switch Language / 切换语言'
			},
			icon: Codicon.globe,
			menu: [
				{
					id: MenuId.CommandPalette
				},
				{
					// 添加到标题栏右侧的全局活动区域
					id: MenuId.GlobalActivity,
					group: 'navigation',
					order: 1
				},
				{
					// 添加到账户菜单
					id: MenuId.AccountsContext,
					group: '1_language',
					order: 1
				}
			],
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyU,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		// 直接调用 VSCode 原生的语言配置命令，这是最可靠的方式
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.configureLocale');
	}
});

// ============================================================================
// 快速切换到中文
// ============================================================================
registerAction2(class SwitchToChineseAction extends Action2 {
	constructor() {
		super({
			id: 'aicore.switchToChinese',
			title: {
				value: localize('aicore.switchToChinese', 'Switch to Chinese / 切换到中文'),
				original: 'Switch to Chinese / 切换到中文'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const localeService = accessor.get(ILocaleService);
		const notificationService = accessor.get(INotificationService);

		const languagePackItem: ILanguagePackItem = {
			id: 'zh-cn',
			label: '简体中文',
			extensionId: 'MS-CEINTL.vscode-language-pack-zh-hans'
		};

		notificationService.info(localize('aicore.switchingToChinese', 'Switching to Chinese...'));
		await localeService.setLocale(languagePackItem);
	}
});

// ============================================================================
// 快速切换到英文
// ============================================================================
registerAction2(class SwitchToEnglishAction extends Action2 {
	constructor() {
		super({
			id: 'aicore.switchToEnglish',
			title: {
				value: localize('aicore.switchToEnglish', 'Switch to English / 切换到英文'),
				original: 'Switch to English / 切换到英文'
			},
			menu: [{ id: MenuId.CommandPalette }]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const localeService = accessor.get(ILocaleService);
		const notificationService = accessor.get(INotificationService);

		const languagePackItem: ILanguagePackItem = {
			id: 'en',
			label: 'English'
		};

		notificationService.info(localize('aicore.switchingToEnglish', 'Switching to English...'));
		await localeService.setLocale(languagePackItem);
	}
});

// ============================================================================
// 状态栏语言指示器
// ============================================================================
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';

// ============================================================================
// 状态栏语言指示器
// ============================================================================
class LanguageStatusBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.languageStatusBar';

	private statusBarItem: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super();

		this.createStatusBarItem();
	}

	private createStatusBarItem(): void {
		const currentLanguage = Language.value();
		const displayLabel = this.getLanguageDisplayName(currentLanguage);

		this.statusBarItem = this.statusbarService.addEntry(
			{
				name: localize('language', 'Language'),
				text: `$(globe) ${displayLabel}`,
				ariaLabel: localize('currentLanguage', 'Current language: {0}', displayLabel),
				tooltip: localize('clickToChange', 'Click to change language / 点击切换语言'),
				command: 'aicore.switchLanguage'
			},
			'status.language',
			StatusbarAlignment.RIGHT,
			100
		);

		this._register(this.statusBarItem);
	}

	private getLanguageDisplayName(languageId: string): string {
		if (languageId.startsWith('zh-cn') || languageId.startsWith('zh-hans')) {
			return '中文';
		}
		if (languageId.startsWith('zh-tw') || languageId.startsWith('zh-hant')) {
			return '繁體';
		}
		if (languageId.startsWith('ja')) {
			return '日本語';
		}
		if (languageId.startsWith('ko')) {
			return '한국어';
		}
		if (languageId.startsWith('en')) {
			return 'EN';
		}
		return languageId.toUpperCase().slice(0, 2);
	}
}

registerWorkbenchContribution2(
	LanguageStatusBarContribution.ID,
	LanguageStatusBarContribution,
	WorkbenchPhase.AfterRestored
);

// ============================================================================
// 首次启动时提示切换到中文
// ============================================================================
const LANGUAGE_PROMPT_SHOWN_KEY = 'aicore.languagePromptShown';

class LanguagePromptContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.languagePrompt';

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILocaleService private readonly localeService: ILocaleService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		this.checkAndPromptLanguage();
	}

	private async checkAndPromptLanguage(): Promise<void> {
		// 检查是否已经提示过
		const prompted = this.storageService.getBoolean(LANGUAGE_PROMPT_SHOWN_KEY, StorageScope.APPLICATION, false);

		if (prompted) {
			return;
		}

		// 检查当前语言是否是中文
		const currentLanguage = Language.value();
		if (currentLanguage.startsWith('zh')) {
			// 已经是中文，标记已提示
			this.storageService.store(LANGUAGE_PROMPT_SHOWN_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
			return;
		}

		// 延迟显示提示，等待应用完全加载
		setTimeout(async () => {
			const result = await this.dialogService.confirm({
				type: 'info',
				message: '切换到中文界面？ / Switch to Chinese?',
				detail: '检测到您的系统语言可能偏好中文，是否切换到中文界面？\n\nWe detected you might prefer Chinese. Would you like to switch to Chinese interface?',
				primaryButton: '切换到中文 / Switch to Chinese',
				cancelButton: '保持英文 / Keep English'
			});

			// 标记已提示
			this.storageService.store(LANGUAGE_PROMPT_SHOWN_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);

			if (result.confirmed) {
				const languagePackItem: ILanguagePackItem = {
					id: 'zh-cn',
					label: '简体中文',
					extensionId: 'MS-CEINTL.vscode-language-pack-zh-hans'
				};

				this.notificationService.info('正在切换到中文界面...');
				await this.localeService.setLocale(languagePackItem);
			}
		}, 3000); // 3秒后显示
	}
}

registerWorkbenchContribution2(
	LanguagePromptContribution.ID,
	LanguagePromptContribution,
	WorkbenchPhase.Eventually
);
