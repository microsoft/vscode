/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import { promises as fs } from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../../platform/log/common/logService';
import { IPromptsService } from '../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { basename } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { getCopilotLogger } from './logger';
import { ensureRipgrepShim } from './ripgrepShim';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { getModelCapabilitiesDescription } from '../../../conversation/common/languageModelAccess';

export const COPILOT_CLI_REASONING_EFFORT_PROPERTY = 'reasoningEffort';
const COPILOT_CLI_MODEL_MEMENTO_KEY = 'github.copilot.cli.sessionModel';
const COPILOT_CLI_REQUEST_MAP_KEY = 'github.copilot.cli.requestMap';
// Store last used Agent for a Session.
const COPILOT_CLI_SESSION_AGENTS_MEMENTO_KEY = 'github.copilot.cli.sessionAgents';
/**
 * @deprecated Use empty strings to represent default model/agent instead.
 * Left here for backward compatibility (for state stored by older versions of Chat extension).
 */
export const COPILOT_CLI_DEFAULT_AGENT_ID = '___vscode_default___';

export interface CopilotCLIModelInfo {
	readonly id: string;
	readonly name: string;
	readonly multiplier?: number;
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
	readonly maxContextWindowTokens: number;
	readonly supportsVision?: boolean;
	readonly supportsReasoningEffort?: boolean;
	readonly defaultReasoningEffort?: string;
	readonly supportedReasoningEfforts?: string[];
}

export interface ICopilotCLIModels {
	readonly _serviceBrand: undefined;
	resolveModel(modelId: string): Promise<string | undefined>;
	getDefaultModel(): Promise<string | undefined>;
	setDefaultModel(modelId: string | undefined): Promise<void>;
	getModels(): Promise<CopilotCLIModelInfo[]>;
	registerLanguageModelChatProvider(lm: typeof vscode['lm']): void;
}

export function formatModelDetails(model: CopilotCLIModelInfo): string {
	return `${model.name}${model.multiplier ? ` • ${model.multiplier}x` : ''}`;
}

export const ICopilotCLISDK = createServiceIdentifier<ICopilotCLISDK>('ICopilotCLISDK');

export const ICopilotCLIModels = createServiceIdentifier<ICopilotCLIModels>('ICopilotCLIModels');

export class CopilotCLIModels extends Disposable implements ICopilotCLIModels {
	declare _serviceBrand: undefined;
	private _availableModels?: Promise<CopilotCLIModelInfo[]>;
	/** Synchronously available model infos (includes `auto`). Set once the eager fetch completes. */
	private _resolvedModelInfos?: vscode.LanguageModelChatInformation[];
	private readonly _onDidChange = this._register(new Emitter<void>());

	constructor(
		@ICopilotCLISDK private readonly copilotCLISDK: ICopilotCLISDK,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._fetchAndCacheModels();
		this._register(this._authenticationService.onDidAuthenticationChange(() => {
			// Auth changed which means models could've changed. Clear caches and re-fetch.
			this._availableModels = undefined;
			this._resolvedModelInfos = undefined;
			this._onDidChange.fire();
			this._fetchAndCacheModels();
		}));
	}

	private _fetchAndCacheModels(): void {
		const availableModels = this._availableModels = this._getAvailableModels();
		availableModels.then(models => {
			// Bail out if a newer fetch has superseded this one (e.g. auth changed mid-flight).
			if (this._availableModels !== availableModels) {
				return;
			}
			this._resolvedModelInfos = this._buildModelInfos(models);
			this._onDidChange.fire();
		}).catch((error) => {
			this.logService.error('[CopilotCLIModels] Failed to fetch available models', error);
		});
	}
	async resolveModel(modelId: string): Promise<string | undefined> {
		if (modelId.toLowerCase() === 'auto' && this.configurationService.getConfig(ConfigKey.Advanced.CLIAutoModelEnabled)) {
			return modelId;
		}
		const models = await this.getModels();
		modelId = modelId.trim().toLowerCase();
		return models.find(m => m.id.toLowerCase() === modelId || m.name.toLowerCase() === modelId)?.id;
	}
	public async getDefaultModel() {
		// First item in the list is always the default model (SDK sends the list ordered based on default preference)
		const models = await this.getModels();
		if (!models.length) {
			return;
		}
		const defaultModel = models[0];
		const preferredModelId = this.extensionContext.globalState.get<string>(COPILOT_CLI_MODEL_MEMENTO_KEY, defaultModel.id)?.trim()?.toLowerCase();

		return models.find(m => m.id.toLowerCase() === preferredModelId)?.id ?? defaultModel.id;
	}

