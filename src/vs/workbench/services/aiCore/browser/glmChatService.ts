/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AI Core GLM Chat Service
// 负责处理 GLM 模型的对话请求，包括流式输出、工具调用、深度思考、联网搜索
// 参考文档:
// - 深度思考: https://docs.bigmodel.cn/cn/guide/capabilities/thinking
// - 联网搜索: https://docs.bigmodel.cn/cn/guide/tools/web-search

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface GLMMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string;
	tool_calls?: GLMToolCall[];
	tool_call_id?: string;
}

export interface GLMToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface GLMToolDefinition {
	type: 'function' | 'web_search';
	function?: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, { type: string; description: string }>;
			required?: string[];
		};
	};
	web_search?: {
		enable: boolean;
		search_engine?: 'search_std' | 'search_pro' | 'search_pro_sogou' | 'search_pro_quark';
		search_result?: boolean;
	};
}

export interface GLMStreamEvent {
	type: 'thinking' | 'content' | 'tool_call' | 'tool_result' | 'web_search' | 'done' | 'error' | 'truncated';
	content?: string;
	toolCall?: GLMToolCall;
	toolResult?: { id: string; output: string; success: boolean };
	webSearchResults?: WebSearchResult[];
	error?: string;
	reason?: string; // 用于 truncated 事件
}

export interface WebSearchResult {
	title: string;
	link: string;
	content: string;
	media?: string;
	icon?: string;
}

export interface GLMChatContext {
	files: Array<{
		uri: URI;
		path: string;
		content: string;
		language?: string;
		lineRange?: string;
	}>;
	webSearchResults?: WebSearchResult[];
}

export interface GLMChatOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	tools?: GLMToolDefinition[];
	/** 启用深度思考模式 */
	enableThinking?: boolean;
	/** 启用联网搜索 */
	enableWebSearch?: boolean;
	/** 搜索引擎类型 */
	searchEngine?: 'search_std' | 'search_pro' | 'search_pro_sogou' | 'search_pro_quark';
	/** 会话 ID，用于关联上下文 */
	sessionId?: string;
	/** 跳过用户消息（用于工具调用续接） */
	skipUserMessage?: boolean;
}

// ============================================================================
// 会话管理 - 支持上下文缓存
// 参考: https://docs.bigmodel.cn/cn/guide/capabilities/cache
// ============================================================================

export interface ChatSession {
	id: string;
	messages: GLMMessage[];
	createdAt: Date;
	updatedAt: Date;
	/** 缓存统计 */
	cacheStats: {
		totalTokens: number;
		cachedTokens: number;
	};
}

// ============================================================================
// 服务接口
// ============================================================================

export const IGLMChatService = createDecorator<IGLMChatService>('glmChatService');

export interface IGLMChatService {
	readonly _serviceBrand: undefined;

	/**
	 * 流式发送消息，返回事件流
	 */
	streamChat(
		messages: GLMMessage[],
		context: GLMChatContext,
		options?: GLMChatOptions,
		token?: CancellationToken
	): AsyncIterable<GLMStreamEvent>;

	/**
	 * 支持自动续接的流式聊天
	 * 当响应因 token 限制截断时，自动发起续接请求
	 */
	streamChatWithContinuation(
		messages: GLMMessage[],
		context: GLMChatContext,
		options?: GLMChatOptions,
		token?: CancellationToken,
		maxContinuations?: number
	): AsyncGenerator<GLMStreamEvent>;

	/**
	 * 构建系统提示词
	 */
	buildSystemPrompt(context: GLMChatContext, mode: 'chat' | 'agent', chatMode?: 'vibe' | 'spec'): string;

	/**
	 * 执行联网搜索
	 */
	webSearch(query: string): Promise<WebSearchResult[]>;

	/**
	 * 测试连接
	 */
	testConnection(): Promise<boolean>;

	/**
	 * 检查深度思考模式是否开启
	 */
	isThinkingEnabled(): boolean;

	/**
	 * 检查联网搜索是否开启
	 */
	isWebSearchEnabled(): boolean;

	// ========================================================================
	// 会话管理 - 支持上下文缓存
	// 参考: https://docs.bigmodel.cn/cn/guide/capabilities/cache
	// ========================================================================

	/**
	 * 创建新会话
	 * @param systemPrompt 可选的系统提示词
	 */
	createSession(systemPrompt?: string): ChatSession;

	/**
	 * 获取当前会话
	 */
	getCurrentSession(): ChatSession | undefined;

	/**
	 * 获取指定会话
	 */
	getSession(sessionId: string): ChatSession | undefined;

	/**
	 * 清除会话历史
	 */
	clearSession(sessionId?: string): void;

	/**
	 * 添加消息到会话（手动管理）
	 */
	addMessage(sessionId: string, message: GLMMessage): void;

	/**
	 * 获取会话的完整消息列表（用于上下文缓存）
	 */
	getSessionMessages(sessionId: string): GLMMessage[];

