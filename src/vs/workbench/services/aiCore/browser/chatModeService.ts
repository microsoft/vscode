/*---------------------------------------------------------------------------------------------
 *  AI Core Chat Mode Service
 *  管理 Vibe 和 Spec 两种对话模式
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import {
	ChatModeType,
	ChatModeInfo,
	VIBE_MODE,
	SPEC_MODE,
	VIBE_SYSTEM_PROMPT
} from '../common/chatModeTypes.js';
import { ISpecModeService } from './specModeService.js';

export const IChatModeService = createDecorator<IChatModeService>('IChatModeService');

export interface IChatModeService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeMode: Event<ChatModeType>;

	// 模式管理
	getCurrentMode(): ChatModeType;
	setMode(mode: ChatModeType): void;
	getModeInfo(mode: ChatModeType): ChatModeInfo;
	getAllModes(): ChatModeInfo[];

	// 是否已选择模式（用于显示初始选择界面）
	isModeSelected(): boolean;
	resetModeSelection(): void;

	// 获取当前模式的系统提示词
	getSystemPrompt(): string;

	// 获取当前模式的增强系统提示词（包含上下文）
	getEnhancedSystemPrompt(additionalContext?: string): string;
}

export class ChatModeService extends Disposable implements IChatModeService {
	readonly _serviceBrand: undefined;

	private _currentMode: ChatModeType = 'vibe';
	private _modeSelected: boolean = false;

	private readonly _onDidChangeMode = this._register(new Emitter<ChatModeType>());
	readonly onDidChangeMode = this._onDidChangeMode.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISpecModeService private readonly specModeService: ISpecModeService
	) {
		super();

		// 从配置中读取默认模式
		const savedMode = this.configurationService.getValue<ChatModeType>('aiCore.defaultChatMode');
		if (savedMode === 'vibe' || savedMode === 'spec') {
			this._currentMode = savedMode;
		}
	}

	getCurrentMode(): ChatModeType {
		return this._currentMode;
	}

	setMode(mode: ChatModeType): void {
		if (this._currentMode !== mode) {
			this._currentMode = mode;
			this._modeSelected = true;
			this.logService.info(`[ChatModeService] Mode changed to: ${mode}`);
			this._onDidChangeMode.fire(mode);

			// 如果切换到 Spec 模式，清除之前的会话
			if (mode === 'spec') {
				this.specModeService.clearSession();
			}
		} else if (!this._modeSelected) {
			this._modeSelected = true;
			this._onDidChangeMode.fire(mode);
		}
	}

	getModeInfo(mode: ChatModeType): ChatModeInfo {
		return mode === 'vibe' ? VIBE_MODE : SPEC_MODE;
	}

	getAllModes(): ChatModeInfo[] {
		return [VIBE_MODE, SPEC_MODE];
	}

	isModeSelected(): boolean {
		return this._modeSelected;
	}

	resetModeSelection(): void {
		this._modeSelected = false;
		this.specModeService.clearSession();
		this.logService.info('[ChatModeService] Mode selection reset');
	}

	getSystemPrompt(): string {
		if (this._currentMode === 'spec') {
			return this.specModeService.getSystemPrompt();
		}
		return VIBE_SYSTEM_PROMPT;
	}

	getEnhancedSystemPrompt(additionalContext?: string): string {
		let prompt = this.getSystemPrompt();

		// 添加通用能力说明
		prompt += `

## 可用能力
- 读取和分析代码文件
- 搜索项目中的代码
- 修改和创建文件（需要用户确认）
- 执行终端命令
- 联网搜索获取最新信息
- 诊断和修复错误
`;

		// 添加额外上下文
		if (additionalContext) {
			prompt += `\n${additionalContext}`;
		}

		// Spec 模式添加当前会话上下文
		if (this._currentMode === 'spec') {
			const specContext = this.specModeService.getContextForPrompt();
			if (specContext) {
				prompt += specContext;
			}
		}

		return prompt;
	}
}

registerSingleton(IChatModeService, ChatModeService, InstantiationType.Delayed);