	public async setDefaultModel(modelId: string | undefined): Promise<void> {
		await this.extensionContext.globalState.update(COPILOT_CLI_MODEL_MEMENTO_KEY, modelId);
	}

	public async getModels(): Promise<CopilotCLIModelInfo[]> {
		if (!this._authenticationService.anyGitHubSession) {
			return [];
		}

		// No need to query sdk multiple times, cache the result, this cannot change during a vscode session.
		if (!this._availableModels) {
			this._availableModels = this._getAvailableModels();
		}
		return this._availableModels;
	}

	private async _getAvailableModels(): Promise<CopilotCLIModelInfo[]> {
		const [{ getAvailableModels }, authInfo] = await Promise.all([this.copilotCLISDK.getPackage(), this.copilotCLISDK.getAuthInfo()]);
		try {
			const models = await getAvailableModels(authInfo);
			return models.map(model => ({
				id: model.id,
				name: model.name,
				multiplier: model.billing?.multiplier,
				maxInputTokens: model.capabilities.limits.max_prompt_tokens,
				maxOutputTokens: model.capabilities.limits.max_output_tokens,
				maxContextWindowTokens: model.capabilities.limits.max_context_window_tokens,
				supportsVision: model.capabilities.supports.vision,
				supportsReasoningEffort: model.capabilities.supports.reasoningEffort,
				defaultReasoningEffort: model.defaultReasoningEffort,
				supportedReasoningEfforts: model.supportedReasoningEfforts,
			} satisfies CopilotCLIModelInfo));
		} catch (ex) {
			this.logService.error(`[CopilotCLISession] Failed to fetch models`, ex);
			return [];
		}
	}

	public registerLanguageModelChatProvider(lm: typeof vscode['lm']): void {
		const provider: vscode.LanguageModelChatProvider = {
			onDidChangeLanguageModelChatInformation: this._onDidChange.event,
			provideLanguageModelChatInformation: async (_options, _token) => {
				const autoModelEnabled = this.configurationService.getConfig(ConfigKey.Advanced.CLIAutoModelEnabled);
				if (!this._authenticationService.anyGitHubSession || !this._resolvedModelInfos) {
					return autoModelEnabled ? [buildAutoModel()] : [];
				}
				return this._resolvedModelInfos;
			},
			provideLanguageModelChatResponse: async (_model, _messages, _options, _progress, _token) => {
				// Implemented via chat participants.
			},
			provideTokenCount: async (_model, _text, _token) => {
				// Token counting is not currently supported for the copilotcli provider.
				return 0;
			}
		};
		this._register(lm.registerLanguageModelChatProvider('copilotcli', provider));
		this._onDidChange.fire();
	}

