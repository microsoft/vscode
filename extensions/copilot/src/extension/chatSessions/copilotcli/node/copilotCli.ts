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
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { basename } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ensureNodePtyShim } from './nodePtyShim';
import { ensureRipgrepShim } from './ripgrepShim';
import { resolveAppModulePathSync } from './appNodeModules';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { formatTokenCount, getAutoModelDescription, getModelCapabilitiesDescription, getReasoningEffortDescription, normalizeTokenPrices } from '../../../conversation/common/languageModelAccess';

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
	readonly priceCategory?: string;
	readonly inputCost?: number;
	readonly outputCost?: number;
	readonly cacheCost?: number;
	readonly cacheWriteCost?: number;
	readonly longContextInputCost?: number;
	readonly longContextOutputCost?: number;
	readonly longContextCacheCost?: number;
	readonly longContextCacheWriteCost?: number;
	readonly defaultContextMax?: number;
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
	readonly maxContextWindowTokens: number;
	readonly supportsVision?: boolean;
	readonly supportsReasoningEffort?: boolean;
	readonly defaultReasoningEffort?: string;
	readonly supportedReasoningEfforts?: string[];
	readonly warningText?: Record<string, string>;
}

export interface ICopilotCLIModels {
	readonly _serviceBrand: undefined;
	resolveModel(modelId: string): Promise<string | undefined>;
	getDefaultModel(): Promise<string | undefined>;
	setDefaultModel(modelId: string | undefined): Promise<void>;
	getModels(): Promise<CopilotCLIModelInfo[]>;
	registerLanguageModelChatProvider(lm: typeof vscode['lm']): void;
}

