/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { AISpecConfig, AISpecRule, AISpecTrigger, DEFAULT_AISPEC_CONFIG } from './specTypes.js';

export const IAISpecService = createDecorator<IAISpecService>('IAISpecService');

export interface IAISpecService {
	readonly _serviceBrand: undefined;

	/** 配置变更事件 */
	readonly onDidChangeConfig: Event<AISpecConfig>;

	/** 获取当前配置 */
	getConfig(): AISpecConfig;

	/** 获取适用于当前文件的规则 */
	getRulesForFile(filePath: string): AISpecRule[];

	/** 获取 System Prompt 前缀（所有规则合并） */
	getSystemPromptPrefix(filePath?: string): string;

	/** 获取触发器 */
	getTriggers(event: AISpecTrigger['event'], filePath?: string): AISpecTrigger[];

	/** 重新加载配置 */
	reloadConfig(): Promise<void>;

	/** 保存配置 */
	saveConfig(config: AISpecConfig): Promise<void>;

	/** 初始化默认配置文件 */
	initDefaultConfig(): Promise<URI | undefined>;
}

export class AISpecService extends Disposable implements IAISpecService {
	readonly _serviceBrand: undefined;

	private _config: AISpecConfig = DEFAULT_AISPEC_CONFIG;
	private _configUri: URI | undefined;

	private readonly _onDidChangeConfig = this._register(new Emitter<AISpecConfig>());
	readonly onDidChangeConfig = this._onDidChangeConfig.event;

	private static readonly CONFIG_FILE_NAMES = ['.aispec', '.aispec.json', 'aispec.json'];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService
	) {
		super();
		this.loadConfigFromWorkspace();
	}

	getConfig(): AISpecConfig {
		return this._config;
	}

	getRulesForFile(filePath: string): AISpecRule[] {
		const rules: AISpecRule[] = [];

		// 1. 全局规则
		for (const rule of this._config.rules) {
			if (rule.enabled !== false) {
				if (!rule.glob || this.matchGlob(filePath, rule.glob)) {
					rules.push(rule);
				}
			}
		}

		// 2. 文件类型特定规则
		if (this._config.fileRules) {
			for (const [pattern, fileRules] of Object.entries(this._config.fileRules)) {
				if (this.matchGlob(filePath, pattern)) {
					for (const rule of fileRules) {
						if (rule.enabled !== false) {
							rules.push(rule);
						}
					}
				}
			}
		}

		// 按优先级排序
		return rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	getSystemPromptPrefix(filePath?: string): string {
		const rules = filePath ? this.getRulesForFile(filePath) : this._config.rules.filter(r => r.enabled !== false);

		if (rules.length === 0) {
			return '';
		}

		const rulesText = rules.map(r => `- ${r.content}`).join('\n');
		return `## 项目规范\n\n请遵循以下规则：\n${rulesText}\n\n---\n\n`;
	}

	getTriggers(event: AISpecTrigger['event'], filePath?: string): AISpecTrigger[] {
		if (!this._config.triggers) {
			return [];
		}

		return this._config.triggers.filter(t => {
			if (t.enabled === false) {
				return false;
			}
			if (t.event !== event) {
				return false;
			}
			if (filePath && t.glob && !this.matchGlob(filePath, t.glob)) {
				return false;
			}
			return true;
		});
	}

	async reloadConfig(): Promise<void> {
		await this.loadConfigFromWorkspace();
		this._onDidChangeConfig.fire(this._config);
	}

	async saveConfig(config: AISpecConfig): Promise<void> {
		const uri = this._configUri ?? await this.getDefaultConfigUri();
		if (!uri) {
			this.logService.warn('[AISpecService]: No workspace folder to save config');
			return;
		}

		const content = JSON.stringify(config, null, 2);
		await this.fileService.writeFile(uri, VSBuffer.fromString(content));
		this._config = config;
		this._configUri = uri;
		this._onDidChangeConfig.fire(this._config);
		this.logService.info(`[AISpecService]: Saved config to ${uri.toString()}`);
	}

	async initDefaultConfig(): Promise<URI | undefined> {
		const uri = await this.getDefaultConfigUri();
		if (!uri) {
			return undefined;
		}

		try {
			const exists = await this.fileService.exists(uri);
			if (!exists) {
				await this.saveConfig(DEFAULT_AISPEC_CONFIG);
				return uri;
			}
		} catch (error) {
			this.logService.error(`[AISpecService]: Failed to init config: ${String(error)}`);
		}

		return undefined;
	}

	private async loadConfigFromWorkspace(): Promise<void> {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			this.logService.trace('[AISpecService]: No workspace folders');
			return;
		}

		for (const folder of folders) {
			for (const fileName of AISpecService.CONFIG_FILE_NAMES) {
				const configUri = URI.joinPath(folder.uri, fileName);
				try {
					const exists = await this.fileService.exists(configUri);
					if (exists) {
						const content = await this.fileService.readFile(configUri);
						const config = JSON.parse(new TextDecoder().decode(content.value.buffer)) as AISpecConfig;
						this._config = { ...DEFAULT_AISPEC_CONFIG, ...config };
						this._configUri = configUri;
						this.logService.info(`[AISpecService]: Loaded config from ${configUri.toString()}`);
						return;
					}
				} catch (error) {
					this.logService.trace(`[AISpecService]: Error loading ${configUri.toString()}: ${String(error)}`);
				}
			}
		}

		this.logService.trace('[AISpecService]: No config file found, using defaults');
	}

	private async getDefaultConfigUri(): Promise<URI | undefined> {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			return undefined;
		}
		return URI.joinPath(folders[0].uri, '.aispec');
	}

	private matchGlob(filePath: string, pattern: string): boolean {
		// 简单的 glob 匹配（生产环境应使用 minimatch）
		if (pattern === '**/*' || pattern === '*') {
			return true;
		}

		// 扩展名匹配
		if (pattern.startsWith('**/*.')) {
			const ext = pattern.slice(4); // 去掉 "**/*"
			return filePath.endsWith(ext);
		}

		// 简单包含匹配
		if (pattern.includes('*')) {
			const regex = new RegExp(pattern.replace(/\*/g, '.*'));
			return regex.test(filePath);
		}

		return filePath.includes(pattern);
	}
}

registerSingleton(IAISpecService, AISpecService, InstantiationType.Delayed);
