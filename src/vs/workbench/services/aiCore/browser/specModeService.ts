/*---------------------------------------------------------------------------------------------
 *  AI Core Spec Mode Service
 *  实现 Spec 模式的规范驱动开发工作流
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import {
	SpecSession,
	SpecPhase,
	UserStory,
	TechnicalDesign,
	SpecTask,
	SPEC_SYSTEM_PROMPT
} from '../common/chatModeTypes.js';

// ============================================================================
// P0.1 - 增强 JSON 解析容错
// ============================================================================

/**
 * 安全解析 JSON，支持从 LLM 响应中提取和修复 JSON
 * @param text LLM 返回的文本
 * @returns 解析后的对象，解析失败返回 null
 */
function safeParseJSON<T = unknown>(text: string): T | null {
	if (!text || typeof text !== 'string') {
		return null;
	}

	// 1. 尝试直接解析
	try {
		return JSON.parse(text) as T;
	} catch {
		// 继续尝试其他方法
	}

	// 2. 尝试提取 JSON 对象
	const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
	if (jsonObjectMatch) {
		try {
			return JSON.parse(jsonObjectMatch[0]) as T;
		} catch {
			// 继续尝试修复
		}
	}

	// 3. 尝试提取 JSON 数组
	const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
	if (jsonArrayMatch) {
		try {
			return JSON.parse(jsonArrayMatch[0]) as T;
		} catch {
			// 继续尝试修复
		}
	}

	// 4. 尝试修复常见的 JSON 格式问题
	let fixedText = text;
	const extracted = jsonObjectMatch?.[0] || jsonArrayMatch?.[0] || text;

	// 修复尾部逗号
	fixedText = extracted.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
	// 修复单引号改双引号
	fixedText = fixedText.replace(/'/g, '"');
	// 修复未转义的换行符
	fixedText = fixedText.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
	// 修复键名没有引号的情况
	fixedText = fixedText.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

	try {
		return JSON.parse(fixedText) as T;
	} catch {
		// 继续尝试
	}

	// 5. 最后尝试：从 markdown 代码块中提取
	const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		try {
			return JSON.parse(codeBlockMatch[1].trim()) as T;
		} catch {
			// 放弃
		}
	}

	return null;
}

// ============================================================================
// P0.3 - 友好化错误信息映射
// ============================================================================

const ERROR_MESSAGE_MAP: Record<string, string> = {
	'SyntaxError': '数据格式解析失败，正在重试...',
	'JSON': '响应格式异常，正在重试...',
	'network': '网络连接失败，请检查网络设置',
	'Failed to fetch': '无法连接到服务器，请检查网络',
	'timeout': '请求超时，正在重试...',
	'abort': '请求被取消',
	'401': '认证失败，请检查 API 密钥',
	'403': '访问被拒绝，请检查权限',
	'429': '请求过于频繁，请稍后重试',
	'500': '服务器内部错误，请稍后重试',
	'502': '网关错误，请稍后重试',
	'503': '服务暂时不可用，请稍后重试'
};

/**
 * 将技术错误转换为用户友好的错误信息
 * @param error 原始错误
 * @returns 用户友好的错误信息
 */
function toFriendlyErrorMessage(error: unknown): string {
	const errorStr = String(error);

	// 遍历错误映射表查找匹配
	for (const [key, friendlyMessage] of Object.entries(ERROR_MESSAGE_MAP)) {
		if (errorStr.includes(key)) {
			return friendlyMessage;
		}
	}

	// 默认友好消息
	return '任务执行遇到问题，请稍后重试';
}

// ============================================================================
// P0.2 - 任务失败自动重试机制
// ============================================================================

interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
	onRetry?: (attempt: number, error: Error) => void;
}

/**
 * 带有指数退避的重试机制
 */
async function executeWithRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {}
): Promise<T> {
	const { maxRetries = 3, baseDelayMs = 1000, onRetry } = options;
	let lastError: Error = new Error('Unknown error');

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt < maxRetries) {
				const delayMs = baseDelayMs * Math.pow(2, attempt);
				if (onRetry) {
					onRetry(attempt + 1, lastError);
				}
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		}
	}

	throw lastError;
}

export const ISpecModeService = createDecorator<ISpecModeService>('ISpecModeService');

/**
 * 未完成的 Spec 信息（用于 AI 上下文注入）
 */
export interface PendingSpecInfo {
	id: string;
	title: string;
	description: string;
	phase: string;
	folderPath: string;
	progress: {
		tasksTotal: number;
		tasksCompleted: number;
		tasksInProgress: number;
	};
	createdAt: string;
	updatedAt: string;
}

export interface ISpecModeService {
	readonly _serviceBrand: undefined;

	readonly onDidUpdateSession: Event<SpecSession>;
	readonly onDidChangePhase: Event<SpecPhase>;

	// 会话管理
	createSession(requirement: string): SpecSession;
	getCurrentSession(): SpecSession | undefined;
	clearSession(): void;

	// 阶段流转
	getCurrentPhase(): SpecPhase;
	advanceToNextPhase(): void;

	// 用户故事
	generateUserStories(requirement: string): Promise<UserStory[]>;
	approveStory(storyId: string): void;
	approveAllStories(): void;

	// 技术设计
	generateTechnicalDesign(stories: UserStory[]): Promise<TechnicalDesign>;
	approveDesign(): void;

	// 任务管理
	generateTasks(stories: UserStory[], design: TechnicalDesign): Promise<SpecTask[]>;
	startTask(taskId: string): void;
	completeTask(taskId: string): void;
	getNextTask(): SpecTask | undefined;

	// 获取当前上下文用于 prompt
	getContextForPrompt(): string;

	// 获取系统提示词
	getSystemPrompt(): string;

	// 文件操作 (Kiro 风格)
	getSpecsFolder(): URI | undefined;
	saveRequirementsFile(): Promise<void>;
	saveDesignFile(): Promise<void>;
	saveTasksFile(): Promise<void>;
	loadSpecFromFolder(folder: URI): Promise<boolean>;

	// LLM 驱动的任务执行
	executeTaskWithLLM(task: SpecTask): Promise<{ success: boolean; result: string }>;

	// 自动检测已完成任务 (Kiro 风格)
	scanCompletedTasks(): Promise<number>;

	// 扫描 .specs 目录中的未完成任务（AI 回答前自动调用）
	scanPendingSpecs(): Promise<PendingSpecInfo[]>;

	// Vibe → Spec 转换
	createSpecFromVibeContext(context: string): Promise<void>;

	// P0.4 - 会话状态持久化
	saveSessionState(): Promise<void>;
	loadSessionState(): Promise<boolean>;
}

// ============================================================================
// Spec 文件模板 (EARS 记号法)
// ============================================================================

// ============================================================================
// EARS (Easy Approach to Requirements Syntax) 格式模板
// ============================================================================

const REQUIREMENTS_TEMPLATE = `# Requirements Specification

## Overview
{overview}

## EARS Notation Guide
> This document uses EARS (Easy Approach to Requirements Syntax) notation:
> - **Given** [precondition] - The initial state of the system
> - **When** [trigger] - The action performed by the user
> - **Then** [expected outcome] - The system's expected response

---

## User Stories

{stories}

---
*Generated by AI Core Spec Mode using EARS notation*
`;