	private _buildModelInfos(models: CopilotCLIModelInfo[]): vscode.LanguageModelChatInformation[] {
		const isReasoningEffortEnabled = this.configurationService.getConfig(ConfigKey.Advanced.CLIThinkingEffortEnabled);
		const isAutoModelEnabled = this.configurationService.getConfig(ConfigKey.Advanced.CLIAutoModelEnabled);
		const modelsInfo: vscode.LanguageModelChatInformation[] = models.map((model, index) => {
			const multiplier = model.multiplier === undefined ? undefined : `${model.multiplier}x`;
			const modelInfo: vscode.LanguageModelChatInformation = {
				id: model.id,
				name: model.name,
				family: model.id,
				version: '',
				maxInputTokens: model.maxInputTokens ?? model.maxContextWindowTokens,
				maxOutputTokens: model.maxOutputTokens ?? 0,
				multiplier,
				multiplierNumeric: model.multiplier,
				isUserSelectable: true,
				configurationSchema: isReasoningEffortEnabled ? buildConfigurationSchema(model) : undefined,
				capabilities: {
					imageInput: model.supportsVision,
					toolCalling: true
				},
				targetChatSessionType: 'copilotcli',
				isDefault: !isAutoModelEnabled && index === 0 ? true : undefined,
			};
			const tooltip = getModelCapabilitiesDescription(modelInfo) ?? '';
			return {
				...modelInfo,
				tooltip
			};
		});
		if (isAutoModelEnabled) {
			modelsInfo.unshift(buildAutoModel(models[0]));
		}
		return modelsInfo;
	}
}

function buildAutoModel(defaultModel?: CopilotCLIModelInfo): vscode.LanguageModelChatInformation {
	return {
		id: 'auto',
		name: 'Auto',
		tooltip: l10n.t('Auto selects the best model for your request based on capacity and performance.'),
		family: defaultModel?.id ?? '',
		version: '',
		maxInputTokens: defaultModel?.maxInputTokens ?? defaultModel?.maxContextWindowTokens ?? 0,
		maxOutputTokens: defaultModel?.maxOutputTokens ?? 0,
		isUserSelectable: true,
		capabilities: {
			imageInput: defaultModel?.supportsVision,
			toolCalling: true,
		},
		targetChatSessionType: 'copilotcli',
		isDefault: true,
	};
}

function buildConfigurationSchema(modelInfo: CopilotCLIModelInfo): vscode.LanguageModelConfigurationSchema | undefined {
	const effortLevels = modelInfo.supportedReasoningEfforts ?? [];
	if (effortLevels.length === 0) {
		return;
	}

	const defaultEffort = modelInfo.defaultReasoningEffort;

	return {
		properties: {
			[COPILOT_CLI_REASONING_EFFORT_PROPERTY]: {
				type: 'string',
				title: l10n.t('Thinking Effort'),
				enum: effortLevels,
				enumItemLabels: effortLevels.map(level => level.charAt(0).toUpperCase() + level.slice(1)),
				enumDescriptions: effortLevels.map(level => {
					switch (level) {
						case 'none': return l10n.t('No reasoning applied');
						case 'low': return l10n.t('Faster responses with less reasoning');
						case 'medium': return l10n.t('Balanced reasoning and speed');
						case 'high': return l10n.t('Greater reasoning depth but slower');
						case 'xhigh': return l10n.t('Maximum reasoning depth but slower');
						default: return level;
					}
				}),
				default: defaultEffort,
				group: 'navigation',
			}
		}
	};
}

/** An agent with its source URI preserved for UI and cross-referencing. */
export interface CLIAgentInfo {
	readonly agent: Readonly<SweCustomAgent>;
	/** File URI for prompt-file agents, synthetic `copilotcli:` URI for SDK-only agents. */
	readonly sourceUri: URI;
	/** The contributing extension identifier, when the agent came from a VS Code extension. */
	readonly extensionId?: string;
	/** The contributing plugin URI, when the agent came from a plugin. */
	readonly pluginUri?: URI;
}

export interface ICopilotCLIAgents {
	readonly _serviceBrand: undefined;
	readonly onDidChangeAgents: Event<void>;
	resolveAgent(agentId: string): Promise<SweCustomAgent | undefined>;
	getAgents(): Promise<readonly CLIAgentInfo[]>;
	getSessionAgent(sessionId: string): Promise<string | undefined>;
}

