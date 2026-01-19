/*---------------------------------------------------------------------------------------------
 *  AI Core Chat Mode Types
 *  定义 Vibe 和 Spec 两种对话模式
 *--------------------------------------------------------------------------------------------*/

// ============================================================================
// 对话模式定义
// ============================================================================

/**
 * 对话模式类型
 */
export type ChatModeType = 'vibe' | 'spec';

/**
 * 对话模式信息
 */
export interface ChatModeInfo {
	id: ChatModeType;
	name: string;
	description: string;
	icon: string;  // Codicon name
	features: string[];
}

/**
 * Vibe 模式 - 边聊边做
 */
export const VIBE_MODE: ChatModeInfo = {
	id: 'vibe',
	name: 'Vibe',
	description: 'Chat first, then build. Explore ideas and iterate as you discover needs.',
	icon: 'comment-discussion',
	features: [
		'Rapid exploration and testing',
		'Building when requirements are unclear',
		'Implementing a task'
	]
};

/**
 * Spec 模式 - 先规划后执行
 */
export const SPEC_MODE: ChatModeInfo = {
	id: 'spec',
	name: 'Spec',
	description: 'Plan first, then build. Create requirements and design before coding starts.',
	icon: 'notebook',
	features: [
		'Thinking through features in-depth',
		'Projects needing upfront planning',
		'Building features in a structured way'
	]
};

// ============================================================================
// Spec 模式相关类型
// ============================================================================

/**
 * 用户故事
 */
export interface UserStory {
	id: string;
	title: string;
	description: string;
	acceptanceCriteria: string[];
	priority: 'high' | 'medium' | 'low';
	status: 'draft' | 'approved' | 'in_progress' | 'completed';
}

/**
 * 技术设计文档
 */
export interface TechnicalDesign {
	overview: string;
	architecture: string;
	sequenceDiagram?: string;  // Mermaid 序列图代码
	components: DesignComponent[];
	dataFlow?: string;
	apiDesign?: string;  // API 设计说明
	securityConsiderations?: string;
	testingStrategy?: string;
}

export interface DesignComponent {
	name: string;
	responsibility: string;
	interfaces?: string[];
	dependencies?: string[];
}

/**
 * 任务项
 */
export interface SpecTask {
	id: string;
	title: string;
	description: string;
	storyId: string;
	type: 'implementation' | 'test' | 'documentation' | 'review';
	status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed';
	estimatedEffort?: string;
	order: number;
	dependencies?: string[];  // 依赖的其他任务 ID
	result?: string;          // 任务执行结果
}

/**
 * Spec 会话状态
 */
export interface SpecSession {
	id: string;
	originalRequirement: string;
	userStories: UserStory[];
	technicalDesign?: TechnicalDesign;
	tasks: SpecTask[];
	phase: SpecPhase;
	createdAt: Date;
	updatedAt: Date;
}

export type SpecPhase =
	| 'requirement_gathering'  // 收集需求
	| 'story_generation'       // 生成用户故事
	| 'story_review'           // 审核用户故事
	| 'design_generation'      // 生成技术设计
	| 'design_review'          // 审核技术设计
	| 'task_generation'        // 生成任务列表
	| 'task_execution'         // 执行任务
	| 'completed';             // 完成

// ============================================================================
// 模式系统提示词
// ============================================================================

export const VIBE_SYSTEM_PROMPT = `你是一个敏捷的 AI 编程助手，工作在 **Vibe 模式**。

## 工作方式
- 快速响应，边聊边做
- 直接给出解决方案和代码
- 迭代式改进，根据反馈调整
- 适合探索性开发和快速原型

## 特点
- 简洁直接的回答
- 代码优先，解释辅助
- 快速验证想法
- 灵活调整方向

请用中文回答，保持高效和灵活。`;

export const SPEC_SYSTEM_PROMPT = `你是一个规范驱动的 AI 编程助手，工作在 **Spec 模式**。

## 工作方式
你将帮助用户按以下阶段完成需求：

### 阶段 1: 需求理解
- 理解用户的核心需求
- 澄清模糊的地方
- 确认范围和约束

### 阶段 2: 用户故事生成
将需求拆解为用户故事，每个故事包含：
- 标题和描述
- 验收标准（Acceptance Criteria）
- 优先级

### 阶段 3: 技术设计
生成技术设计文档：
- 架构概述
- 组件设计
- 数据流
- 测试策略

### 阶段 4: 任务分解
将用户故事和设计转化为可执行的任务清单：
- 实现任务
- 测试任务
- 文档任务

### 阶段 5: 任务执行
逐个执行任务，每个任务完成后：
- 显示进度
- 等待用户确认
- 继续下一个任务

## 输出格式
请使用结构化的 Markdown 格式输出，便于用户审核和追踪。

请用中文回答，保持专业和结构化。`;

// ============================================================================
// 辅助函数
// ============================================================================

export function getModeInfo(mode: ChatModeType): ChatModeInfo {
	return mode === 'vibe' ? VIBE_MODE : SPEC_MODE;
}

export function getSystemPromptForMode(mode: ChatModeType): string {
	return mode === 'vibe' ? VIBE_SYSTEM_PROMPT : SPEC_SYSTEM_PROMPT;
}