export function matchesCopilotCLIModel(model: Pick<CopilotCLIModelInfo, 'id' | 'name'>, modelId: string): boolean {
	const normalizedModelId = modelId.trim().toLowerCase();
	return model.id.trim().toLowerCase() === normalizedModelId || model.name.trim().toLowerCase() === normalizedModelId;
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
			// Auth changed which means models could've changed.
			this._onDidChange.fire();
			this._fetchAndCacheModels();
		}));
	}

	private _fetchAndCacheModels(): void {
		if (!this._authenticationService.hasCopilotTokenSource) {
			this.logService.info('[CopilotCLIModels] Skipping model fetch since there is no Copilot token source');
			return;
		}
		const availableModels = this._availableModels = this._getAvailableModels();
		availableModels.then(models => {
			// Bail out if a newer fetch has superseded this one (e.g. auth changed mid-flight).
			if (this._availableModels !== availableModels) {
				return;
			}
			// Don't overwrite a previously-good list with an empty result from a transient auth state.
			if (models.length === 0 && this._resolvedModelInfos?.length) {
				this._availableModels = undefined;
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
		return models.find(m => matchesCopilotCLIModel(m, modelId))?.id;
	}
	public async getDefaultModel() {
		// First item in the list is always the default model (SDK sends the list ordered based on default preference)
		const models = await this.getModels();
		if (!models.length) {
			return;
		}
		const defaultModel = models[0];
		const preferredModelId = this.extensionContext.globalState.get<string>(COPILOT_CLI_MODEL_MEMENTO_KEY, defaultModel.id)?.trim()?.toLowerCase() ?? defaultModel.id;

		return models.find(m => matchesCopilotCLIModel(m, preferredModelId))?.id ?? defaultModel.id;
	}

	public async setDefaultModel(modelId: string | undefined): Promise<void> {
		await this.extensionContext.globalState.update(COPILOT_CLI_MODEL_MEMENTO_KEY, modelId);
	}

	public async getModels(): Promise<CopilotCLIModelInfo[]> {
		if (!this._authenticationService.hasCopilotTokenSource) {
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
			return models.map(model => {
				const pricing = normalizeTokenPrices(model.billing?.token_prices);
				return {
					id: model.id,
					name: model.name,
					multiplier: model.billing?.multiplier,
					priceCategory: model.model_picker_price_category,
					inputCost: pricing?.default.inputPrice,
					outputCost: pricing?.default.outputPrice,
					cacheCost: pricing?.default.cachePrice,
					cacheWriteCost: pricing?.default.cacheWritePrice,
					longContextInputCost: pricing?.longContext?.inputPrice,
					longContextOutputCost: pricing?.longContext?.outputPrice,
					longContextCacheCost: pricing?.longContext?.cachePrice,
					longContextCacheWriteCost: pricing?.longContext?.cacheWritePrice,
					defaultContextMax: pricing?.default.contextMax,
					maxInputTokens: model.capabilities.limits.max_prompt_tokens,
					maxOutputTokens: model.capabilities.limits.max_output_tokens,
					maxContextWindowTokens: model.capabilities.limits.max_context_window_tokens,
					supportsVision: model.capabilities.supports.vision,
					supportsReasoningEffort: model.capabilities.supports.reasoningEffort,
					defaultReasoningEffort: model.defaultReasoningEffort,
					supportedReasoningEfforts: model.supportedReasoningEfforts,
				} satisfies CopilotCLIModelInfo;
			});
		} catch (ex) {
			this.logService.error(`[CopilotCLISession] Failed to fetch models`, ex);
			// Clear cached promise so subsequent calls retry instead of
			// permanently returning an empty list after a transient failure.
			this._availableModels = undefined;
			return [];
		}
	}

	public registerLanguageModelChatProvider(lm: typeof vscode['lm']): void {
		const provider: vscode.LanguageModelChatProvider = {
			onDidChangeLanguageModelChatInformation: this._onDidChange.event,
			provideLanguageModelChatInformation: async (_options, _token) => {
				const models = this._resolvedModelInfos ?? [];
				if (models.length) {
					return models;
				}
				const autoModelEnabled = this.configurationService.getConfig(ConfigKey.Advanced.CLIAutoModelEnabled);
				return autoModelEnabled ? [buildAutoModel()] : [];
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
				pricing: multiplier,
				priceCategory: model.priceCategory,
				inputCost: model.inputCost,
				outputCost: model.outputCost,
				cacheCost: model.cacheCost,
				cacheWriteCost: model.cacheWriteCost,
				longContextInputCost: model.longContextInputCost,
				longContextOutputCost: model.longContextOutputCost,
				longContextCacheCost: model.longContextCacheCost,
				longContextCacheWriteCost: model.longContextCacheWriteCost,
				multiplierNumeric: model.multiplier,
				isUserSelectable: true,
				...buildConfigurationSchema(model, isReasoningEffortEnabled),
				capabilities: {
					imageInput: model.supportsVision,
					toolCalling: true
				},
				targetChatSessionType: 'copilotcli',
				warningText: model.warningText,
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
		tooltip: getAutoModelDescription(),
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

export const COPILOT_CLI_CONTEXT_SIZE_PROPERTY = 'contextSize';

function buildConfigurationSchema(modelInfo: CopilotCLIModelInfo, isReasoningEffortEnabled: boolean): { configurationSchema?: vscode.LanguageModelConfigurationSchema } {
	const properties: Record<string, NonNullable<vscode.LanguageModelConfigurationSchema['properties']>[string]> = {};

	// Reasoning effort config
	if (isReasoningEffortEnabled) {
		const effortLevels = modelInfo.supportedReasoningEfforts ?? [];
		if (effortLevels.length > 0) {
			const defaultEffort = modelInfo.defaultReasoningEffort;
			properties[COPILOT_CLI_REASONING_EFFORT_PROPERTY] = {
				type: 'string',
				title: l10n.t('Thinking Effort'),
				enum: effortLevels,
				enumItemLabels: effortLevels.map(level => level.charAt(0).toUpperCase() + level.slice(1)),
				enumDescriptions: effortLevels.map(getReasoningEffortDescription),
				default: defaultEffort,
				group: 'navigation',
			};
		}
	}

	// Context size config — only when CAPI provides a default context max,
	// indicating a meaningful distinction between default and long context tiers.
	const defaultContextMax = modelInfo.defaultContextMax;
	const fullMax = modelInfo.maxInputTokens ?? modelInfo.maxContextWindowTokens;
	if (defaultContextMax && defaultContextMax < fullMax) {
		const hasLongContextSurcharge = modelInfo.longContextInputCost !== undefined
			|| modelInfo.longContextOutputCost !== undefined;
		if (hasLongContextSurcharge) {
			properties[COPILOT_CLI_CONTEXT_SIZE_PROPERTY] = {
				type: 'number',
				title: l10n.t('Context Size'),
				enum: [defaultContextMax, fullMax],
				enumItemLabels: [formatTokenCount(defaultContextMax), formatTokenCount(fullMax)],
				enumDescriptions: [
					l10n.t('Default'),
					l10n.t('Longer sessions'),
				],
				default: defaultContextMax,
				group: 'tokens',
			};
		} else {
			// No surcharge — show only the long context option as a non-switchable indicator.
			properties[COPILOT_CLI_CONTEXT_SIZE_PROPERTY] = {
				type: 'number',
				title: l10n.t('Context Size'),
				enum: [fullMax],
				enumItemLabels: [formatTokenCount(fullMax)],
				enumDescriptions: [
					l10n.t('Longer sessions'),
				],
				default: fullMax,
				group: 'tokens',
			};
		}
	}

	if (Object.keys(properties).length === 0) {
		return {};
	}
	return { configurationSchema: { properties } };
}

/** An agent with its source URI preserved for UI and cross-referencing. */
export interface CLIAgentInfo {
	readonly agent: Readonly<SweCustomAgent>;
	/** File URI for prompt-file agents, synthetic `copilotcli:` URI for SDK-only agents. */
	readonly sourceUri: URI;
	readonly source: vscode.ChatResourceSource;
	readonly extensionId: string | undefined;
	readonly pluginUri: URI | undefined;
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
		return agentId;
	}

	async resolveAgent(agentId: string): Promise<SweCustomAgent | undefined> {
		for (const customAgent of await this.promptsService.getCustomAgents(CancellationToken.None)) {
			if (customAgent.enabled && isEnabledForCopilotCLI(customAgent) && agentId === customAgent.uri.toString()) {
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

		return this._agentsPromise.then(infos => infos.map(i => ({ agent: this.cloneAgent(i.agent), sourceUri: i.sourceUri, source: i.source, extensionId: i.extensionId, pluginUri: i.pluginUri })));
	}

	async getAgentsImpl(): Promise<readonly CLIAgentInfo[]> {
		const merged = new Map<string, CLIAgentInfo>();
		const knownAgents = new ResourceSet();
		const customAgents = await this.promptsService.getCustomAgents(CancellationToken.None);
		const hiddenOrInvalidAgentUris = new ResourceSet();
		const validCustomAgents = customAgents.filter(customAgent => {
			if (!customAgent.enabled || !isEnabledForCopilotCLI(customAgent)) {
				hiddenOrInvalidAgentUris.add(customAgent.uri);
				return false;
			}
			// Skip legacy .chatmode.md files — they are a deprecated format
			// and should not appear in the Copilot CLI agent list.
			if (customAgent.uri.path.toLowerCase().endsWith('.chatmode.md')) {
				hiddenOrInvalidAgentUris.add(customAgent.uri);
				return false;
			}
			return true;
		});

		for (const customAgent of validCustomAgents) {
			if (knownAgents.has(customAgent.uri)) {
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
			source: customAgent.source,
			extensionId: customAgent.extensionId,
			pluginUri: customAgent.pluginUri
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
			// Ensure the node-pty and ripgrep shims exist before importing the SDK (required for CLI sessions)
			await this._ensureShimsPromise;
			// The SDK's sandbox auto-detection looks for `mxc-bin/<arch>/wxc-exec.exe` (and the
			// Linux/macOS equivalents) under `MXC_BIN_DIR`. VS Code core ships the MXC
			// sandbox binaries at `<appRoot>/node_modules/@microsoft/mxc-sdk/bin/<arch>/`
			// (or `node_modules.asar.unpacked/...` in a packaged build), so point
			// `MXC_BIN_DIR` there. The @github/copilot package's own `mxc-bin/` is excluded
			// from the product build (see build/.moduleignore).
			process.env['MXC_BIN_DIR'] = resolveAppModulePathSync(this.envService.appRoot, '@microsoft', 'mxc-sdk', 'bin');

			// On Linux the MXC bubblewrap sandbox backend does not forward a PTY into
			// the container, so the CLI's default PTY-backed interactive shell can
			// never start bash under the sandbox: the inner shell sees a non-tty
			// stdin, runs non-interactively, reads EOF and exits immediately, which
			// surfaces as "Failed to start bash process". Force the CLI's pipe-based
			// spawn shell backend (`SHELL_SPAWN_BACKEND`), which runs each command as
			// a one-shot child process and works correctly under bubblewrap. The SDK
			// runs in-process here, so we set the flag via the environment variable it
			// reads (`COPILOT_CLI_ENABLED_FEATURE_FLAGS`) — mirroring the agent host's
			// CopilotAgent. This becomes a no-op once the bundled CLI defaults the
			// spawn backend on for all of Linux.
			if (process.platform === 'linux') {
				const flags = new Set((process.env['COPILOT_CLI_ENABLED_FEATURE_FLAGS'] ?? '').split(',').map(f => f.trim()).filter(Boolean));
				flags.add('SHELL_SPAWN_BACKEND');
				process.env['COPILOT_CLI_ENABLED_FEATURE_FLAGS'] = [...flags].join(',');
			}

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
		await Promise.all([
			ensureRipgrepShim(this.extensionContext.extensionPath, this.envService.appRoot, this.logService),
			ensureNodePtyShim(this.extensionContext.extensionPath, this.envService.appRoot, this.logService),
		]);
		await fs.writeFile(successfulPlaceholder, 'Shims created successfully');
	}

	public async getAuthInfo(): Promise<NonNullable<SessionOptions['authInfo']>> {
		// Check if proxy URL is configured - if so, skip client-side token validation
		// as the proxy will handle authentication server-side.
		// matching the auth info set during session creation in copilotcliSessionService.
		const overrideProxyUrl = this.configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl);

		if (overrideProxyUrl) {
			// Only respect this from user (global) settings — a malicious workspace
			// setting could downgrade auth from HMAC to token.
			const authTypeInspect = this.configurationService.inspectConfig(ConfigKey.Shared.DebugOverrideAuthType);
			const authType = authTypeInspect?.globalValue ?? 'hmac';
			this.logService.info(`[CopilotCLISession] Proxy URL configured (authType=${authType}), skipping client-side token validation`);
			const copilotUser = {
				endpoints: {
					api: overrideProxyUrl,
					// `proxy` must also point at the mock server so that SDK
					// calls to /copilot_internal/v2/token and /models/session
					// are routed to the mock instead of the real GitHub API.
					proxy: overrideProxyUrl,
				}
			};
			if (authType === 'token') {
				return { type: 'token', token: 'mock-token', host: 'https://github.com', copilotUser };
			}
			return { type: 'hmac', hmac: 'empty', host: 'https://github.com', copilotUser };
		}

		const { resolveAuthInfoFromToken } = await this.getPackage();
		const copilotToken = await this.authentService.getGitHubSession('any', { silent: true });
		const userInfo = copilotToken ? await resolveAuthInfoFromToken(copilotToken?.accessToken) : undefined;
		if (!userInfo) {
			return {
				type: 'token',
				token: copilotToken?.accessToken ?? '',
				host: 'https://github.com'
			};
		}
		return userInfo;
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

/**
 * Maps a user-selected numeric context size to the SDK's context tier.
 * Returns `'long_context'` when the selected size exceeds the default context
 * max, `'default'` when it is within the default tier, or `undefined` when
 * no context size was provided or the model has no tiered pricing.
 */
export function resolveContextTier(contextSize: unknown, modelInfo: CopilotCLIModelInfo | undefined): 'default' | 'long_context' | undefined {
	if (typeof contextSize !== 'number' || !modelInfo?.defaultContextMax) {
		return undefined;
	}
	return contextSize > modelInfo.defaultContextMax ? 'long_context' : 'default';
}