export const ICopilotCLIAgents = createServiceIdentifier<ICopilotCLIAgents>('ICopilotCLIAgents');

export class CopilotCLIAgents extends Disposable implements ICopilotCLIAgents {
	declare _serviceBrand: undefined;
	private sessionAgents: Record<string, { agentId?: string; createdDateTime: number }> = {};
	private _agentsPromise?: Promise<readonly CLIAgentInfo[]>;
	private readonly _onDidChangeAgents = this._register(new Emitter<void>());
	readonly onDidChangeAgents: Event<void> = this._onDidChangeAgents.event;
	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICopilotCLISDK private readonly copilotCLISDK: ICopilotCLISDK,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super();
		void this.getAgents();
		this._register(this.promptsService.onDidChangeCustomAgents(() => {
			this._refreshAgents();
		}));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this._refreshAgents();
		}));
	}

	private _refreshAgents(): void {
		this._agentsPromise = undefined;
		this.getAgents().catch((error) => {
			this.logService.error('[CopilotCLIAgents] Failed to refresh agents', error);
		});
		this._onDidChangeAgents.fire();
	}

	async trackSessionAgent(sessionId: string, agent: string | undefined): Promise<void> {
		const details = Object.keys(this.sessionAgents).length ? this.sessionAgents : this.extensionContext.workspaceState.get<Record<string, { agentId?: string; createdDateTime: number }>>(COPILOT_CLI_SESSION_AGENTS_MEMENTO_KEY, this.sessionAgents);

		details[sessionId] = { agentId: agent, createdDateTime: Date.now() };
		this.sessionAgents = details;

		// Prune entries older than 7 days.
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		for (const [key, value] of Object.entries(details)) {
			if (value.createdDateTime < sevenDaysAgo) {
				delete details[key];
			}
		}

		await this.extensionContext.workspaceState.update(COPILOT_CLI_SESSION_AGENTS_MEMENTO_KEY, details);
	}

	async getSessionAgent(sessionId: string): Promise<string | undefined> {
		const details = this.extensionContext.workspaceState.get<Record<string, { agentId?: string; createdDateTime: number }>>(COPILOT_CLI_SESSION_AGENTS_MEMENTO_KEY, this.sessionAgents);
		// Check in-memory cache first before reading from memento.
		// Possibly the session agent was just set and not yet persisted.
		const agentId = this.sessionAgents[sessionId]?.agentId ?? details[sessionId]?.agentId;
		if (agentId === COPILOT_CLI_DEFAULT_AGENT_ID) {
			return '';
		}
		if (typeof agentId === 'string') {
			return agentId;
		}
		const agents = await this.getAgents();
		return agents.find(a => a.agent.name.toLowerCase() === agentId)?.agent.name;
	}

	async resolveAgent(agentId: string): Promise<SweCustomAgent | undefined> {
		for (const customAgent of await this.promptsService.getCustomAgents(CancellationToken.None)) {
			if (isEnabledForCopilotCLI(customAgent) && agentId === customAgent.uri.toString()) {
				return this.toCustomAgent(customAgent)?.agent;
			}
		}
		const customAgents = await this.getAgents();
		agentId = agentId.toLowerCase();
		const match = customAgents.find(a => a.agent.name.toLowerCase() === agentId || a.agent.displayName?.toLowerCase() === agentId);
		return match ? this.cloneAgent(match.agent) : undefined;
	}

	async getAgents(): Promise<readonly CLIAgentInfo[]> {
		// Cache the promise to avoid concurrent fetches
		if (!this._agentsPromise) {
			this._agentsPromise = this.getAgentsImpl().catch((error) => {
				this.logService.error('[CopilotCLIAgents] Failed to fetch custom agents', error);
				this._agentsPromise = undefined;
				return [];
			});
		}

		return this._agentsPromise.then(infos => infos.map(i => ({ agent: this.cloneAgent(i.agent), sourceUri: i.sourceUri, extensionId: i.extensionId })));
	}

	async getAgentsImpl(): Promise<readonly CLIAgentInfo[]> {
		const merged = new Map<string, CLIAgentInfo>();
		for (const agent of await this.getSDKAgents()) {
			merged.set(agent.name.toLowerCase(), {
				agent: this.cloneAgent(agent),
				sourceUri: URI.from({ scheme: 'copilotcli', path: `/agents/${agent.name}` }),
			});
		}
		for (const customAgent of await this.promptsService.getCustomAgents(CancellationToken.None)) {
			if (!isEnabledForCopilotCLI(customAgent)) {
				continue;
			}
			// Skip legacy .chatmode.md files — they are a deprecated format
			// and should not appear in the Copilot CLI agent list.
			if (customAgent.uri.path.toLowerCase().endsWith('.chatmode.md')) {
				continue;
			}
			const info = this.toCustomAgent(customAgent);
			if (!info) {
				continue;
			}
			merged.set(info.agent.name.toLowerCase(), info);
		}

		return [...merged.values()];
	}

	private async getSDKAgents(): Promise<Readonly<SweCustomAgent>[]> {
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 0) {
			return [];
		}

		const [auth, { getCustomAgents }] = await Promise.all([this.copilotCLISDK.getAuthInfo(), this.copilotCLISDK.getPackage()]);
		const workingDirectory = workspaceFolders[0];
		const agents = await getCustomAgents(auth, workingDirectory.fsPath, undefined, getCopilotLogger(this.logService));
		return agents.map(agent => this.cloneAgent(agent));
	}

	private toCustomAgent(customAgent: vscode.ChatCustomAgent): CLIAgentInfo | undefined {
		const agentName = getAgentFileNameFromFilePath(customAgent.uri);
		const headerName = customAgent.name;
		const name = headerName === undefined || headerName === '' ? agentName : headerName;
		if (!name) {
			return undefined;
		}

		const tools = customAgent.tools?.filter(tool => !!tool) ?? [];
		const model = customAgent.model?.[0];

		return {
			agent: {
				name,
				displayName: name,
				description: customAgent.description ?? '',
				tools: tools.length > 0 ? tools : null,
				prompt: async () => {
					const pf = await this.promptsService.parseFile(customAgent.uri, CancellationToken.None);
					return pf.body?.getContent() ?? '';
				},
				disableModelInvocation: customAgent.disableModelInvocation ?? false,
				...(model ? { model } : {}),
			},
			sourceUri: customAgent.uri,
			extensionId: customAgent.extensionId,
		};
	}

	private cloneAgent(agent: SweCustomAgent): SweCustomAgent {
		return {
			...agent,
			tools: agent.tools ? [...agent.tools] : agent.tools
		};
	}
}