const DESIGN_TEMPLATE = `# Technical Design Document

## Overview
{overview}

## Architecture
{architecture}

## Sequence Diagram

\`\`\`mermaid
sequenceDiagram
{sequenceDiagram}
\`\`\`

## Components
{components}

## Data Flow
{dataFlow}

## API Design
{apiDesign}

## Testing Strategy
{testingStrategy}

---
*Generated by AI Core Spec Mode*
`;

const TASKS_TEMPLATE = `# Implementation Tasks

## Progress Dashboard
| Status | Count |
|--------|-------|
| ✅ Completed | {completed} |
| 🔄 In Progress | {inProgress} |
| ⏳ Pending | {pending} |
| **Total** | **{total}** |

## Progress Bar
\`\`\`
[{progressBar}] {progressPercent}%
\`\`\`

---

## Task List

{tasks}

---
*Generated by AI Core Spec Mode*
`;


// ============================================================================
// Spec Mode Service Implementation
// ============================================================================

export class SpecModeService extends Disposable implements ISpecModeService {
	readonly _serviceBrand: undefined;

	private _currentSession: SpecSession | undefined;
	private _specsFolder: URI | undefined;

	private readonly _onDidUpdateSession = this._register(new Emitter<SpecSession>());
	readonly onDidUpdateSession = this._onDidUpdateSession.event;

	private readonly _onDidChangePhase = this._register(new Emitter<SpecPhase>());
	readonly onDidChangePhase = this._onDidChangePhase.event;

