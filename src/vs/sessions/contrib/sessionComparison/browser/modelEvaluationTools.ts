/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { createCommandUri, escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { getSessionWorkspaceProperties, readSessionIsolation } from '../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isModelComparisonSupported } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerPresentation.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { isAgentHostProvider } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { createSessionComparisonHarness } from '../../../../workbench/contrib/sessions/browser/sessionComparisonConfiguration.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession } from '../../../../workbench/services/sessions/common/session.js';
import { getSessionComparisonChat, getSessionComparisonWorkspaceError, ISessionComparison, ISessionComparisonService, IStartSessionComparisonOptions, COMPARE_AGENTS_ENABLED_SETTING, COMPARE_AGENTS_TOOLS_ENABLED_SETTING, SESSION_COMPARISON_MAX_ATTEMPTS, SESSION_COMPARISON_MIN_ATTEMPTS, SessionComparisonLaunchError, SessionComparisonParticipantRole } from '../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionComparisonConstants.js';
import { getManifestSessionStatus, ReadSessionComparisonTool } from './sessionComparisonTool.js';

type EvaluationToolName = 'getComparisonModels' | 'createModelComparison' | 'listModelComparisons' | 'readModelComparison';

const selectionSchema: IJSONSchema = {
	type: 'object',
	properties: {
		sessionTypeId: { type: 'string', description: 'Exact harness/session type from getComparisonModels.' },
		modelId: { type: 'string', description: 'Exact provider-local fixed model ID from getComparisonModels.' },
		modelConfiguration: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } },
	},
	required: ['sessionTypeId', 'modelId'],
	additionalProperties: false,
};
const workspaceModeSchema: IJSONSchema = { type: 'string', enum: ['caller', 'folderless'], description: 'Use the calling chat workspace (default), or explicitly request independent folderless chats.' };
const definitions: Record<EvaluationToolName, { displayName: string; description: string; schema: IJSONSchema }> = {
	getComparisonModels: {
		displayName: localize('evaluation.models', "Get Comparison Models"),
		description: 'Discover the fixed models and supported configurations available for a model comparison on this chat\'s host and workspace. Use these exact sessionTypeId and modelId pairs in createModelComparison; display names and IDs from other hosts are not interchangeable. This does not create sessions.',
		schema: { type: 'object', properties: { workspaceMode: workspaceModeSchema }, additionalProperties: false },
	},
	createModelComparison: {
		displayName: localize('evaluation.create', "Create Model Comparison"),
		description: 'Launch one scenario against two to ten fixed model configurations for a model evaluation. Use getComparisonModels first. This creates isolated worktrees on the calling chat\'s host and project, or independent folderless chats when requested, and inherits the calling chat\'s permissions without elevation. An optional Judge evaluates terminal attempts; a configured Synthesizer remains user-initiated and requires a Judge. For folderless comparisons, the Judge compares responses and synthesis combines them into a new answer. Returns launch outcomes and a comparison ID, not finished model results; retain that exact comparisonId and use readModelComparison to retrieve this run\'s results later. Keep comparisonId internal unless the user explicitly requests it; refer to comparisons by title in user-facing replies. The tool result already provides an Open Comparison action for the user. Use listModelComparisons to recover IDs for comparisons started by this chat. Comparison participants cannot launch further comparisons. Follow tool approval; after cancellation or an uncertain launch, list existing comparisons before considering another call. Do not retry a denied request or poll continuously.',
		schema: {
			type: 'object',
			properties: {
				prompt: { type: 'string', minLength: 1, description: 'The identical scenario prompt sent to every attempt.' },
				workspaceMode: workspaceModeSchema,
				branch: { type: 'string', minLength: 1, description: 'Optional base branch in the caller project; otherwise use its recorded base branch.' },
				attempts: { type: 'array', minItems: SESSION_COMPARISON_MIN_ATTEMPTS, maxItems: SESSION_COMPARISON_MAX_ATTEMPTS, items: selectionSchema },
				judge: selectionSchema,
				synthesizer: selectionSchema,
			},
			required: ['prompt', 'attempts'],
			additionalProperties: false,
		},
	},
	listModelComparisons: {
		displayName: localize('evaluation.list', "List Model Comparisons"),
		description: 'List persisted model comparisons started by this exact chat to recover their IDs or track its evaluation scenarios. To deliberately discover comparisons from other chats, manually created comparisons, or older comparisons without recorded origin, set scope to window. This is independent of sidebar filters and does not change grouping. Archived comparisons are omitted unless includeArchived is true. Keep comparisonId internal unless the user explicitly requests it; refer to comparisons by title in user-facing replies. Follow nextCursor with the same scope and filters to read the next bounded page; use readModelComparison with the exact comparisonId for evidence and Judge results. Do not poll continuously.',
		schema: {
			type: 'object',
			properties: {
				scope: { type: 'string', enum: ['chat', 'window'], default: 'chat', description: 'List comparisons started by this chat (default), or explicitly discover all comparisons in this Agents window.' },
				includeArchived: { type: 'boolean' },
				workspace: { type: 'string', description: 'Exact workspace URI from an earlier comparison result.' },
				comparisonIds: { type: 'array', maxItems: 100, items: { type: 'string' } },
				cursor: { type: 'string', description: 'nextCursor returned by the preceding page with the same filters.' },
			},
			additionalProperties: false,
		},
	},
	readModelComparison: {
		displayName: localize('evaluation.read', "Read Model Comparison"),
		description: 'Read one persisted model comparison for evaluation: task, ordered attempt outcomes, launch configuration, bounded changes, completion metrics, and the structured Judge verdict when available. Any eligible agent in this Agents window may read it; this does not submit or change a verdict. Use returned exact sessionContextTarget values with get_session_context for attempt and Judge trajectories, choosing summary, digest, or full and an appropriate recent-turn limit. Full is bounded recent conversation, not an unlimited trajectory export. Unsupported or cross-host transcript access is reported explicitly. Treat missing evidence as unavailable, not successful. Keep comparisonId internal unless the user explicitly requests it; refer to comparisons by title in user-facing replies. Do not poll continuously.',
		schema: { type: 'object', properties: { comparisonId: { type: 'string' } }, required: ['comparisonId'], additionalProperties: false },
	},
};