export function getAgentFileNameFromFilePath(filePath: URI): string {
	const nameFromFile = basename(filePath);
	const lowerName = nameFromFile.toLowerCase();
	const indexOfAgentMd = lowerName.indexOf('.agent.md');
	if (indexOfAgentMd > 0) {
		return nameFromFile.substring(0, indexOfAgentMd);
	}
	const indexOfChatmodeMd = lowerName.indexOf('.chatmode.md');
	if (indexOfChatmodeMd > 0) {
		return nameFromFile.substring(0, indexOfChatmodeMd);
	}
	return nameFromFile;
}


/**
 * Service interface to abstract dynamic import of the Copilot CLI SDK for easier unit testing.
 * Tests can provide a mock implementation returning a stubbed SDK shape.
 */
export interface ICopilotCLISDK {
	readonly _serviceBrand: undefined;
	getPackage(): Promise<typeof import('@github/copilot/sdk')>;
	getAuthInfo(): Promise<NonNullable<SessionOptions['authInfo']>>;
	/**
	 * @deprecated
	 */
	getRequestId(sdkRequestId: string): RequestDetails['details'] | undefined;
}

type RequestDetails = { details: { requestId: string; toolIdEditMap: Record<string, string> }; createdDateTime: number };
export class CopilotCLISDK implements ICopilotCLISDK {
	declare _serviceBrand: undefined;
	private requestMap: Record<string, RequestDetails> = {};
	private _ensureShimsPromise?: Promise<void>;
	private _initializeLogger = new Lazy<Promise<void>>(() => this.initLogger());
	constructor(
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@IEnvService private readonly envService: IEnvService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IAuthenticationService private readonly authentService: IAuthenticationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.requestMap = this.extensionContext.workspaceState.get<Record<string, RequestDetails>>(COPILOT_CLI_REQUEST_MAP_KEY, {});
		this._ensureShimsPromise = this.ensureShims();
		this._initializeLogger.value.catch((error) => {
			this.logService.error('[CopilotCLISDK] Failed to initialize logger', error);
		});
	}