	/**
	 * 流式聊天（带会话上下文）
	 * 自动维护对话历史，利用智谱 AI 的上下文缓存功能
	 */
	streamChatWithSession(
		userMessage: string,
		context: GLMChatContext,
		options?: GLMChatOptions,
		token?: CancellationToken
	): AsyncIterable<GLMStreamEvent>;

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(sessionId?: string): { totalTokens: number; cachedTokens: number; savings: string };
}

// ============================================================================
// 服务实现
// ============================================================================

export class GLMChatService extends Disposable implements IGLMChatService {
	readonly _serviceBrand: undefined;

	private readonly API_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
	private readonly DEFAULT_API_KEY = '20cca2b90c8c4348aaab3d4f6814c33b.Ow4WJfqfc06uB4KI';
	private readonly DEFAULT_MODEL = 'glm-4.7';

	// ========================================================================
	// 会话管理 - 支持上下文缓存
	// ========================================================================
	private readonly _sessions: Map<string, ChatSession> = new Map();
	private _currentSessionId: string | undefined;

	/** 最大历史消息数量（避免超出 token 限制） */
	private readonly MAX_HISTORY_MESSAGES = 50;

	/** 最大历史 token 估算（约 100K，留 28K 给新消息和输出） */
	private readonly MAX_HISTORY_TOKENS = 100000;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	// ========================================================================
	// 会话管理方法实现
	// ========================================================================

	createSession(systemPrompt?: string): ChatSession {
		const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		const session: ChatSession = {
			id: sessionId,
			messages: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			cacheStats: {
				totalTokens: 0,
				cachedTokens: 0
			}
		};

		// 如果有系统提示词，添加为第一条消息
		if (systemPrompt) {
			session.messages.push({
				role: 'system',
				content: systemPrompt
			});
		}

		this._sessions.set(sessionId, session);
		this._currentSessionId = sessionId;

		this.logService.info(`[GLMChatService] Created session: ${sessionId}`);
		return session;
	}

	getCurrentSession(): ChatSession | undefined {
		if (!this._currentSessionId) {
			return undefined;
		}
		return this._sessions.get(this._currentSessionId);
	}

	getSession(sessionId: string): ChatSession | undefined {
		return this._sessions.get(sessionId);
	}

	clearSession(sessionId?: string): void {
		if (sessionId) {
			this._sessions.delete(sessionId);
			if (this._currentSessionId === sessionId) {
				this._currentSessionId = undefined;
			}
			this.logService.info(`[GLMChatService] Cleared session: ${sessionId}`);
		} else {
			// 清除当前会话
			if (this._currentSessionId) {
				this._sessions.delete(this._currentSessionId);
				this._currentSessionId = undefined;
			}
			this.logService.info(`[GLMChatService] Cleared current session`);
		}
	}

