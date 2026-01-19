/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAICoreContextBuilder } from './aiCoreContextBuilder.js';
import { IAISpecService } from './specService.js';
import type { AICoreContext, AICoreEdits, AICoreEditResult, AICoreRequest, AICoreResponse, AICoreToolPlan, AICoreToolResult } from './aiCoreTypes.js';

export const IAICoreService = createDecorator<IAICoreService>('IAICoreService');

export interface IAICoreService {
	readonly _serviceBrand: undefined;

	sendRequest(req: AICoreRequest): Promise<AICoreResponse>;
	buildContext(req: AICoreRequest): Promise<AICoreContext>;
	runTools(plan: AICoreToolPlan): Promise<AICoreToolResult>;
	applyEdits(edits: AICoreEdits): Promise<AICoreEditResult>;

	/** 获取注入的 System Prompt 前缀（来自 .aispec 规则） */
	getSystemPromptPrefix(filePath?: string): string;
}

export class AICoreService implements IAICoreService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IAICoreContextBuilder private readonly contextBuilder: IAICoreContextBuilder,
		@IAISpecService private readonly specService: IAISpecService
	) { }

	async sendRequest(req: AICoreRequest): Promise<AICoreResponse> {
		this.logService.trace(`[AICoreService]: sendRequest session=${req.sessionId} mode=${req.mode ?? 'chat'}`);

		// 1. 构建上下文
		const context = await this.buildContext(req);
		const recentCount = context.recentFiles?.length ?? 0;
		const symbolCount = context.symbols?.length ?? 0;

		// 2. 获取当前文件路径
		const activeFile = context.files.find(f => f.isActive);
		const filePath = activeFile?.uri;

		// 3. 获取 Spec 规则前缀
		const specPrefix = this.getSystemPromptPrefix(filePath);
		const rulesCount = this.specService.getConfig().rules.filter(r => r.enabled !== false).length;

		this.logService.info(`[AICoreService]: Request prepared - files=${context.files.length} recent=${recentCount} symbols=${symbolCount} rules=${rulesCount}`);

		if (specPrefix) {
			this.logService.trace(`[AICoreService]: System prompt prefix injected (${specPrefix.length} chars)`);
		}

		return {
			content: '',
			meta: {
				source: 'noop',
				specRulesApplied: rulesCount
			}
		};
	}

	async buildContext(_req: AICoreRequest): Promise<AICoreContext> {
		try {
			return await this.contextBuilder.buildContext(_req);
		} catch (error) {
			this.logService.trace(`[AICoreService]: buildContext failed: ${String(error)}`);
			return { files: [] };
		}
	}

	getSystemPromptPrefix(filePath?: string): string {
		return this.specService.getSystemPromptPrefix(filePath);
	}

	async runTools(plan: AICoreToolPlan): Promise<AICoreToolResult> {
		return {
			results: plan.steps.map(step => ({ id: step.id, output: undefined }))
		};
	}

	async applyEdits(_edits: AICoreEdits): Promise<AICoreEditResult> {
		return { applied: false };
	}
}

registerSingleton(IAICoreService, AICoreService, InstantiationType.Delayed);