	// LLM 配置
	private readonly API_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.initSpecsFolder();
		// P0.4 - 启动时尝试恢复会话状态
		this.loadSessionState().catch(err => {
			this.logService.warn(`[SpecModeService] Failed to restore session: ${String(err)}`);
		});
	}

	private getApiKey(): string {
		const configKey = this.configurationService.getValue<string>('aiCore.glmApiKey');
		const configEndpointKey = this.configurationService.getValue<string>('aiCore.zhipuApiKey');
		return configKey || configEndpointKey || '20cca2b90c8c4348aaab3d4f6814c33b.Ow4WJfqfc06uB4KI';
	}

	private initSpecsFolder(): void {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length > 0) {
			this._specsFolder = URI.joinPath(folders[0].uri, '.specs');
		}
	}

	getSpecsFolder(): URI | undefined {
		return this._specsFolder;
	}

	createSession(requirement: string): SpecSession {
		// 从需求中提取简短标题作为目录名（更易读）
		const shortTitle = this.extractShortTitle(requirement);
		const timestamp = Date.now();
		const session: SpecSession = {
			id: `${shortTitle}-${timestamp}`,
			originalRequirement: requirement,
			userStories: [],
			tasks: [],
			phase: 'requirement_gathering',
			createdAt: new Date(),
			updatedAt: new Date()
		};

		this._currentSession = session;
		this.logService.info(`[SpecModeService] Created new session: ${session.id}`);
		this._onDidUpdateSession.fire(session);

		// 立即保存 manifest.json（用户打开就能看到是什么需求）
		this.saveManifest(session);

		return session;
	}

	/**
	 * 从需求文本中提取简短标题（用于目录命名）
	 * 例如："帮我开发一个亲属辨认的app" → "亲属辨认app"
	 */
	private extractShortTitle(requirement: string): string {
		// 移除常见的前缀词
		let title = requirement
			.replace(/^(帮我|请|我想|我需要|开发|创建|实现|做一个?|搞一个?)/g, '')
			.replace(/^(help me|please|I want to|I need to|develop|create|implement|build|make)/gi, '')
			.trim();

		// 提取核心关键词（取前 20 个字符，在词边界截断）
		if (title.length > 20) {
			// 尝试在合适的位置截断
			const cutPos = title.substring(0, 25).search(/[,，。.!！?\s]/);
			if (cutPos > 5) {
				title = title.substring(0, cutPos);
			} else {
				title = title.substring(0, 20);
			}
		}

		// 清理特殊字符，保留中文、英文、数字
		title = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

		// 如果提取失败，使用默认名
		if (!title || title.length < 2) {
			title = 'spec';
		}

		return title;
	}

	/**
	 * 保存 manifest.json（需求元数据，便于用户识别）
	 */
	private async saveManifest(session: SpecSession): Promise<void> {
		if (!this._specsFolder) {
			return;
		}

		const specFolder = URI.joinPath(this._specsFolder, session.id);
		const manifest = {
			id: session.id,
			title: session.originalRequirement.substring(0, 100),
			description: session.originalRequirement,
			phase: session.phase,
			progress: {
				stories: {
					total: session.userStories.length,
					approved: session.userStories.filter(s => s.status === 'approved').length
				},
				tasks: {
					total: session.tasks.length,
					completed: session.tasks.filter(t => t.status === 'completed').length,
					inProgress: session.tasks.filter(t => t.status === 'in_progress').length
				}
			},
			createdAt: session.createdAt.toISOString(),
			updatedAt: new Date().toISOString()
		};

		try {
			const manifestUri = URI.joinPath(specFolder, 'manifest.json');
			await this.fileService.writeFile(manifestUri, VSBuffer.fromString(JSON.stringify(manifest, null, 2)));
			this.logService.info(`[SpecModeService] Saved manifest to ${manifestUri.fsPath}`);
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to save manifest: ${String(error)}`);
		}
	}

	getCurrentSession(): SpecSession | undefined {
		return this._currentSession;
	}

	clearSession(): void {
		this._currentSession = undefined;
		this.logService.info('[SpecModeService] Session cleared');
	}

	getCurrentPhase(): SpecPhase {
		return this._currentSession?.phase || 'requirement_gathering';
	}

	advanceToNextPhase(): void {
		if (!this._currentSession) {
			return;
		}

		const phaseOrder: SpecPhase[] = [
			'requirement_gathering',
			'story_generation',
			'story_review',
			'design_generation',
			'design_review',
			'task_generation',
			'task_execution',
			'completed'
		];

		const currentIndex = phaseOrder.indexOf(this._currentSession.phase);
		if (currentIndex < phaseOrder.length - 1) {
			this._currentSession.phase = phaseOrder[currentIndex + 1];
			this._currentSession.updatedAt = new Date();
			this.logService.info(`[SpecModeService] Advanced to phase: ${this._currentSession.phase}`);
			this._onDidChangePhase.fire(this._currentSession.phase);
			this._onDidUpdateSession.fire(this._currentSession);
		}
	}

	async generateUserStories(requirement: string): Promise<UserStory[]> {
		this.logService.info('[SpecModeService] Generating user stories via LLM with EARS notation...');

		const prompt = `请根据以下需求，生成结构化的用户故事，使用 EARS (Easy Approach to Requirements Syntax) 记号法。

## 需求
${requirement}

## EARS 记号法说明
EARS 是一种结构化的需求编写方法，每个验收标准使用以下格式：
- **Given** [前置条件] - 描述系统的初始状态
- **When** [触发条件] - 描述用户执行的操作
- **Then** [预期行为] - 描述系统的预期响应

## 输出格式
请以 JSON 数组格式输出用户故事，每个故事包含：
- title: 故事标题（简短明确）
- description: 描述（使用 "作为[角色]，我希望[功能]，以便[价值]" 格式）
- acceptanceCriteria: 验收标准数组，每条使用 EARS 格式
- priority: 优先级（"high", "medium", 或 "low"）

## 示例输出
\`\`\`json
[
  {
    "title": "用户登录",
    "description": "作为注册用户，我希望能够使用邮箱和密码登录系统，以便访问我的个人数据和功能",
    "acceptanceCriteria": [
      "Given 用户在登录页面 When 输入正确的邮箱和密码并点击登录 Then 系统跳转到主页并显示欢迎信息",
      "Given 用户在登录页面 When 输入错误的密码并点击登录 Then 系统显示'密码错误'提示且保留邮箱输入",
      "Given 用户已登录 When 关闭浏览器后重新打开 Then 如果选择了'记住我'则保持登录状态",
      "Given 用户连续输错密码3次 When 再次尝试登录 Then 系统锁定账户15分钟并显示提示"
    ],
    "priority": "high"
  }
]
\`\`\`

请直接输出 JSON，确保每个验收标准都使用 Given/When/Then 格式。`;

		try {
			const response = await this.callLLM(prompt);
			const stories = this.parseUserStoriesFromLLM(response);

			if (this._currentSession) {
				this._currentSession.userStories = stories;
				this._currentSession.phase = 'story_review';
				this._currentSession.updatedAt = new Date();
				await this.saveRequirementsFile();
				this._onDidUpdateSession.fire(this._currentSession);
			}

			this.logService.info(`[SpecModeService] Generated ${stories.length} user stories`);
			return stories;
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to generate stories: ${String(error)}`);
			// 返回一个默认故事
			return [{
				id: `story-${Date.now()}-1`,
				title: '核心功能',
				description: requirement,
				acceptanceCriteria: ['功能正常工作', '错误处理完善', '有测试覆盖'],
				priority: 'high',
				status: 'draft'
			}];
		}
	}

	private parseUserStoriesFromLLM(response: string): UserStory[] {
		// P0.1 - 使用增强的 JSON 解析
		const parsed = safeParseJSON<Array<{
			title: string;
			description: string;
			acceptanceCriteria: string[];
			priority: 'high' | 'medium' | 'low';
		}>>(response);

		if (!parsed || !Array.isArray(parsed)) {
			this.logService.error(`[SpecModeService] Failed to parse user stories from response`);
			return [];
		}

		return parsed.map((item, index) => ({
			id: `story-${Date.now()}-${index + 1}`,
			title: item.title || `故事 ${index + 1}`,
			description: item.description || '',
			acceptanceCriteria: item.acceptanceCriteria || [],
			priority: item.priority || 'medium',
			status: 'draft' as const
		}));
	}

	approveStory(storyId: string): void {
		if (!this._currentSession) {
			return;
		}

		const story = this._currentSession.userStories.find(s => s.id === storyId);
		if (story) {
			story.status = 'approved';
			this._currentSession.updatedAt = new Date();
			this._onDidUpdateSession.fire(this._currentSession);
		}
	}

	approveAllStories(): void {
		if (!this._currentSession) {
			return;
		}

		for (const story of this._currentSession.userStories) {
			story.status = 'approved';
		}
		this._currentSession.updatedAt = new Date();
		this._onDidUpdateSession.fire(this._currentSession);
		// P0.4 - 自动保存会话状态
		this.saveSessionState().catch(() => { /* 静默失败 */ });
	}

	async generateTechnicalDesign(stories: UserStory[]): Promise<TechnicalDesign> {
		this.logService.info('[SpecModeService] Generating technical design with sequence diagram via LLM...');

		// 构建用户故事摘要，包含验收标准
		const storiesSummary = stories.map(s => {
			const criteria = s.acceptanceCriteria.slice(0, 2).join('\n    - ');
			return `- **${s.title}**: ${s.description}\n    - ${criteria}`;
		}).join('\n');

		const prompt = `请根据以下用户故事，生成完整的技术设计文档，包含 Mermaid 序列图。

## 用户故事
${storiesSummary}

## 输出格式
请以 JSON 格式输出技术设计，包含：
- overview: 技术方案概述（2-3段，详细描述）
- architecture: 架构说明（描述整体架构模式、技术栈选择）
- sequenceDiagram: Mermaid 序列图代码（描述主要交互流程，不包含 \`\`\`mermaid 标记）
- components: 组件数组，每个组件包含 name, responsibility, interfaces, dependencies
- dataFlow: 数据流描述
- apiDesign: API 设计说明（如适用）
- testingStrategy: 测试策略

## Mermaid 序列图示例
sequenceDiagram 字段应该只包含图内容，例如：
"sequenceDiagram": "    participant U as User\\n    participant C as Client\\n    participant S as Server\\n    participant D as Database\\n    U->>C: 输入登录信息\\n    C->>S: POST /api/login\\n    S->>D: 查询用户\\n    D-->>S: 返回用户数据\\n    S-->>C: 返回 JWT Token\\n    C-->>U: 显示登录成功"

## 完整示例输出
\`\`\`json
{
  "overview": "本系统采用前后端分离的微服务架构。前端使用 React + TypeScript 构建响应式 UI，后端采用 Node.js + Express 提供 RESTful API。数据持久化使用 PostgreSQL，缓存层使用 Redis 提升性能。",
  "architecture": "采用分层架构：表示层（React）→ API 网关 → 业务服务层 → 数据访问层 → 数据库。服务间通过 REST API 通信，使用 JWT 进行身份验证。",
  "sequenceDiagram": "    participant U as User\\n    participant F as Frontend\\n    participant A as API Gateway\\n    participant S as Service\\n    participant D as Database\\n    U->>F: 用户操作\\n    F->>A: HTTP Request\\n    A->>S: 调用服务\\n    S->>D: 数据操作\\n    D-->>S: 返回结果\\n    S-->>A: 业务响应\\n    A-->>F: HTTP Response\\n    F-->>U: 更新界面",
  "components": [
    {
      "name": "AuthService",
      "responsibility": "处理用户认证、授权和会话管理",
      "interfaces": ["IAuthService"],
      "dependencies": ["UserRepository", "TokenService", "CacheService"]
    },
    {
      "name": "UserService",
      "responsibility": "用户信息的 CRUD 操作和业务逻辑",
      "interfaces": ["IUserService"],
      "dependencies": ["UserRepository", "AuthService"]
    }
  ],
  "dataFlow": "用户请求 → 前端校验 → API Gateway → 认证中间件 → 业务服务 → 数据仓库 → 数据库",
  "apiDesign": "RESTful API 设计：\\n- POST /api/auth/login - 用户登录\\n- POST /api/auth/register - 用户注册\\n- GET /api/users/:id - 获取用户信息",
  "testingStrategy": "三层测试策略：\\n1. 单元测试：Jest 覆盖核心业务逻辑（目标 80%+）\\n2. 集成测试：Supertest 测试 API 端点\\n3. E2E 测试：Cypress 测试关键用户流程"
}
\`\`\`

请直接输出 JSON，确保 sequenceDiagram 字段包含有效的 Mermaid 序列图语法。`;

		try {
			const response = await this.callLLM(prompt);
			const design = this.parseTechnicalDesignFromLLM(response);

			if (this._currentSession) {
				this._currentSession.technicalDesign = design;
				this._currentSession.phase = 'design_review';
				this._currentSession.updatedAt = new Date();
				await this.saveDesignFile();
				this._onDidUpdateSession.fire(this._currentSession);
			}

			this.logService.info(`[SpecModeService] Generated technical design with ${design.components.length} components`);
			return design;
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to generate design: ${String(error)}`);
			// 返回默认设计
			return {
				overview: '技术设计待完善',
				architecture: '待定义',
				components: stories.map((s, i) => ({
					name: `Component${i + 1}`,
					responsibility: s.title
				}))
			};
		}
	}

	private parseTechnicalDesignFromLLM(response: string): TechnicalDesign {
		// P0.1 - 使用增强的 JSON 解析
		const parsed = safeParseJSON<{
			overview?: string;
			architecture?: string;
			sequenceDiagram?: string;
			components?: Array<{
				name: string;
				responsibility: string;
				interfaces?: string[];
				dependencies?: string[];
			}>;
			dataFlow?: string;
			apiDesign?: string;
			testingStrategy?: string;
		}>(response);

		if (!parsed) {
			this.logService.error(`[SpecModeService] Failed to parse technical design from response`);
			return {
				overview: '解析失败，请重试',
				architecture: '',
				components: []
			};
		}

		// 处理序列图：将 \\n 转换为实际换行
		let sequenceDiagram = parsed.sequenceDiagram || '';
		if (sequenceDiagram) {
			sequenceDiagram = sequenceDiagram.replace(/\\n/g, '\n');
		}

		return {
			overview: parsed.overview || '',
			architecture: parsed.architecture || '',
			sequenceDiagram,
			components: (parsed.components || []).map(c => ({
				name: c.name,
				responsibility: c.responsibility,
				interfaces: c.interfaces,
				dependencies: c.dependencies
			})),
			dataFlow: parsed.dataFlow,
			apiDesign: parsed.apiDesign,
			testingStrategy: parsed.testingStrategy
		};
	}

	approveDesign(): void {
		if (!this._currentSession) {
			return;
		}
		this._currentSession.phase = 'task_generation';
		this._currentSession.updatedAt = new Date();
		this._onDidChangePhase.fire(this._currentSession.phase);
		this._onDidUpdateSession.fire(this._currentSession);
		// P0.4 - 自动保存会话状态
		this.saveSessionState().catch(() => { /* 静默失败 */ });
	}

	async generateTasks(stories: UserStory[], design: TechnicalDesign): Promise<SpecTask[]> {
		this.logService.info('[SpecModeService] Generating tasks via LLM...');

		// 构建上下文
		const storiesSummary = stories.map(s => `- ${s.title}`).join('\n');
		const componentsSummary = design.components.map(c => `- ${c.name}: ${c.responsibility}`).join('\n');

		const prompt = `请根据以下用户故事和技术设计，生成详细的任务列表。

## 用户故事
${storiesSummary}

## 技术组件
${componentsSummary}

## 输出格式
请以 JSON 数组格式输出任务，每个任务包含：
- title: 任务标题（具体、可执行）
- description: 任务描述（包含具体要做什么）
- storyIndex: 关联的用户故事索引（从0开始）
- type: 任务类型（"implementation", "test", "documentation", 或 "review"）
- estimatedEffort: 预估工作量（如 "30分钟", "2小时"）

## 示例输出
\`\`\`json
[
  {
    "title": "创建 UserService 类",
    "description": "实现用户服务的基础结构，包含登录、注册方法的接口定义",
    "storyIndex": 0,
    "type": "implementation",
    "estimatedEffort": "1小时"
  },
  {
    "title": "实现登录逻辑",
    "description": "在 UserService 中实现用户登录的具体逻辑，包含密码验证",
    "storyIndex": 0,
    "type": "implementation",
    "estimatedEffort": "2小时"
  },
  {
    "title": "编写 UserService 单元测试",
    "description": "为 UserService 的登录、注册方法编写单元测试",
    "storyIndex": 0,
    "type": "test",
    "estimatedEffort": "1小时"
  }
]
\`\`\`

请生成完整的任务列表，确保每个用户故事都有对应的实现和测试任务。直接输出 JSON。`;

		try {
			const response = await this.callLLM(prompt);
			const tasks = this.parseTasksFromLLM(response, stories);

			if (this._currentSession) {
				this._currentSession.tasks = tasks;
				this._currentSession.phase = 'task_execution';
				this._currentSession.updatedAt = new Date();
				await this.saveTasksFile();
				this._onDidChangePhase.fire(this._currentSession.phase);
				this._onDidUpdateSession.fire(this._currentSession);
			}

			this.logService.info(`[SpecModeService] Generated ${tasks.length} tasks`);
			return tasks;
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to generate tasks: ${String(error)}`);
			// 返回默认任务
			return this.generateDefaultTasks(stories);
		}
	}

	private parseTasksFromLLM(response: string, stories: UserStory[]): SpecTask[] {
		// P0.1 - 使用增强的 JSON 解析
		const parsed = safeParseJSON<Array<{
			title: string;
			description: string;
			storyIndex?: number;
			type?: 'implementation' | 'test' | 'documentation' | 'review';
			estimatedEffort?: string;
		}>>(response);

		if (!parsed || !Array.isArray(parsed)) {
			this.logService.error(`[SpecModeService] Failed to parse tasks from response`);
			return this.generateDefaultTasks(stories);
		}

		return parsed.map((item, index) => ({
			id: `task-${Date.now()}-${index}`,
			title: item.title,
			description: item.description,
			storyId: stories[item.storyIndex ?? 0]?.id || stories[0]?.id || 'unknown',
			type: item.type || 'implementation',
			status: 'pending' as const,
			estimatedEffort: item.estimatedEffort,
			order: index
		}));
	}

	private generateDefaultTasks(stories: UserStory[]): SpecTask[] {
		const tasks: SpecTask[] = [];
		let order = 0;

		for (const story of stories) {
			tasks.push({
				id: `task-${Date.now()}-impl-${order}`,
				title: `实现: ${story.title}`,
				description: story.description,
				storyId: story.id,
				type: 'implementation',
				status: 'pending',
				order: order++
			});
			tasks.push({
				id: `task-${Date.now()}-test-${order}`,
				title: `测试: ${story.title}`,
				description: `编写 ${story.title} 的单元测试`,
				storyId: story.id,
				type: 'test',
				status: 'pending',
				order: order++
			});
		}

		return tasks;
	}

	startTask(taskId: string): void {
		if (!this._currentSession) {
			return;
		}

		const task = this._currentSession.tasks.find(t => t.id === taskId);
		if (task) {
			task.status = 'in_progress';
			this._currentSession.updatedAt = new Date();
			this._onDidUpdateSession.fire(this._currentSession);
		}
	}

	completeTask(taskId: string): void {
		if (!this._currentSession) {
			return;
		}

		const task = this._currentSession.tasks.find(t => t.id === taskId);
		if (task) {
			task.status = 'completed';
			this._currentSession.updatedAt = new Date();

			// 检查是否所有任务完成
			const allCompleted = this._currentSession.tasks.every(t => t.status === 'completed');
			if (allCompleted) {
				this._currentSession.phase = 'completed';
				this._onDidChangePhase.fire(this._currentSession.phase);
			}

			this._onDidUpdateSession.fire(this._currentSession);
			// P0.4 - 自动保存会话状态
			this.saveSessionState().catch(() => { /* 静默失败 */ });
		}
	}

	getNextTask(): SpecTask | undefined {
		if (!this._currentSession) {
			return undefined;
		}

		return this._currentSession.tasks
			.filter(t => t.status === 'pending')
			.sort((a, b) => a.order - b.order)[0];
	}

	getContextForPrompt(): string {
		if (!this._currentSession) {
			return '';
		}

		const session = this._currentSession;
		let context = `\n## 当前 Spec 会话状态\n\n`;
		context += `**原始需求**: ${session.originalRequirement}\n\n`;
		context += `**当前阶段**: ${this.getPhaseDisplayName(session.phase)}\n\n`;

		if (session.userStories.length > 0) {
			context += `### 用户故事\n`;
			for (const story of session.userStories) {
				context += `- [${story.status === 'approved' ? '✅' : '⏳'}] ${story.title}\n`;
			}
			context += '\n';
		}

		if (session.tasks.length > 0) {
			const completed = session.tasks.filter(t => t.status === 'completed').length;
			const total = session.tasks.length;
			context += `### 任务进度: ${completed}/${total}\n`;
			for (const task of session.tasks) {
				const icon = task.status === 'completed' ? '✅' :
					task.status === 'in_progress' ? '🔄' : '⏳';
				context += `- [${icon}] ${task.title}\n`;
			}
		}

		return context;
	}

	getSystemPrompt(): string {
		let prompt = SPEC_SYSTEM_PROMPT;

		if (this._currentSession) {
			prompt += this.getContextForPrompt();
			prompt += this.getPhaseInstructions(this._currentSession.phase);
		}

		return prompt;
	}

	private getPhaseDisplayName(phase: SpecPhase): string {
		const names: Record<SpecPhase, string> = {
			'requirement_gathering': '📋 需求收集',
			'story_generation': '📝 生成用户故事',
			'story_review': '👀 审核用户故事',
			'design_generation': '🏗️ 生成技术设计',
			'design_review': '👀 审核技术设计',
			'task_generation': '📋 生成任务列表',
			'task_execution': '⚡ 执行任务',
			'completed': '✅ 已完成'
		};
		return names[phase];
	}

	private getPhaseInstructions(phase: SpecPhase): string {
		const instructions: Record<SpecPhase, string> = {
			'requirement_gathering': `
## 当前任务：需求收集
请帮助用户澄清和完善需求：
1. 理解用户的核心目标
2. 询问关键细节（如果需要）
3. 确认范围和约束条件
4. 准备好后，输出需求摘要并询问是否可以开始生成用户故事`,

			'story_generation': `
## 当前任务：生成用户故事
请将需求拆解为用户故事，每个故事包含：
- 标题
- 描述（As a... I want... So that...）
- 验收标准（至少3条）
- 优先级（高/中/低）`,

			'story_review': `
## 当前任务：审核用户故事
用户正在审核生成的用户故事。
- 等待用户确认或提出修改意见
- 如果用户满意，准备进入技术设计阶段`,

			'design_generation': `
## 当前任务：生成技术设计
请根据已批准的用户故事生成技术设计：
- 架构概述
- 组件设计
- 数据流（如适用）
- 测试策略`,

			'design_review': `
## 当前任务：审核技术设计
用户正在审核技术设计文档。
- 等待用户确认或提出修改意见
- 如果用户满意，准备生成任务列表`,

			'task_generation': `
## 当前任务：生成任务列表
请将用户故事和技术设计转化为可执行的任务：
- 每个任务应该小而具体
- 包含实现、测试、文档任务
- 按优先级和依赖关系排序`,

			'task_execution': `
## 当前任务：执行任务
正在执行任务列表。对于每个任务：
1. 显示当前任务内容
2. 执行实现或测试
3. 显示结果
4. 等待用户确认后继续下一个任务`,

			'completed': `
## 🎉 所有任务已完成！
请总结完成的工作，并询问用户是否还有其他需求。`
		};

		return instructions[phase];
	}

	// ========================================================================
	// 文件操作 - Kiro 风格的 .specs 文件夹
	// ========================================================================

	async saveRequirementsFile(): Promise<void> {
		if (!this._currentSession || !this._specsFolder) {
			return;
		}

		const session = this._currentSession;
		const specFolder = URI.joinPath(this._specsFolder, session.id);

		// 生成用户故事内容 (EARS 格式)
		let storiesContent = '';
		let storyIndex = 1;
		for (const story of session.userStories) {
			const priorityBadge = story.priority === 'high' ? '🔴 HIGH' :
				story.priority === 'medium' ? '🟡 MEDIUM' : '🟢 LOW';
			const statusBadge = story.status === 'approved' ? '✅' :
				story.status === 'completed' ? '🎉' : '📝';

			storiesContent += `### US-${String(storyIndex).padStart(3, '0')}: ${story.title} ${statusBadge}\n\n`;
			storiesContent += `| 属性 | 值 |\n|------|----|\n`;
			storiesContent += `| **优先级** | ${priorityBadge} |\n`;
			storiesContent += `| **状态** | ${story.status} |\n\n`;
			storiesContent += `#### 描述\n\n`;
			storiesContent += `> ${story.description}\n\n`;
			storiesContent += `#### 验收标准 (EARS Notation)\n\n`;

			// 格式化 EARS 验收标准
			for (let i = 0; i < story.acceptanceCriteria.length; i++) {
				const criteria = story.acceptanceCriteria[i];
				const checkbox = story.status === 'completed' ? '[x]' : '[ ]';

				// 解析并格式化 EARS 格式
				const formatted = this.formatEARSCriteria(criteria);
				storiesContent += `${checkbox} **AC-${i + 1}**: ${formatted}\n\n`;
			}

			storiesContent += '---\n\n';
			storyIndex++;
		}

		const content = REQUIREMENTS_TEMPLATE
			.replace('{overview}', session.originalRequirement)
			.replace('{stories}', storiesContent);

		const fileUri = URI.joinPath(specFolder, 'requirements.md');

		try {
			await this.fileService.writeFile(fileUri, VSBuffer.fromString(content));
			this.logService.info(`[SpecModeService] Saved requirements to ${fileUri.fsPath}`);
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to save requirements: ${String(error)}`);
		}
	}

	/**
	 * 格式化 EARS 验收标准
	 */
	private formatEARSCriteria(criteria: string): string {
		// 检查是否已经是 EARS 格式
		const hasGiven = /\bGiven\b/i.test(criteria);
		const hasWhen = /\bWhen\b/i.test(criteria);
		const hasThen = /\bThen\b/i.test(criteria);

		if (hasGiven && hasWhen && hasThen) {
			// 使用粗体高亮关键字
			return criteria
				.replace(/\bGiven\b/gi, '**Given**')
				.replace(/\bWhen\b/gi, '**When**')
				.replace(/\bThen\b/gi, '**Then**');
		}

		// 如果不是 EARS 格式，保持原样
		return criteria;
	}

	async saveDesignFile(): Promise<void> {
		if (!this._currentSession || !this._specsFolder || !this._currentSession.technicalDesign) {
			return;
		}

		const session = this._currentSession;
		const design = session.technicalDesign!;
		const specFolder = URI.joinPath(this._specsFolder, session.id);

		// 生成组件内容（表格格式）
		let componentsContent = '| 组件 | 职责 | 接口 | 依赖 |\n|------|------|------|------|\n';
		for (const comp of design.components) {
			const interfaces = comp.interfaces?.join(', ') || '-';
			const dependencies = comp.dependencies?.join(', ') || '-';
			componentsContent += `| **${comp.name}** | ${comp.responsibility} | ${interfaces} | ${dependencies} |\n`;
		}

		// 生成序列图内容
		const sequenceDiagram = design.sequenceDiagram || '    Note over System: 待设计';

		// 生成 API 设计内容
		let apiDesignContent = design.apiDesign || '待定义';
		// 处理换行符
		apiDesignContent = apiDesignContent.replace(/\\n/g, '\n');

		const content = DESIGN_TEMPLATE
			.replace('{overview}', design.overview)
			.replace('{architecture}', design.architecture)
			.replace('{sequenceDiagram}', sequenceDiagram)
			.replace('{components}', componentsContent)
			.replace('{dataFlow}', design.dataFlow || '待定义')
			.replace('{apiDesign}', apiDesignContent)
			.replace('{testingStrategy}', design.testingStrategy || '单元测试 + 集成测试');

		const fileUri = URI.joinPath(specFolder, 'design.md');

		try {
			await this.fileService.writeFile(fileUri, VSBuffer.fromString(content));
			this.logService.info(`[SpecModeService] Saved design to ${fileUri.fsPath}`);
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to save design: ${String(error)}`);
		}
	}

	async saveTasksFile(): Promise<void> {
		if (!this._currentSession || !this._specsFolder) {
			return;
		}

		const session = this._currentSession;
		const specFolder = URI.joinPath(this._specsFolder, session.id);

		const completed = session.tasks.filter(t => t.status === 'completed').length;
		const inProgress = session.tasks.filter(t => t.status === 'in_progress').length;
		const pending = session.tasks.filter(t => t.status === 'pending').length;
		const total = session.tasks.length;

		// 生成进度条
		const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
		const progressBarLength = 20;
		const filledLength = Math.round((progressPercent / 100) * progressBarLength);
		const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

		// 生成任务列表
		let tasksContent = '';
		for (const task of session.tasks) {
			const statusIcon = task.status === 'completed' ? '✅' :
				task.status === 'in_progress' ? '🔄' :
				task.status === 'blocked' ? '🚫' : '⏳';
			const checkbox = task.status === 'completed' ? '[x]' : '[ ]';

			tasksContent += `### ${checkbox} ${task.title} ${statusIcon}\n\n`;
			tasksContent += `| 属性 | 值 |\n|------|----|\n`;
			tasksContent += `| 类型 | ${this.getTaskTypeLabel(task.type)} |\n`;
			tasksContent += `| 状态 | ${this.getStatusLabel(task.status)} |\n`;
			if (task.estimatedEffort) {
				tasksContent += `| 预估 | ${task.estimatedEffort} |\n`;
			}
			tasksContent += `\n**描述**: ${task.description}\n\n`;
			tasksContent += '---\n\n';
		}

		const content = TASKS_TEMPLATE
			.replace('{total}', String(total))
			.replace('{completed}', String(completed))
			.replace('{inProgress}', String(inProgress))
			.replace('{pending}', String(pending))
			.replace('{progressBar}', progressBar)
			.replace('{progressPercent}', String(progressPercent))
			.replace('{tasks}', tasksContent);

		const fileUri = URI.joinPath(specFolder, 'tasks.md');

		try {
			await this.fileService.writeFile(fileUri, VSBuffer.fromString(content));
			this.logService.info(`[SpecModeService] Saved tasks to ${fileUri.fsPath}`);
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to save tasks: ${String(error)}`);
		}
	}

	private getStatusLabel(status: string): string {
		const labels: Record<string, string> = {
			'pending': '⏳ 待处理',
			'in_progress': '🔄 进行中',
			'completed': '✅ 已完成',
			'blocked': '🚫 阻塞'
		};
		return labels[status] || status;
	}

	private getTaskTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			'implementation': '💻 实现',
			'test': '🧪 测试',
			'documentation': '📝 文档',
			'review': '👀 审查'
		};
		return labels[type] || type;
	}

	async loadSpecFromFolder(folder: URI): Promise<boolean> {
		try {
			// 检查 requirements.md 是否存在
			const requirementsUri = URI.joinPath(folder, 'requirements.md');
			const exists = await this.fileService.exists(requirementsUri);

			if (!exists) {
				this.logService.warn(`[SpecModeService] No requirements.md found in ${folder.fsPath}`);
				return false;
			}

			// 读取需求文件
			const requirementsContent = (await this.fileService.readFile(requirementsUri)).value.toString();

			// 创建新会话
			const session: SpecSession = {
				id: folder.fsPath.split('/').pop() || `spec-${Date.now()}`,
				originalRequirement: this.extractOverviewFromRequirements(requirementsContent),
				userStories: [],  // TODO: 解析用户故事
				tasks: [],        // TODO: 解析任务
				phase: 'task_execution',
				createdAt: new Date(),
				updatedAt: new Date()
			};

			this._currentSession = session;
			this._onDidUpdateSession.fire(session);

			this.logService.info(`[SpecModeService] Loaded spec from ${folder.fsPath}`);
			return true;
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to load spec: ${String(error)}`);
			return false;
		}
	}

	private extractOverviewFromRequirements(content: string): string {
		// 简单提取 Overview 部分
		const overviewMatch = content.match(/## Overview\n([\s\S]*?)(?=\n##|$)/);
		return overviewMatch ? overviewMatch[1].trim() : 'Unknown requirement';
	}

	// ========================================================================
	// LLM 调用
	// ========================================================================

	/**
	 * 调用智谱 AI GLM-4.7 生成内容
	 * 使用流式请求避免超时，但收集完整响应
	 */
	private async callLLM(prompt: string): Promise<string> {
		const apiKey = this.getApiKey();

		this.logService.info(`[SpecModeService] Calling LLM with prompt length: ${prompt.length}`);

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分钟超时

			const response = await fetch(this.API_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: 'glm-4.7',
					messages: [
						{
							role: 'system',
							content: '你是一个专业的软件架构师和产品经理。请根据用户的需求生成结构化的输出。始终使用 JSON 格式输出，确保 JSON 格式正确可解析。'
						},
						{
							role: 'user',
							content: prompt
						}
					],
					temperature: 0.3,
					max_tokens: 16384,
					stream: true // 使用流式输出
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text().catch(() => '');
				throw new Error(`API error: ${response.status} - ${errorText}`);
			}

			// 读取流式响应
			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let content = '';
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6).trim();
					if (data === '[DONE]') continue;

					try {
						const parsed = JSON.parse(data);
						const delta = parsed.choices?.[0]?.delta?.content;
						if (delta) {
							content += delta;
						}
					} catch {
						// 忽略解析错误
					}
				}
			}

			this.logService.info(`[SpecModeService] LLM response length: ${content.length}`);
			return content;
		} catch (error) {
			const errorMsg = String(error);
			this.logService.error(`[SpecModeService] LLM call failed: ${errorMsg}`);

			// 提供更友好的错误信息
			if (errorMsg.includes('Failed to fetch') || errorMsg.includes('network')) {
				throw new Error('网络连接失败，请检查网络设置');
			}
			if (errorMsg.includes('abort')) {
				throw new Error('请求超时，请稍后重试');
			}
			throw error;
		}
	}

	/**
	 * 使用 LLM 执行单个任务
	 */
	async executeTaskWithLLM(task: SpecTask): Promise<{ success: boolean; result: string }> {
		this.logService.info(`[SpecModeService] Executing task: ${task.title}`);

		const session = this._currentSession;
		if (!session) {
			return { success: false, result: 'No active session' };
		}

		// 构建任务执行的上下文
		const context = `
## 当前任务
**标题**: ${task.title}
**描述**: ${task.description}
**类型**: ${task.type}

## 项目上下文
**原始需求**: ${session.originalRequirement}

## 技术设计
${session.technicalDesign?.overview || '无'}

## 相关用户故事
${session.userStories.find(s => s.id === task.storyId)?.description || '无'}
`;

		const prompt = `请执行以下任务并给出具体的实现方案或代码。

${context}

## 要求
1. 如果是实现任务，请给出具体的代码实现
2. 如果是测试任务，请给出测试用例
3. 如果是文档任务，请给出文档内容
4. 使用 Markdown 格式输出
5. 代码使用代码块包裹，标注语言

请开始执行：`;

		try {
			const result = await this.callLLM(prompt);

			// 标记任务为完成
			this.completeTask(task.id);

			return { success: true, result };
		} catch (error) {
			return { success: false, result: String(error) };
		}
	}

	// ========================================================================
	// 自动检测已完成任务 (Kiro 风格)
	// ========================================================================

	/**
	 * 扫描代码库，检测哪些任务已经完成
	 * 通过分析代码和任务描述的匹配度来判断
	 */
	async scanCompletedTasks(): Promise<number> {
		if (!this._currentSession) {
			return 0;
		}

		this.logService.info('[SpecModeService] Scanning for completed tasks...');

		const pendingTasks = this._currentSession.tasks.filter(t => t.status === 'pending');
		if (pendingTasks.length === 0) {
			return 0;
		}

		// 构建任务列表供 LLM 分析
		const tasksDescription = pendingTasks.map((t, i) =>
			`${i + 1}. ${t.title}: ${t.description}`
		).join('\n');

		const prompt = `请分析以下待完成任务列表，根据常见的代码实现模式，判断哪些任务可能已经完成。

## 待检查任务
${tasksDescription}

## 输出格式
请返回一个 JSON 数组，包含已完成任务的序号（从1开始）。
如果无法判断或全部未完成，返回空数组 []。

## 示例
如果任务 1 和 3 已完成，返回：[1, 3]

请直接返回 JSON 数组。`;

		try {
			const response = await this.callLLM(prompt);
			const match = response.match(/\[[\d,\s]*\]/);

			if (match) {
				const completedIndices = JSON.parse(match[0]) as number[];
				let markedCount = 0;

				for (const index of completedIndices) {
					if (index >= 1 && index <= pendingTasks.length) {
						const task = pendingTasks[index - 1];
						task.status = 'completed';
						markedCount++;
					}
				}

				if (markedCount > 0) {
					this._currentSession.updatedAt = new Date();
					await this.saveTasksFile();
					this._onDidUpdateSession.fire(this._currentSession);
				}

				this.logService.info(`[SpecModeService] Marked ${markedCount} tasks as completed`);
				return markedCount;
			}
		} catch (error) {
			this.logService.error(`[SpecModeService] Scan failed: ${String(error)}`);
		}

		return 0;
	}

	// ========================================================================
	// 扫描 .specs 目录中的未完成任务
	// ========================================================================

	/**
	 * 扫描 .specs 目录，找到所有未完成的 Spec 项目
	 * AI 在回答问题前会自动调用这个方法获取上下文
	 */
	async scanPendingSpecs(): Promise<PendingSpecInfo[]> {
		// 确保 specsFolder 已初始化
		if (!this._specsFolder) {
			this.initSpecsFolder();
		}

		if (!this._specsFolder) {
			this.logService.warn('[SpecModeService] scanPendingSpecs: No specs folder configured (no workspace?)');
			return [];
		}

		this.logService.info(`[SpecModeService] Scanning specs folder: ${this._specsFolder.fsPath}`);
		const pendingSpecs: PendingSpecInfo[] = [];

		try {
			// 检查 .specs 目录是否存在
			let stat;
			try {
				stat = await this.fileService.resolve(this._specsFolder);
			} catch {
				this.logService.info('[SpecModeService] .specs folder does not exist yet');
				return [];
			}
			if (!stat.children) {
				return [];
			}

			for (const child of stat.children) {
				if (!child.isDirectory) {
					continue;
				}

				// 尝试读取 manifest.json
				const manifestUri = URI.joinPath(child.resource, 'manifest.json');
				try {
					const manifestContent = await this.fileService.readFile(manifestUri);
					const manifest = JSON.parse(manifestContent.value.toString());

					// 检查是否未完成（phase !== 'completed' 或有未完成的任务）
					const isCompleted = manifest.phase === 'completed' &&
						manifest.progress?.tasks?.completed === manifest.progress?.tasks?.total;

					if (!isCompleted) {
						pendingSpecs.push({
							id: manifest.id || child.name,
							title: manifest.title || child.name,
							description: manifest.description || '',
							phase: manifest.phase || 'unknown',
							folderPath: child.resource.fsPath,
							progress: {
								tasksTotal: manifest.progress?.tasks?.total || 0,
								tasksCompleted: manifest.progress?.tasks?.completed || 0,
								tasksInProgress: manifest.progress?.tasks?.inProgress || 0
							},
							createdAt: manifest.createdAt || '',
							updatedAt: manifest.updatedAt || ''
						});
					}
				} catch {
					// 没有 manifest.json，尝试从 requirements.md 读取
					const requirementsUri = URI.joinPath(child.resource, 'requirements.md');
					try {
						const reqContent = await this.fileService.readFile(requirementsUri);
						const content = reqContent.value.toString();

						// 从 requirements.md 提取标题
						const overviewMatch = content.match(/## Overview\s*\n(.+)/);
						const title = overviewMatch?.[1]?.substring(0, 100) || child.name;

						// 检查是否有 tasks.md
						const tasksUri = URI.joinPath(child.resource, 'tasks.md');
						let tasksTotal = 0;
						let tasksCompleted = 0;

						try {
							const tasksContent = await this.fileService.readFile(tasksUri);
							const tasksText = tasksContent.value.toString();

							// 统计任务状态
							const pendingMatches = tasksText.match(/⏳ 待处理/g);
							const completedMatches = tasksText.match(/✅ 已完成/g);
							const inProgressMatches = tasksText.match(/🔄 进行中/g);

							tasksTotal = (pendingMatches?.length || 0) + (completedMatches?.length || 0) + (inProgressMatches?.length || 0);
							tasksCompleted = completedMatches?.length || 0;
						} catch {
							// 没有 tasks.md
						}

						// 只有有未完成任务才加入列表
						if (tasksTotal === 0 || tasksCompleted < tasksTotal) {
							pendingSpecs.push({
								id: child.name,
								title: title,
								description: title,
								phase: tasksTotal > 0 ? 'task_execution' : 'unknown',
								folderPath: child.resource.fsPath,
								progress: {
									tasksTotal,
									tasksCompleted,
									tasksInProgress: 0
								},
								createdAt: '',
								updatedAt: ''
							});
						}
					} catch {
						// 无法读取任何信息，跳过
					}
				}
			}

			this.logService.info(`[SpecModeService] Found ${pendingSpecs.length} pending specs`);
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to scan specs: ${String(error)}`);
		}

		return pendingSpecs;
	}

	// ========================================================================
	// Vibe → Spec 转换 (Kiro 风格)
	// ========================================================================

	/**
	 * 从 Vibe 模式的对话上下文创建 Spec 会话
	 */
	async createSpecFromVibeContext(vibeContext: string): Promise<void> {
		this.logService.info('[SpecModeService] Creating spec from vibe context...');

		// 创建会话
		const session = this.createSession(vibeContext);

		// 使用 LLM 提取需求
		const prompt = `请分析以下对话内容，提取出核心需求并生成结构化的用户故事。

## 对话内容
${vibeContext}

## 任务
1. 理解对话中讨论的核心功能需求
2. 提取关键的技术约束和设计决策
3. 生成用户故事和验收标准（使用 EARS 格式）

## 输出格式
请以 JSON 格式输出：
{
  "requirement": "提炼后的核心需求描述",
  "stories": [
    {
      "title": "故事标题",
      "description": "作为...我希望...以便...",
      "acceptanceCriteria": ["Given...When...Then..."],
      "priority": "high|medium|low"
    }
  ]
}`;

		try {
			const response = await this.callLLMWithRetry(prompt);
			const data = safeParseJSON<{
				requirement: string;
				stories: Array<{
					title: string;
					description: string;
					acceptanceCriteria: string[];
					priority: 'high' | 'medium' | 'low';
				}>;
			}>(response);

			if (data) {
				// 更新会话
				session.originalRequirement = data.requirement;
				session.userStories = data.stories.map((s, i) => ({
					id: `story-${Date.now()}-${i + 1}`,
					title: s.title,
					description: s.description,
					acceptanceCriteria: s.acceptanceCriteria,
					priority: s.priority,
					status: 'draft' as const
				}));
				session.phase = 'story_review';
				session.updatedAt = new Date();

				await this.saveRequirementsFile();
				await this.saveSessionState();
				this._onDidUpdateSession.fire(session);

				this.logService.info(`[SpecModeService] Created spec with ${session.userStories.length} stories from vibe context`);
			}
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to create spec from vibe: ${toFriendlyErrorMessage(error)}`);
		}
	}

	// ========================================================================
	// P0.4 - 会话状态持久化
	// ========================================================================

	/**
	 * 保存当前会话状态到 .specs/session.json
	 * 刷新页面后可以恢复任务进度
	 */
	async saveSessionState(): Promise<void> {
		if (!this._currentSession || !this._specsFolder) {
			return;
		}

		const sessionFile = URI.joinPath(this._specsFolder, 'session.json');

		try {
			const sessionData = {
				version: 1,
				savedAt: new Date().toISOString(),
				session: {
					id: this._currentSession.id,
					originalRequirement: this._currentSession.originalRequirement,
					phase: this._currentSession.phase,
					createdAt: this._currentSession.createdAt.toISOString(),
					updatedAt: this._currentSession.updatedAt.toISOString(),
					userStories: this._currentSession.userStories,
					technicalDesign: this._currentSession.technicalDesign,
					tasks: this._currentSession.tasks.map(task => ({
						...task,
						// 确保序列化安全
						result: task.result?.slice(0, 10000) // 限制结果长度
					}))
				}
			};

			await this.fileService.writeFile(
				sessionFile,
				VSBuffer.fromString(JSON.stringify(sessionData, null, 2))
			);

			// 同时更新 manifest.json（保持进度同步）
			await this.saveManifest(this._currentSession);

			this.logService.info(`[SpecModeService] Session state saved to ${sessionFile.fsPath}`);
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to save session state: ${String(error)}`);
		}
	}

	/**
	 * 从 .specs/session.json 加载会话状态
	 * @returns 是否成功加载
	 */
	async loadSessionState(): Promise<boolean> {
		if (!this._specsFolder) {
			return false;
		}

		const sessionFile = URI.joinPath(this._specsFolder, 'session.json');

		try {
			const exists = await this.fileService.exists(sessionFile);
			if (!exists) {
				this.logService.info('[SpecModeService] No session.json found, starting fresh');
				return false;
			}

			const content = (await this.fileService.readFile(sessionFile)).value.toString();
			const data = safeParseJSON<{
				version: number;
				savedAt: string;
				session: {
					id: string;
					originalRequirement: string;
					phase: SpecPhase;
					createdAt: string;
					updatedAt: string;
					userStories: UserStory[];
					technicalDesign?: TechnicalDesign;
					tasks: SpecTask[];
				};
			}>(content);

			if (!data || !data.session) {
				this.logService.warn('[SpecModeService] Invalid session.json format');
				return false;
			}

			// 恢复会话
			this._currentSession = {
				id: data.session.id,
				originalRequirement: data.session.originalRequirement,
				phase: data.session.phase,
				createdAt: new Date(data.session.createdAt),
				updatedAt: new Date(data.session.updatedAt),
				userStories: data.session.userStories,
				technicalDesign: data.session.technicalDesign,
				tasks: data.session.tasks
			};

			this.logService.info(`[SpecModeService] Session restored: ${this._currentSession.id}, phase: ${this._currentSession.phase}`);
			this._onDidUpdateSession.fire(this._currentSession);
			this._onDidChangePhase.fire(this._currentSession.phase);

			return true;
		} catch (error) {
			this.logService.error(`[SpecModeService] Failed to load session state: ${String(error)}`);
			return false;
		}
	}

	// ========================================================================
	// P0.2 - LLM 调用带重试
	// ========================================================================

	/**
	 * 带重试机制的 LLM 调用
	 */
	private async callLLMWithRetry(prompt: string): Promise<string> {
		return executeWithRetry(
			() => this.callLLM(prompt),
			{
				maxRetries: 3,
				baseDelayMs: 1000,
				onRetry: (attempt, error) => {
					this.logService.warn(`[SpecModeService] LLM retry ${attempt}/3: ${toFriendlyErrorMessage(error)}`);
				}
			}
		);
	}
}

registerSingleton(ISpecModeService, SpecModeService, InstantiationType.Delayed);