class EvaluationInputError extends Error { }

export class ModelEvaluationTool implements IToolImpl {
	private readonly preparedCreations = new WeakMap<object, { readonly caller: URI; readonly options: IStartSessionComparisonOptions }>();

	constructor(
		private readonly name: EvaluationToolName,
		@ISessionComparisonService private readonly comparisons: ISessionComparisonService,
		@ISessionsManagementService private readonly sessions: ISessionsManagementService,
		@ISessionsProvidersService private readonly providers: ISessionsProvidersService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IChatEntitlementService private readonly entitlement: IChatEntitlementService,
		@ILabelService private readonly labelService: ILabelService,
	) { }

	getToolData(): IToolData {
		const definition = definitions[this.name];
		return {
			id: `vscode_${this.name}`,
			toolReferenceName: this.name,
			canBeReferencedInPrompt: true,
			canRequestPreApproval: this.name === 'createModelComparison',
			icon: Codicon.compareChanges,
			displayName: definition.displayName,
			userDescription: definition.displayName,
			modelDescription: definition.description,
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${COMPARE_AGENTS_ENABLED_SETTING}`, true), ContextKeyExpr.equals(`config.${COMPARE_AGENTS_TOOLS_ENABLED_SETTING}`, true)),
			runsInWorkspace: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: definition.schema,
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation> {
		this.checkEnabled();
		if (token.isCancellationRequested) {
			throw new EvaluationInputError('Comparison tool invocation was cancelled.');
		}
		const prepared: IPreparedToolInvocation = { invocationMessage: definitions[this.name].displayName };
		if (this.name !== 'createModelComparison') {
			return prepared;
		}
		const caller = this.caller(context.originatingChatResource ?? context.chatSessionResource);
		const store = new DisposableStore();
		let options: IStartSessionComparisonOptions;
		try {
			options = await this.prepareCreation(record(context.parameters), caller, store, token);
		} finally {
			store.dispose();
		}
		this.preparedCreations.set(context.parameters, { caller: caller.chat.resource, options });
		const participants = [
			...options.attempts.map((attempt, index) => ({ role: localize('evaluation.confirm.attempt', "Attempt {0}", index + 1), harness: attempt.harness })),
			...(options.judgeHarness ? [{ role: localize('evaluation.confirm.judge', "Judge"), harness: options.judgeHarness }] : []),
			...(options.synthesisHarness ? [{ role: localize('evaluation.confirm.synthesizer', "Synthesizer (On Request)"), harness: options.synthesisHarness }] : []),
		];
		const sharedPermission = participants.every(participant => participant.harness.permissionLabel === participants[0].harness.permissionLabel)
			? participants[0].harness.permissionLabel : undefined;
		const message = new MarkdownString();
		const appendDetail = (label: string, value: string) => {
			message.appendMarkdown('**').appendText(label).appendMarkdown('** ').appendMarkdown(escapeMarkdownSyntaxTokens(value)).appendMarkdown('  \n');
		};
		appendDetail(localize('evaluation.confirm.workspace', "Workspace:"), options.workspace
			? this.labelService.getUriLabel(options.workspace)
			: localize('evaluation.confirm.noWorkspace', "No workspace"));
		if (options.branch) {
			appendDetail(localize('evaluation.confirm.branch', "Base Branch:"), options.branch);
		}
		message.appendMarkdown('\n');
		for (const { role, harness } of participants) {
			message.appendMarkdown('- **').appendText(role).appendMarkdown(':** ')
				.appendMarkdown(escapeMarkdownSyntaxTokens(localize('evaluation.confirm.model', "{0} ({1})", harness.modelLabel, harness.label)));
			if (sharedPermission === undefined && harness.permissionLabel !== undefined) {
				message.appendMarkdown(escapeMarkdownSyntaxTokens(localize('evaluation.confirm.participantPermission', " - {0}", harness.permissionLabel)));
			}
			message.appendMarkdown('\n');
		}
		message.appendMarkdown('\n');
		if (sharedPermission !== undefined) {
			appendDetail(localize('evaluation.confirm.permissions', "Permissions:"), localize('evaluation.confirm.inheritedPermission', "{0} (inherited from this chat)", sharedPermission));
		} else {
			message.appendMarkdown(escapeMarkdownSyntaxTokens(localize('evaluation.confirm.inheritedPermissions', "Permissions are inherited from this chat."))).appendMarkdown('\n');
		}
		message.appendMarkdown('\n').appendMarkdown(escapeMarkdownSyntaxTokens(options.workspace
			? localize('evaluation.confirm.worktrees', "Each attempt runs in a separate worktree.")
			: localize('evaluation.confirm.folderless', "Each attempt runs in an independent chat with no workspace.")));
		message.appendMarkdown('\n\n**').appendText(localize('evaluation.confirm.scenario', "Scenario")).appendMarkdown('**\n\n')
			.appendText(options.prompt);
		return {
			...prepared,
			confirmationMessages: { title: localize('evaluation.confirm.title', "Create Model Comparison?"), message },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const store = new DisposableStore();
		try {
			this.checkEnabled();
			if (token.isCancellationRequested) {
				throw new EvaluationInputError('Comparison tool invocation was cancelled.');
			}
			const input = record(invocation.parameters);
			if (this.name === 'listModelComparisons') {
				return result(this.list(input, invocation.originatingChatResource ?? invocation.context?.sessionResource));
			}
			const caller = this.caller(invocation.originatingChatResource ?? invocation.context?.sessionResource);
			switch (this.name) {
				case 'getComparisonModels': {
					const { provider, workspace, types } = await this.creationContext(input, caller, store, token);
					return result({
						workspace: workspace?.toString(),
						providerId: provider.id,
						harnesses: types.map(type => ({
							sessionTypeId: type.id,
							label: type.label,
							permissions: provider.getComparisonPermissionOptionForSession?.(caller.session.sessionId, type.id, caller.chat.resource),
							models: provider.getModelsSnapshotForCreation?.(workspace, type.id).models.filter(isModelComparisonSupported).map(model => ({
								modelId: model.identifier,
								label: model.metadata.name,
								configurationSchema: provider.supportsModelConfigurationForCreation ? model.metadata.configurationSchema : undefined,
							})),
						})),
					});
				}
				case 'createModelComparison': {
					const options = await this.prepareCreation(input, caller, store, token);
					const prepared = this.preparedCreations.get(invocation.parameters);
					this.preparedCreations.delete(invocation.parameters);
					if (!prepared || !isEqual(prepared.caller, caller.chat.resource) || creationSignature(prepared.options) !== creationSignature(options)) {
						throw new EvaluationInputError('Comparison configuration changed after preparation. Review and approve a new launch.');
					}
					const comparison = await this.comparisons.startComparison(options, token);
					const output = result({ ...this.summary(comparison), participants: this.participants(comparison, caller.session) });
					output.toolResultMessage = new MarkdownString('', { isTrusted: { enabledCommands: [OPEN_SESSION_COMPARISON_COMMAND_ID] } })
						.appendText(localize('evaluation.create.result', "Started model comparison."))
						.appendText(' ')
						.appendLink(createCommandUri(OPEN_SESSION_COMPARISON_COMMAND_ID, comparison.id).toString(), localize('evaluation.create.open', "Open Comparison"));
					return output;
				}
				case 'readModelComparison': {
					const comparison = typeof input.comparisonId === 'string' ? this.comparisons.getComparison(input.comparisonId) : undefined;
					if (!comparison) {
						throw new EvaluationInputError('Unknown comparisonId. Use listModelComparisons to discover comparisons.');
					}
					const reader = new ReadSessionComparisonTool(this.comparisons, this.sessions);
					return result({
						...this.summary(comparison),
						...reader.getManifest(comparison, caller.session, true),
						participants: this.participants(comparison, caller.session),
					});
				}
			}
		} catch (error) {
			if (error instanceof SessionComparisonLaunchError) {
				return {
					...result({
						error: error.message,
						participants: error.participants.map(participant => ({
							...participant, sessionResource: participant.sessionResource?.toString(), chatResource: participant.chatResource?.toString(),
						})),
					}),
					toolResultError: error.message,
				};
			}
			if (error instanceof EvaluationInputError) {
				return { content: [{ kind: 'text', value: error.message }], toolResultError: error.message };
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	private checkEnabled(): void {
		if (this.configuration.getValue<boolean>(COMPARE_AGENTS_ENABLED_SETTING) !== true
			|| this.configuration.getValue<boolean>(COMPARE_AGENTS_TOOLS_ENABLED_SETTING) !== true
			|| this.configuration.getValue<boolean>('chat.disableAIFeatures') === true || this.entitlement.sentiment.hidden) {
			throw new EvaluationInputError('Model comparison tools are disabled.');
		}
	}

	private caller(resource: URI | undefined): { session: ISession; chat: IChat } {
		const caller = resource && this.sessions.getSessionForChatResource(resource);
		if (!caller) {
			throw new EvaluationInputError('The calling chat is unavailable.');
		}
		return caller;
	}

	private async creationContext(input: Record<string, unknown>, caller: { session: ISession; chat: IChat }, store: DisposableStore, token: CancellationToken, selectedTypes?: ReadonlySet<string>) {
		if (input.workspaceMode !== undefined && input.workspaceMode !== 'caller' && input.workspaceMode !== 'folderless') {
			throw new EvaluationInputError('workspaceMode must be caller or folderless.');
		}
		const provider = this.providers.getProvider(caller.session.providerId, caller.session.sessionId);
		if (!provider || !isAgentHostProvider(provider) || provider.environment.isConnected?.get() === false
			|| !provider.supportsPermissionsForCreation || !provider.getModelsSnapshotForCreation
			|| provider.isDevContainerRequested?.(caller.session.sessionId)) {
			throw new EvaluationInputError('The calling host cannot create model comparisons.');
		}
		store.add(await provider.acquireSessionConfig(caller.session.sessionId, caller.chat.resource, token));
		const sourceWorkspace = caller.chat.workspace.get();
		const folderless = input.workspaceMode === 'folderless' || (!sourceWorkspace && caller.session.isQuickChat?.get() === true);
		const workspace = folderless ? undefined : sourceWorkspace?.folders[0]?.root;
		if (!folderless && (!workspace || sourceWorkspace?.folders.length !== 1)) {
			throw new EvaluationInputError('The calling chat must have one resolved project workspace, or request folderless mode.');
		}
		if (provider.isSessionConfigResolving(caller.session.sessionId, caller.chat.resource).get()) {
			throw new EvaluationInputError('The calling chat configuration is still resolving. Retry after it becomes available.');
		}
		const candidates = (workspace ? provider.getSessionTypes(workspace) : provider.sessionTypes)
			.filter(type => (!selectedTypes || selectedTypes.has(type.id)) && (workspace ? type.supportsWorktreeConfiguration : provider.supportsQuickChats));
		const types = (await Promise.all(candidates.map(async type => {
			if (workspace) {
				const config = await provider.resolveSessionConfigForCreation(workspace, type.id, token);
				const isolation = getSessionWorkspaceProperties(config.schema).isolation;
				if (!isolation?.schema.enum?.some(value => readSessionIsolation(isolation, value) === 'worktree')) {
					return undefined;
				}
			}
			return type;
		}))).filter(type => type !== undefined);
		this.checkEnabled();
		const currentWorkspace = caller.chat.workspace.get();
		if (token.isCancellationRequested || currentWorkspace?.folders.length !== sourceWorkspace?.folders.length
			|| !isEqual(currentWorkspace?.folders[0]?.root, sourceWorkspace?.folders[0]?.root)) {
			throw new EvaluationInputError('The comparison context changed or was cancelled. Retry with the current calling chat.');
		}
		return { provider, workspace, types };
	}

	private async prepareCreation(input: Record<string, unknown>, caller: { session: ISession; chat: IChat }, store: DisposableStore, token: CancellationToken): Promise<IStartSessionComparisonOptions> {
		if (this.comparisons.comparisons.get().some(comparison => this.comparisons.getParticipantForChat(comparison.id, caller.chat.resource))) {
			throw new EvaluationInputError('Comparison participants cannot launch further comparisons.');
		}
		if (typeof input.prompt !== 'string' || !input.prompt.trim() || !Array.isArray(input.attempts)
			|| input.attempts.length < SESSION_COMPARISON_MIN_ATTEMPTS || input.attempts.length > SESSION_COMPARISON_MAX_ATTEMPTS) {
			throw new EvaluationInputError('Provide a nonempty prompt and between two and ten attempts.');
		}
		const selectedTypes = new Set<string>();
		for (const selection of [...input.attempts, input.judge, input.synthesizer]) {
			if (selection !== undefined) {
				const type = record(selection).sessionTypeId;
				if (typeof type !== 'string') {
					throw new EvaluationInputError('A selected harness is unavailable. Use getComparisonModels again.');
				}
				selectedTypes.add(type);
			}
		}
		const { provider, workspace, types } = await this.creationContext(input, caller, store, token, selectedTypes);
		if ((!workspace && input.branch !== undefined)
			|| (input.synthesizer !== undefined && input.judge === undefined)) {
			throw new EvaluationInputError('Folderless comparisons cannot use a branch. A Synthesizer requires a Judge.');
		}
		const repository = caller.chat.workspace.get()?.folders[0]?.gitRepository;
		const branch = workspace ? input.branch ?? repository?.baseBranchName ?? repository?.branchName : undefined;
		if (workspace && (typeof branch !== 'string' || getSessionComparisonWorkspaceError(branch.trim()) || repository?.hasGitRemote !== true)) {
			throw new EvaluationInputError('Workspace comparisons require a Git repository with a base branch, commits, and a remote.');
		}
		const resolve = (value: unknown) => {
			const selection = record(value);
			const type = types.find(type => type.id === selection.sessionTypeId);
			const snapshot = type && typeof selection.modelId === 'string'
				? provider.getModelsSnapshotForCreation!(workspace, type.id, selection.modelId) : undefined;
			if (!type || snapshot?.desiredModelResolution.kind !== 'available') {
				throw new EvaluationInputError('A selected model is unavailable. Use getComparisonModels again.');
			}
			const configuration: Record<string, string | number | boolean | null> = {};
			for (const [key, value] of Object.entries(selection.modelConfiguration === undefined ? {} : record(selection.modelConfiguration))) {
				if (!(value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) {
					throw new EvaluationInputError('Model configuration values must be finite JSON primitives.');
				}
				configuration[key] = value;
			}
			if (Object.keys(configuration).length && provider.supportsModelConfigurationForCreation !== true) {
				throw new EvaluationInputError('The selected agent cannot scope model configuration to a new comparison.');
			}
			return createSessionComparisonHarness(provider.id, type, snapshot.desiredModelResolution.model, configuration,
				provider.getComparisonPermissionOptionForSession?.(caller.session.sessionId, type.id, caller.chat.resource));
		};
		return {
			originatingChatResource: caller.chat.resource,
			workspace,
			prompt: input.prompt,
			branch: typeof branch === 'string' ? branch.trim() : undefined,
			attempts: input.attempts.map(selection => ({ id: generateUuid(), harness: resolve(selection) })),
			judgeHarness: input.judge === undefined ? undefined : resolve(input.judge),
			synthesisHarness: input.synthesizer === undefined ? undefined : resolve(input.synthesizer),
		};
	}

	private summary(comparison: ISessionComparison) {
		const judge = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
		const judgeChat = judge && getSessionComparisonChat(judge, judge.sessionResource ? this.sessions.getSession(judge.sessionResource) : undefined);
		return {
			comparisonId: comparison.id, title: comparison.title, createdAt: comparison.createdAt,
			originatingChatResource: comparison.originatingChatResource?.toString(),
			workspace: comparison.workspace?.toString(), sessionResource: comparison.sessionResource?.toString(),
			groupId: comparison.groupId, launching: comparison.launching === true,
			archivedAt: comparison.archivedAt, cancelledAt: comparison.cancelledAt,
			judge: comparison.verdict ? 'completed' : !comparison.judgeHarness ? 'notConfigured' : judge?.launchError ? 'error' : judgeChat ? getManifestSessionStatus(judgeChat.status.get()) : 'pending',
		};
	}

	private participants(comparison: ISessionComparison, caller: ISession) {
		let attemptNumber = 0;
		return comparison.participants.map(participant => {
			const session = participant.sessionResource ? this.sessions.getSession(participant.sessionResource) : undefined;
			const chat = getSessionComparisonChat(participant, session);
			const sessionContextTarget = chat && session?.providerId === caller.providerId ? this.sessions.getSessionContextReference(chat.resource) : undefined;
			return {
				role: participant.role,
				attemptNumber: participant.role === SessionComparisonParticipantRole.Attempt ? ++attemptNumber : undefined,
				status: getManifestSessionStatus(chat?.status.get()), launchError: participant.launchError, completion: participant.completion,
				harness: participant.harness,
				sessionResource: participant.sessionResource?.toString(), chatResource: chat?.resource.toString(),
				sessionContextTarget,
				sessionContextUnavailableReason: sessionContextTarget ? undefined : 'This chat is unavailable or its host does not support transcript access from the caller.',
			};
		});
	}

	private list(input: Record<string, unknown>, originatingChatResource: URI | undefined) {
		if (input.scope !== undefined && input.scope !== 'chat' && input.scope !== 'window'
			|| input.includeArchived !== undefined && typeof input.includeArchived !== 'boolean'
			|| input.workspace !== undefined && typeof input.workspace !== 'string'
			|| input.cursor !== undefined && typeof input.cursor !== 'string'
			|| input.comparisonIds !== undefined && (!Array.isArray(input.comparisonIds) || input.comparisonIds.length > 100 || !input.comparisonIds.every(id => typeof id === 'string'))) {
			throw new EvaluationInputError('Invalid comparison list filters.');
		}
		if (input.scope !== 'window' && !originatingChatResource) {
			throw new EvaluationInputError('The calling chat is unavailable. Use scope "window" to discover comparisons across this Agents window.');
		}
		const ids = Array.isArray(input.comparisonIds) ? input.comparisonIds : undefined;
		const workspace = typeof input.workspace === 'string' ? URI.parse(input.workspace) : undefined;
		const comparisons = this.comparisons.comparisons.get()
			.filter(comparison => (input.scope === 'window' || isEqual(comparison.originatingChatResource, originatingChatResource))
				&& (input.includeArchived === true || comparison.archivedAt === undefined)
				&& (!workspace || isEqual(comparison.workspace, workspace)) && (!ids || ids.includes(comparison.id)))
			.slice().sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
		const cursorIndex = input.cursor === undefined ? -1 : comparisons.findIndex(comparison => comparison.id === input.cursor);
		if (input.cursor !== undefined && cursorIndex < 0) {
			throw new EvaluationInputError('The comparison list cursor is no longer available. Restart listing with the same filters.');
		}
		const page = comparisons.slice(cursorIndex + 1, cursorIndex + 26);
		return {
			comparisons: page.map(comparison => ({
				...this.summary(comparison),
				attempts: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).map(participant => ({
					model: participant.harness.modelLabel, launchError: participant.launchError,
					status: getManifestSessionStatus(getSessionComparisonChat(participant, participant.sessionResource ? this.sessions.getSession(participant.sessionResource) : undefined)?.status.get()),
				})),
			})),
			nextCursor: cursorIndex + 1 + page.length < comparisons.length ? page.at(-1)?.id : undefined,
		};
	}
}

export class ModelEvaluationToolContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.modelEvaluationTools';
	constructor(
		@ILanguageModelToolsService tools: ILanguageModelToolsService,
		@IInstantiationService instantiation: IInstantiationService,
		@IConfigurationService configuration: IConfigurationService,
	) {
		super();
		const registrations = this._register(new DisposableStore());
		const enabled = observableConfigValue(COMPARE_AGENTS_ENABLED_SETTING, false, configuration);
		const toolsEnabled = observableConfigValue(COMPARE_AGENTS_TOOLS_ENABLED_SETTING, false, configuration);
		this._register(autorun(reader => {
			registrations.clear();
			if (!enabled.read(reader) || !toolsEnabled.read(reader)) {
				return;
			}
			const toolSet = registrations.add(tools.createToolSet(ToolDataSource.Internal, 'vscode_modelEvaluation', 'modelEvaluation', {
				icon: Codicon.compareChanges, description: localize('evaluation.toolset', "Evaluate models across comparison scenarios"), hiddenInToolsPicker: true,
			}));
			for (const name of Object.keys(definitions) as EvaluationToolName[]) {
				const tool = instantiation.createInstance(ModelEvaluationTool, name);
				const data = tool.getToolData();
				registrations.add(tools.registerTool(data, tool));
				registrations.add(toolSet.addTool(data));
			}
		}));
	}
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new EvaluationInputError('Expected an object for comparison tool input.');
	}
	return value as Record<string, unknown>;
}

function result(value: object): IToolResult {
	return { content: [{ kind: 'text', value: JSON.stringify(value) }] };
}

function creationSignature(options: IStartSessionComparisonOptions): string {
	return JSON.stringify({ ...options, workspace: options.workspace?.toString(), attempts: options.attempts.map(attempt => attempt.harness) });
}