	addMessage(sessionId: string, message: GLMMessage): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			this.logService.warn(`[GLMChatService] Session not found: ${sessionId}`);
			return;
		}

		session.messages.push(message);
		session.updatedAt = new Date();

		// 管理历史长度，避免超出限制
		this.trimSessionHistory(session);
	}

	getSessionMessages(sessionId: string): GLMMessage[] {
		const session = this._sessions.get(sessionId);
		// 返回深拷贝，避免外部修改影响原始会话历史
		return session?.messages.map(m => ({ ...m })) || [];
	}

	/**
	 * 修剪会话历史，避免超出 token 限制
	 * 保留系统提示词和最近的消息
	 */
	private trimSessionHistory(session: ChatSession): void {
		const messages = session.messages;

		// 如果消息数量超过限制
		if (messages.length > this.MAX_HISTORY_MESSAGES) {
			// 保留系统消息
			const systemMessages = messages.filter(m => m.role === 'system');
			const nonSystemMessages = messages.filter(m => m.role !== 'system');

			// 保留最近的消息
			const recentMessages = nonSystemMessages.slice(-this.MAX_HISTORY_MESSAGES + systemMessages.length);

			session.messages = [...systemMessages, ...recentMessages];
			this.logService.info(`[GLMChatService] Trimmed session history from ${messages.length} to ${session.messages.length} messages`);
		}

		// 估算 token 数量并进一步修剪
		const estimatedTokens = this.estimateTokens(session.messages);
		if (estimatedTokens > this.MAX_HISTORY_TOKENS) {
			const systemMessages = session.messages.filter(m => m.role === 'system');
			const nonSystemMessages = session.messages.filter(m => m.role !== 'system');

			// 逐步移除旧消息直到 token 数量合适
			while (nonSystemMessages.length > 2 && this.estimateTokens([...systemMessages, ...nonSystemMessages]) > this.MAX_HISTORY_TOKENS) {
				nonSystemMessages.shift();
			}

			session.messages = [...systemMessages, ...nonSystemMessages];
			this.logService.info(`[GLMChatService] Trimmed session to fit token limit: ~${this.estimateTokens(session.messages)} tokens`);
		}
	}

	/**
	 * 估算消息的 token 数量（粗略估计：中文约 2 字符/token，英文约 4 字符/token）
	 */
	private estimateTokens(messages: GLMMessage[]): number {
		let totalChars = 0;
		for (const msg of messages) {
			if (msg.content) {
				totalChars += msg.content.length;
			}
		}
		// 粗略估计：平均 3 字符/token
		return Math.ceil(totalChars / 3);
	}

	/**
	 * 流式聊天（带会话上下文）
	 * 自动维护对话历史，利用智谱 AI 的上下文缓存功能
	 */
	async *streamChatWithSession(
		userMessage: string,
		context: GLMChatContext,
		options?: GLMChatOptions,
		token?: CancellationToken
	): AsyncIterable<GLMStreamEvent> {
		// 获取或创建会话
		let session = options?.sessionId
			? this.getSession(options.sessionId)
			: this.getCurrentSession();

		if (!session) {
			// 创建新会话，使用当前模式构建系统提示词
			const isAgentMode = this.configurationService.getValue<boolean>('aiCore.agentMode') !== false;
			const chatMode = this.configurationService.getValue<'vibe' | 'spec'>('aiCore.defaultChatMode') || 'vibe';
			const systemPrompt = this.buildSystemPrompt(context, isAgentMode ? 'agent' : 'chat', chatMode);
			session = this.createSession(systemPrompt);
			this.logService.info(`[GLMChatService] Auto-created session for chat: ${session.id}`);
		}

		// 添加用户消息到会话（除非跳过，用于工具调用续接）
		if (!options?.skipUserMessage && userMessage) {
			this.addMessage(session.id, {
				role: 'user',
				content: userMessage
			});
		} else if (options?.skipUserMessage) {
			this.logService.info(`[GLMChatService] Skipping user message for tool call continuation`);
		}

		// 构建完整的消息列表（利用上下文缓存）
		const messages = this.getSessionMessages(session.id);

		this.logService.info(`[GLMChatService] Sending chat with ${messages.length} messages (session: ${session.id})`);

		// 收集助手回复和工具调用
		let assistantContent = '';
		const toolCalls: GLMToolCall[] = [];

		// 使用流式聊天
		for await (const event of this.streamChatWithContinuation(messages, context, options, token)) {
			// 收集内容用于添加到历史
			if (event.type === 'content' && event.content) {
				assistantContent += event.content;
			}

			// 收集工具调用
			if (event.type === 'tool_call' && event.toolCall) {
				toolCalls.push({
					id: event.toolCall.id,
					type: 'function',
					function: {
						name: event.toolCall.function.name,
						arguments: event.toolCall.function.arguments
					}
				});
			}

			yield event;
		}

		// 添加助手回复到会话历史
		if (assistantContent || toolCalls.length > 0) {
			const assistantMessage: GLMMessage = {
				role: 'assistant',
				content: assistantContent || undefined
			};

			// 如果有工具调用，添加到消息中
			if (toolCalls.length > 0) {
				assistantMessage.tool_calls = toolCalls;
				this.logService.info(`[GLMChatService] Added assistant message with ${toolCalls.length} tool calls`);
			}

			this.addMessage(session.id, assistantMessage);
			this.logService.info(`[GLMChatService] Added assistant response to session (${assistantContent.length} chars, ${toolCalls.length} tool calls)`);
		}
	}

	getCacheStats(sessionId?: string): { totalTokens: number; cachedTokens: number; savings: string } {
		const session = sessionId ? this.getSession(sessionId) : this.getCurrentSession();
		if (!session) {
			return { totalTokens: 0, cachedTokens: 0, savings: '0%' };
		}

		const { totalTokens, cachedTokens } = session.cacheStats;
		const savingsPercent = totalTokens > 0 ? ((cachedTokens / totalTokens) * 100).toFixed(1) : '0';

		return {
			totalTokens,
			cachedTokens,
			savings: `${savingsPercent}%`
		};
	}

	/**
	 * 更新缓存统计（从 API 响应中提取）
	 */
	private updateCacheStats(sessionId: string, usage: { prompt_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}

		if (usage.prompt_tokens) {
			session.cacheStats.totalTokens += usage.prompt_tokens;
		}
		if (usage.prompt_tokens_details?.cached_tokens) {
			session.cacheStats.cachedTokens += usage.prompt_tokens_details.cached_tokens;
			this.logService.info(`[GLMChatService] Cache hit: ${usage.prompt_tokens_details.cached_tokens} tokens cached`);
		}
	}

	private getApiKey(): string {
		return this.configurationService.getValue<string>('aiCore.glmApiKey') || this.DEFAULT_API_KEY;
	}

	private getModel(): string {
		return this.configurationService.getValue<string>('aiCore.glmModel') || this.DEFAULT_MODEL;
	}

	/**
	 * 检查深度思考模式是否开启（默认开启）
	 */
	isThinkingEnabled(): boolean {
		return this.configurationService.getValue<boolean>('aiCore.enableThinking') !== false;
	}

	/**
	 * 检查联网搜索是否开启（默认开启，强制开启）
	 */
	isWebSearchEnabled(): boolean {
		// 联网搜索强制开启，不可关闭
		return true;
	}

	/**
	 * 获取搜索引擎类型
	 */
	private getSearchEngine(): 'search_std' | 'search_pro' | 'search_pro_sogou' | 'search_pro_quark' {
		return this.configurationService.getValue<'search_std' | 'search_pro'>('aiCore.searchEngine') || 'search_pro';
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await fetch(this.API_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.getApiKey()}`
				},
				body: JSON.stringify({
					model: this.getModel(),
					messages: [{ role: 'user', content: 'Hello' }],
					max_tokens: 10,
					stream: false
				})
			});

			if (response.ok) {
				this.logService.info('[GLMChatService] Connection test successful');
				return true;
			}
			return false;
		} catch (error) {
			this.logService.error(`[GLMChatService] Connection test failed: ${String(error)}`);
			return false;
		}
	}

	/**
	 * 判断是否应该触发 Web Search
	 * 基于消息内容智能判断，避免不必要的搜索
	 */
	private shouldTriggerWebSearch(message: string): boolean {
		const lowerMessage = message.toLowerCase();

		// ============================================================================
		// 规则1: 包含 URL 或网站链接（优先检测）
		// ============================================================================
		const urlPatterns = [
			// 完整 URL
			/https?:\/\/[^\s]+/i,
			// www 开头
			/www\.[^\s]+/i,
			// 常见顶级域名
			/[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|cn|io|dev|app|ai|co|cc|me|info|biz|edu|gov|mil|int|tv|mobi|name|pro|asia|eu|us|uk|de|fr|jp|kr|ru|br|in|au|ca|it|es|nl|se|no|fi|dk|pl|cz|at|ch|be|pt|gr|tr|mx|ar|cl|co\.uk|com\.cn|net\.cn|org\.cn|gov\.cn|ac\.cn|com\.tw|com\.hk|co\.jp|co\.kr|com\.au|co\.nz|com\.br|com\.mx|com\.ar)/i,
			// 中文网站引用
			/访问.{0,10}网站/,
			/打开.{0,10}链接/,
			/这个.{0,5}(网址|链接|网站|页面)/
		];
		if (urlPatterns.some(pattern => pattern.test(message))) {
			this.logService.trace('[GLMChatService] Web search triggered: contains URL or link reference');
			return true;
		}

		// ============================================================================
		// 规则2: 明确请求搜索
		// ============================================================================
		const explicitSearchKeywords = [
			// 中文搜索请求
			'搜索', '搜一下', '搜一搜', '查一下', '查一查', '查查', '帮我查', '帮我找',
			'上网找', '网上找', '网上搜', '在线查', '在线搜',
			'找一下', '找找', '查询', '检索',
			// 搜索引擎
			'google', 'bing', 'baidu', '百度', '谷歌', '必应', 'duckduckgo', 'yahoo', '搜狗', '360搜索',
			// 英文搜索请求
			'search for', 'search about', 'look up', 'look for', 'find out', 'find information',
			'google it', 'search online', 'search the web', 'web search'
		];
		if (explicitSearchKeywords.some(kw => lowerMessage.includes(kw))) {
			this.logService.trace('[GLMChatService] Web search triggered: explicit search request');
			return true;
		}

		// ============================================================================
		// 规则3: 询问实时/时效性信息
		// ============================================================================
		const realtimeKeywords = [
			// 时效性关键词（中文）
			'最新', '最近', '现在', '当前', '目前', '如今', '眼下', '时下',
			'今天', '昨天', '前天', '明天', '今晚', '今早', '今日', '昨日',
			'今年', '去年', '前年', '明年', '本年度',
			'这个月', '上个月', '下个月', '本月', '上月',
			'这周', '上周', '下周', '本周', '这星期', '上星期',
			'刚刚', '刚才', '近期', '近日', '近来', '新近',
			// 时效性关键词（英文）
			'latest', 'newest', 'current', 'recent', 'now', 'nowadays',
			'today', 'yesterday', 'tomorrow', 'tonight',
			'this year', 'last year', 'next year',
			'this month', 'last month', 'next month',
			'this week', 'last week', 'next week',
			'just now', 'recently', 'currently',
			// 实时数据类型
			'天气', '气温', '温度', '降雨', '下雨', '下雪', '台风', '预报',
			'weather', 'temperature', 'forecast', 'rain', 'snow',
			'股价', '股票', '股市', '大盘', '指数', '涨跌', 'a股', '港股', '美股',
			'stock', 'stocks', 'market', 'index', 'nasdaq', 'dow jones', 's&p',
			'汇率', '外汇', '币价', '比特币', '以太坊', '加密货币', '虚拟货币',
			'exchange rate', 'forex', 'bitcoin', 'btc', 'eth', 'crypto', 'cryptocurrency',
			'新闻', '头条', '热点', '热搜', '舆论', '时事', '快讯', '资讯', '消息',
			'news', 'headline', 'headlines', 'trending', 'hot topic', 'breaking',
			'比分', '比赛', '赛事', '战绩', '积分榜', '排名', '联赛', '世界杯', '欧冠', 'nba', 'cba',
			'score', 'match', 'game', 'championship', 'league', 'tournament',
			'票房', '收视率', '播放量', '销量', '排行榜',
			'box office', 'ratings', 'views', 'sales', 'ranking',
			// 版本/更新
			'最新版本', '新版', '新版本', '更新了', '升级了', '发布了',
			'latest version', 'new version', 'new release', 'update', 'upgrade',
			// 事件/活动
			'什么时候', '几点', '日期', '时间表', '日程', '活动',
			'when is', 'what time', 'schedule', 'event', 'happening'
		];
		if (realtimeKeywords.some(kw => lowerMessage.includes(kw))) {
			this.logService.trace('[GLMChatService] Web search triggered: realtime info request');
			return true;
		}

		// ============================================================================
		// 规则4: 询问特定实体的信息（人物、公司、产品等）
		// ============================================================================
		const entityQueryKeywords = [
			// 动态/新闻类
			'发布了', '推出了', '更新了', '宣布了', '公告', '声明',
			'发布会', '新品', '上市', '上线', '开售', '开放',
			'released', 'announced', 'launched', 'unveiled', 'introduced',
			// 查询类
			'是谁', '是什么', '怎么样', '好不好', '值得', '推荐',
			'有没有', '有多少', '多少钱', '价格', '售价', '报价',
			'who is', 'what is', 'how is', 'how much', 'how many', 'price',
			// 比较类
			'对比', '比较', '区别', '差异', 'vs', 'versus', 'compare', 'comparison', 'difference',
			// 评价类
			'评价', '评测', '测评', '口碑', '好评', '差评', '反馈',
			'review', 'reviews', 'rating', 'ratings', 'feedback',
			// 官方信息
			'官网', '官方', '官方网站', '官方文档', '官方说明',
			'official', 'official website', 'official docs', 'documentation'
		];
		if (entityQueryKeywords.some(kw => lowerMessage.includes(kw))) {
			this.logService.trace('[GLMChatService] Web search triggered: entity query');
			return true;
		}

		// ============================================================================
		// 规则5: 地理/位置相关查询
		// ============================================================================
		const locationKeywords = [
			'在哪里', '在哪儿', '地址', '位置', '怎么走', '怎么去', '路线', '导航', '地图',
			'附近', '周边', '最近的', '距离',
			'where is', 'location', 'address', 'how to get', 'directions', 'map', 'nearby', 'distance'
		];
		if (locationKeywords.some(kw => lowerMessage.includes(kw))) {
			this.logService.trace('[GLMChatService] Web search triggered: location query');
			return true;
		}

		// ============================================================================
		// 规则6: 知识百科类查询（可能需要最新信息）
		// ============================================================================
		const wikiQueryPatterns = [
			/什么是.{2,20}$/,
			/^.{2,20}是什么/,
			/谁是.{2,20}$/,
			/^.{2,20}是谁/,
			/介绍一下.{2,20}$/,
			/^explain\s+/i,
			/^what\s+is\s+/i,
			/^who\s+is\s+/i,
			/^tell\s+me\s+about\s+/i
		];
		if (wikiQueryPatterns.some(pattern => pattern.test(lowerMessage))) {
			// 但要排除编程概念
			const programmingConcepts = [
				'函数', '变量', '类', '对象', '数组', '接口', '模块', '组件',
				'function', 'variable', 'class', 'object', 'array', 'interface', 'module', 'component',
				'api', 'sdk', 'framework', 'library', 'package', 'dependency'
			];
			if (!programmingConcepts.some(kw => lowerMessage.includes(kw))) {
				this.logService.trace('[GLMChatService] Web search triggered: wiki/knowledge query');
				return true;
			}
		}

		// ============================================================================
		// 排除规则: 代码/项目相关问题 - 不需要搜索
		// ============================================================================
		const codeRelatedKeywords = [
			// 代码操作（中文）
			'修改代码', '改一下', '重构', '调试', '修复', '修bug', '实现功能',
			'添加功能', '删除代码', '编写代码', '写代码', '写个', '帮我写',
			// 代码操作（英文）
			'refactor', 'debug', 'fix bug', 'implement', 'code', 'coding',
			// 代码理解
			'这个函数', '这段代码', '这个文件', '这个类', '这个方法', '这个变量',
			'这行代码', '这段逻辑', '这个接口', '这个组件',
			'this function', 'this code', 'this file', 'this class', 'this method',
			// 项目相关
			'工作区', '项目里', '代码库', '仓库', '目录', '文件夹', '源码',
			'workspace', 'repository', 'repo', 'codebase', 'source code',
			// 编程问题
			'怎么写', '如何实现', '怎么实现', '语法', '用法', '报错', '错误', '异常',
			'编译错误', '运行错误', '类型错误', '语法错误',
			'how to write', 'how to implement', 'syntax error', 'type error', 'runtime error',
			// IDE/编辑器相关
			'vscode', 'cursor', '编辑器', 'ide', '插件', '扩展', '快捷键'
		];
		if (codeRelatedKeywords.some(kw => lowerMessage.includes(kw))) {
			this.logService.trace('[GLMChatService] Web search skipped: code-related query');
			return false;
		}

		// ============================================================================
		// 默认: 不触发搜索（保守策略，减少 token 消耗）
		// ============================================================================
		this.logService.trace('[GLMChatService] Web search skipped: no trigger conditions met');
		return false;
	}

	/**
	 * 执行联网搜索
	 * 参考: https://docs.bigmodel.cn/cn/guide/tools/web-search
	 * 使用智谱 AI 的 Chat API + web_search 工具
	 */
	async webSearch(query: string): Promise<WebSearchResult[]> {
		const apiKey = this.getApiKey();
		const searchEngine = this.getSearchEngine();

		this.logService.info(`[GLMChatService] Web search: "${query}" using ${searchEngine}`);

		try {
			// 使用 Chat API 并启用 web_search 工具
			const response = await fetch(this.API_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: this.DEFAULT_MODEL,
					messages: [{ role: 'user', content: query }],
					tools: [{
						type: 'web_search',
						web_search: {
							enable: true,
							search_engine: searchEngine,
							search_result: true
						}
					}],
					stream: false
				})
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				this.logService.error(`[GLMChatService] Web search failed: ${response.status} - ${JSON.stringify(errData)}`);
				return [];
			}

			const data = await response.json();
			this.logService.trace(`[GLMChatService] Web search response: ${JSON.stringify(data).slice(0, 500)}`);

			// 解析搜索结果 - 检查 web_search 返回格式
			const results: WebSearchResult[] = [];

			// 方式1: 从 tool_calls 中提取
			if (data.choices?.[0]?.message?.tool_calls) {
				for (const toolCall of data.choices[0].message.tool_calls) {
					if (toolCall.type === 'web_browser' && toolCall.web_browser?.outputs) {
						for (const output of toolCall.web_browser.outputs) {
							results.push({
								title: output.title || '',
								link: output.link || '',
								content: output.content || '',
								media: output.media,
								icon: output.icon
							});
						}
					}
					// 方式2: web_search 类型
					if (toolCall.type === 'web_search' && toolCall.web_search) {
						const ws = toolCall.web_search;
						if (ws.search_result) {
							for (const result of ws.search_result) {
								results.push({
									title: result.title || '',
									link: result.link || result.url || '',
									content: result.content || result.snippet || '',
									media: result.media,
									icon: result.icon
								});
							}
						}
					}
				}
			}

			// 方式3: 从 web_search 字段提取（某些 API 版本）
			if (data.web_search && Array.isArray(data.web_search)) {
				for (const item of data.web_search) {
					results.push({
						title: item.title || '',
						link: item.link || item.url || '',
						content: item.content || item.snippet || '',
						media: item.media,
						icon: item.icon
					});
				}
			}

			this.logService.info(`[GLMChatService] Web search returned ${results.length} results`);
			return results;
		} catch (error) {
			this.logService.error(`[GLMChatService] Web search error: ${String(error)}`);
			return [];
		}
	}

	buildSystemPrompt(context: GLMChatContext, mode: 'chat' | 'agent', chatMode?: 'vibe' | 'spec'): string {
		let prompt = '';

		// 根据 Chat 模式（Vibe/Spec）设置基础提示词
		if (chatMode === 'spec') {
			prompt = `你是一个规范驱动的 AI 编程助手，工作在 **Spec 模式**。

## 工作方式
你将帮助用户按以下阶段完成需求：

### 阶段 1: 需求理解
- 理解用户的核心需求，澄清模糊的地方

### 阶段 2: 用户故事生成
将需求拆解为用户故事，每个故事包含：
- 标题和描述（As a... I want... So that...）
- 验收标准（Acceptance Criteria，至少3条）
- 优先级（高/中/低）

### 阶段 3: 技术设计
生成技术设计文档：
- 架构概述
- 组件设计
- 数据流
- 测试策略

### 阶段 4: 任务分解
将用户故事和设计转化为可执行的任务清单

### 阶段 5: 任务执行
逐个执行任务，每个任务完成后显示进度

请用结构化的 Markdown 格式输出。

`;
		} else if (mode === 'agent') {
			prompt = `你是一个敏捷的 AI 编程助手，工作在 **Vibe 模式**。

## 工作风格
- 快速响应，边聊边做
- 直接给出解决方案和代码
- 迭代式改进，根据反馈调整

## 可用工具
- 读取文件 (read_file) - 读取特定文件内容
- 列出目录 (list_dir) - 查看目录结构
- 搜索代码 (grep_search) - 在代码中搜索关键词
- 搜索文件 (search_files) - 按文件名搜索
- 写入文件 (write_file) - 创建或修改文件
- 执行命令 (run_command) - 运行终端命令
- 获取诊断 (get_diagnostics) - 获取代码问题
- 浏览网页 (browse_url) - 访问 URL
- 深度搜索 (web_search_deep) - 搜索并综合分析

## ⚠️ 工具使用策略 - 极其重要

1. **最小化原则**：只调用必要的工具，避免过度探索
   - 回答简单问题不需要任何工具
   - 查看项目结构只需 1-2 次 list_dir
   - 不要递归遍历整个项目目录

2. **快速回答**：获取足够信息后立即回答
   - 每次工具调用后评估：是否已有足够信息回答问题？
   - 如果是，立即停止调用工具，给出回答
   - 不要追求"完美了解"，追求"快速有用"

3. **工具调用上限**：最多调用 3-5 次工具
   - 超过 5 次说明策略有问题
   - 停下来，基于已有信息回答

4. **优先级**：
   - 先回答问题的核心部分
   - 工具调用是辅助，不是目的

## 回答格式
- 必须用中文回答
- 先给出直接答案，再补充细节
- 如果调用了工具，必须在工具结果后给出总结性回答

`;
		} else {
			prompt = `你是一个专业的编程助手。请用中文回答，擅长代码分析和技术解释。

`;
		}

		// 添加上下文文件信息
		if (context.files.length > 0) {
			prompt += '## 用户提供的代码上下文\n\n';

			for (const file of context.files) {
				const fileName = file.path.split('/').pop() || file.path;
				const lineInfo = file.lineRange ? `:${file.lineRange}` : '';

				prompt += `### 📄 ${fileName}${lineInfo}\n\n`;
				prompt += '```' + (file.language || '') + '\n';
				prompt += file.content;
				prompt += '\n```\n\n';
			}
		}

		// 添加联网搜索结果
		if (context.webSearchResults && context.webSearchResults.length > 0) {
			prompt += '## 联网搜索结果\n\n';
			prompt += '**重要提示**：以下是已经为你检索到的互联网资料，你不需要再访问这些链接。请直接根据这些已提供的信息来回答用户问题，并在回答中引用相关来源。\n\n';

			for (const result of context.webSearchResults) {
				prompt += `### 📄 ${result.title}\n`;
				prompt += `- 链接: ${result.link}\n`;
				if (result.media) {
					prompt += `- 来源: ${result.media}\n`;
				}
				if (result.content) {
					prompt += `- 摘要: ${result.content}\n`;
				}
				prompt += '\n';
			}

			prompt += '请基于以上搜索结果，结合你的知识，为用户提供完整的答案。不要说"无法访问链接"或"我无法打开网页"等，因为内容已经提供给你了。\n\n';
		}

		return prompt;
	}

	async *streamChat(
		messages: GLMMessage[],
		context: GLMChatContext,
		options?: GLMChatOptions,
		token?: CancellationToken
	): AsyncIterable<GLMStreamEvent> {
		const apiKey = this.getApiKey();
		const model = options?.model || this.getModel();
		const sessionId = options?.sessionId || this._currentSessionId;

		// 重要：创建消息的深拷贝，避免修改原始会话历史
		const messagesCopy = messages.map(m => ({ ...m }));

		// 检查是否启用深度思考和联网搜索
		const enableThinking = options?.enableThinking ?? this.isThinkingEnabled();
		const enableWebSearch = options?.enableWebSearch ?? this.isWebSearchEnabled();

		// 获取最后一条用户消息
		const userMessages = messagesCopy.filter(m => m.role === 'user');
		const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';

		// 智能判断是否需要触发 Web Search
		const shouldSearch = enableWebSearch && lastUserMessage && this.shouldTriggerWebSearch(lastUserMessage);

		this.logService.info(`[GLMChatService] Chat options: thinking=${enableThinking}, webSearch=${enableWebSearch}, shouldSearch=${shouldSearch}, messages=${messagesCopy.length}`);

		// 只有在需要时才执行联网搜索
		if (shouldSearch) {
			yield { type: 'thinking', content: '🔍 正在联网搜索相关资料...' };

			const searchResults = await this.webSearch(lastUserMessage);
			if (searchResults.length > 0) {
				context.webSearchResults = searchResults;
				yield {
					type: 'web_search',
					content: `找到 ${searchResults.length} 条相关结果`,
					webSearchResults: searchResults
				};

				// 更新系统提示词以包含搜索结果（只修改副本）
				const systemMessage = messagesCopy.find(m => m.role === 'system');
				if (systemMessage) {
					systemMessage.content = this.buildSystemPrompt(context, 'chat');
				}
			}
		}

		// 构建请求体（使用副本，保护原始会话历史）
		const requestBody: Record<string, unknown> = {
			model,
			messages: messagesCopy,
			temperature: options?.temperature ?? 0.7,
			max_tokens: options?.maxTokens ?? 32768, // GLM-4.7 支持 128K，增加输出限制
			stream: true
		};

		// 添加深度思考模式
		// 参考: https://docs.bigmodel.cn/cn/guide/capabilities/thinking
		if (enableThinking) {
			requestBody.thinking = {
				type: 'enabled',
				budget_tokens: 4096  // 思考 token 预算
			};
		}

		// 添加工具定义（如果有）
		const tools: GLMToolDefinition[] = options?.tools || [];

		// 只有在智能判断需要搜索且尚未执行搜索时，才添加 web_search 工具
		// 这样 AI 可以在需要时自主调用搜索
		if (shouldSearch && !context.webSearchResults?.length) {
			tools.push({
				type: 'web_search',
				web_search: {
					enable: true,
					search_engine: this.getSearchEngine(),
					search_result: true
				}
			});
		}

		if (tools.length > 0) {
			requestBody.tools = tools;
			requestBody.tool_choice = 'auto';
		}

		this.logService.trace(`[GLMChatService] Sending request to ${this.API_ENDPOINT}`);
		this.logService.trace(`[GLMChatService] Request body: ${JSON.stringify(requestBody).slice(0, 500)}...`);

		try {
			const response = await fetch(this.API_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const errorMessage = errorData.error?.message || response.statusText;
				yield { type: 'error', error: `API Error: ${response.status} - ${errorMessage}` };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'No response body' };
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let isInThinkingBlock = false;

			while (true) {
				if (token?.isCancellationRequested) {
					reader.cancel();
					break;
				}

				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}

					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						yield { type: 'done' };
						continue;
					}

					try {
						const parsed = JSON.parse(data);
						const choice = parsed.choices?.[0];

						// 提取并更新缓存统计（上下文缓存功能）
						if (parsed.usage && sessionId) {
							this.updateCacheStats(sessionId, parsed.usage);
						}

						if (!choice) {
							continue;
						}

						const delta = choice.delta;

						// 处理思考内容（深度思考模式）
						if (delta?.reasoning_content) {
							if (!isInThinkingBlock) {
								isInThinkingBlock = true;
								yield { type: 'thinking', content: '💭 思考中...\n' };
							}
							yield { type: 'thinking', content: delta.reasoning_content };
						}

						// 处理工具调用
						if (delta?.tool_calls) {
							for (const toolCall of delta.tool_calls) {
								// 检查是否是 web_search 工具
								if (toolCall.type === 'web_browser') {
									yield {
										type: 'web_search',
										content: '🔍 正在搜索网络...'
									};
								} else {
									yield {
										type: 'tool_call',
										toolCall: {
											id: toolCall.id || '',
											type: 'function',
											function: {
												name: toolCall.function?.name || '',
												arguments: toolCall.function?.arguments || ''
											}
										}
									};
								}
							}
						}

						// 处理内容输出
						if (delta?.content) {
							if (isInThinkingBlock) {
								isInThinkingBlock = false;
								yield { type: 'content', content: '\n\n---\n\n' };
							}
							yield { type: 'content', content: delta.content };
						}

						// 检测是否因 token 限制而中断
						const finishReason = choice.finish_reason;
						if (finishReason === 'length') {
							this.logService.warn('[GLMChatService] Response truncated due to token limit, signaling continuation needed');
							yield { type: 'truncated', reason: 'length' };
						}

					} catch {
						// 忽略解析错误
					}
				}
			}

		} catch (error) {
			if (token?.isCancellationRequested) {
				return;
			}
			yield { type: 'error', error: String(error) };
		}
	}

	/**
	 * 支持自动续接的流式聊天
	 * 当响应因 token 限制截断时，自动发起续接请求
	 */
	async *streamChatWithContinuation(
		messages: GLMMessage[],
		context: GLMChatContext,
		options?: GLMChatOptions,
		token?: CancellationToken,
		maxContinuations: number = 3
	): AsyncGenerator<GLMStreamEvent> {
		let continuationCount = 0;
		let currentMessages = [...messages];
		let accumulatedContent = '';

		while (continuationCount <= maxContinuations) {
			let needsContinuation = false;

			for await (const event of this.streamChat(currentMessages, context, options, token)) {
				if (event.type === 'content') {
					accumulatedContent += event.content;
				}

				if (event.type === 'truncated') {
					needsContinuation = true;
					this.logService.info(`[GLMChatService] Continuation ${continuationCount + 1}/${maxContinuations}`);
					continue;
				}

				yield event;
			}

			if (!needsContinuation) {
				break;
			}

			// 准备续接请求
			continuationCount++;
			if (continuationCount > maxContinuations) {
				yield { type: 'content', content: '\n\n⚠️ 回复过长，已达到续接上限。' };
				break;
			}

			// 添加已生成的内容作为 assistant 消息，然后请求继续
			currentMessages = [
				...currentMessages,
				{ role: 'assistant', content: accumulatedContent },
				{ role: 'user', content: '请继续你的回答。' }
			];

			yield { type: 'content', content: '\n\n*[继续生成中...]*\n\n' };
		}
	}
}

registerSingleton(IGLMChatService, GLMChatService, InstantiationType.Delayed);