	/**
	 * @deprecated
	 */
	getRequestId(sdkRequestId: string): RequestDetails['details'] | undefined {
		return this.requestMap[sdkRequestId]?.details;
	}

	public async getPackage(): Promise<typeof import('@github/copilot/sdk')> {
		try {
			// Ensure the ripgrep shim exists before importing the SDK (required for CLI sessions)
			await this._ensureShimsPromise;
			return await import('@github/copilot/sdk');
		} catch (error) {
			this.logService.error(`[CopilotCLISession] Failed to load @github/copilot/sdk: ${error}`);
			throw error;
		}
	}

	private async initLogger() {
		const { logger } = await this.getPackage();
		logger.setLogWriter({
			outputPath: () => 'na',
			writeLog: (level, message) => {
				switch (level) {
					case 'error':
						this.logService.error(`[CopilotCLI] ${message}`);
						break;
					case 'warning':
						this.logService.warn(`[CopilotCLI] ${message}`);
						break;
					case 'info':
						this.logService.info(`[CopilotCLI] ${message}`);
						break;
					default:
						this.logService.debug(`[CopilotCLI] ${message}`);
				}
				return Promise.resolve();
			}
		});
	}

	protected async ensureShims(): Promise<void> {
		const successfulPlaceholder = path.join(this.extensionContext.extensionPath, 'node_modules', '@github', 'copilot', 'shims.txt');
		if (await checkFileExists(successfulPlaceholder)) {
			return;
		}
		await ensureRipgrepShim(this.extensionContext.extensionPath, this.envService.appRoot, this.logService);
		await fs.writeFile(successfulPlaceholder, 'Shims created successfully');
	}

	public async getAuthInfo(): Promise<NonNullable<SessionOptions['authInfo']>> {
		// Check if proxy URL is configured - if so, skip client-side token validation
		// as the proxy will handle authentication server-side.
		// matching the auth info set during session creation in copilotcliSessionService.
		const overrideProxyUrl = this.configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl);

		if (overrideProxyUrl) {
			this.logService.info('[CopilotCLISession] Proxy URL configured, skipping client-side token validation');
			return {
				type: 'hmac',
				hmac: 'empty',
				host: 'https://github.com',
				copilotUser: {
					endpoints: {
						api: overrideProxyUrl
					}
				}
			};
		}

		const copilotToken = await this.authentService.getGitHubSession('any', { silent: true });
		return {
			type: 'token',
			token: copilotToken?.accessToken ?? '',
			host: 'https://github.com'
		};
	}
}


export function isWelcomeView(workspaceService: IWorkspaceService) {
	return workspaceService.getWorkspaceFolders().length === 0;
}

async function checkFileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch (error) {
		return false;
	}
}

export function isEnabledForCopilotCLI(customization: { sessionTypes?: readonly string[] }): boolean {
	const sessionTypes = customization.sessionTypes;
	return sessionTypes === undefined || sessionTypes.includes('copilotcli') || false;
}

