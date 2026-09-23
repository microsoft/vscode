/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/channels-chat/state.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AutomationTarget, IAutomationDescriptor, IAutomationRun, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { type AutomationCatalogueState, AutomationSessionTemplateAuthorityError, AutomationUnavailableError, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IToolImpl, IToolInvocation, IToolResult, ToolProgress } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, ISession, ISessionType, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ConfigureAutomationTool, ConfigureAutomationToolId, DeleteAutomationTool, DeleteAutomationToolId, ListAutomationsTool, ListAutomationsToolId, RunAutomationTool, RunAutomationToolId } from '../../browser/automationTools.js';

const FOLDER = URI.parse('file:///workspace');
const SESSION_RESOURCE = URI.parse('agent-session://local/session');
const CHAT_RESOURCE = URI.parse('agent-chat://local/chat');
const NOW = '2026-01-01T00:00:00.000Z';
const progress: ToolProgress = { report: () => { } };

function isTelemetryData(data: unknown): data is Record<string, unknown> {
	return typeof data === 'object' && data !== null;
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName && isTelemetryData(data)) {
			this.events.push({ name: eventName, data });
		}
	}
}

function createConfigureAutomationTool(
	automationService: IAutomationService,
	sessionsManagementService: ISessionsManagementService,
	configurationService: TestConfigurationService,
	telemetryService: ITelemetryService = NullTelemetryService,
): ConfigureAutomationTool {
	return new ConfigureAutomationTool(automationService, sessionsManagementService, configurationService, telemetryService);
}

function createAutomation(overrides?: Partial<IAutomationDescriptor>): IAutomationDescriptor {
	return {
		id: 'automation-1',
		name: 'Daily review',
		prompt: 'Review the repository',
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
		target: {
			kind: 'workspace',
			folderUri: FOLDER,
			providerId: 'local-agent-host',
			sessionTypeId: 'copilot',
			isolation: { kind: 'default' },
		},
		modelId: 'gpt-test',
		mode: 'agent',
		permissionLevel: 'default',
		enabled: true,
		createdAt: NOW,
		updatedAt: NOW,
		nextRunAt: '2026-01-02T09:00:00.000Z',
		...overrides,
	};
}

class FakeAutomationService extends mock<IAutomationService>() {
	override readonly catalogueState = observableValue<AutomationCatalogueState>(this, 'ready');
	override readonly automations = observableValue<readonly IAutomationDescriptor[]>(this, []);
	override readonly runs = observableValue<readonly IAutomationRun[]>(this, []);
	readonly created: ICreateAutomationOptions[] = [];
	readonly updated: Array<{ readonly id: string; readonly patch: IUpdateAutomationOptions }> = [];
	readonly deleted: string[] = [];
	available = true;
	creationAllowed = true;
	updatesAllowed = true;

	override canCreateAutomation(): boolean { return this.available && this.creationAllowed; }
	override canRunAutomation(): boolean { return this.available; }
	override canUpdateAutomation(): boolean { return this.available && this.updatesAllowed; }
	override canDeleteAutomation(): boolean { return this.available; }

	constructor(automations: readonly IAutomationDescriptor[] = []) {
		super();
		this.automations.set(automations, undefined);
	}

	override getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.automations.get().find(automation => automation.id === id);
	}

	override runsFor(automationId: string) {
		return constObservable(this.runs.get().filter(run => run.automationId === automationId));
	}

	override getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this.runs.get().find(run => run.automationId === automationId && (run.status === 'pending' || run.status === 'running'));
	}

	addRun(run: IAutomationRun): void {
		this.runs.set([run, ...this.runs.get()], undefined);
	}

	override async createAutomation(options: ICreateAutomationOptions): Promise<IAutomationDescriptor> {
		this.created.push(options);
		return {
			...options,
			id: 'created-automation',
			enabled: options.enabled ?? true,
			createdAt: NOW,
			updatedAt: NOW,
		};
	}

	override async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		this.updated.push({ id, patch });
		const existing = this.getAutomation(id);
		assert.ok(existing);
		return {
			...existing,
			name: patch.name ?? existing.name,
			prompt: patch.prompt ?? existing.prompt,
			schedule: patch.schedule ?? existing.schedule,
			target: patch.target ?? existing.target,
			sessionTemplate: patch.sessionTemplate === null ? undefined : patch.sessionTemplate ?? existing.sessionTemplate,
			modelId: patch.modelId === null ? undefined : patch.modelId ?? existing.modelId,
			mode: patch.mode === null ? undefined : patch.mode ?? existing.mode,
			permissionLevel: patch.permissionLevel === null ? undefined : patch.permissionLevel ?? existing.permissionLevel,
			enabled: patch.enabled ?? existing.enabled,
			updatedAt: NOW,
		};
	}

	override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor): Promise<IGuardedAutomationUpdateResult> {
		const current = this.getAutomation(id);
		if (!current || editableAutomationKey(current) !== editableAutomationKey(expected)) {
			return { kind: 'conflict', current };
		}
		return { kind: 'updated', automation: await this.updateAutomation(id, patch) };
	}

	override async deleteAutomation(id: string): Promise<void> {
		this.deleted.push(id);
		this.automations.set(this.automations.get().filter(automation => automation.id !== id), undefined);
	}
}

class RecordingAutomationRunner extends mock<IAutomationRunner>() {
	readonly calls: Array<{
		readonly automationId: string;
		readonly cancelled: boolean;
	}> = [];
	readonly tokens: CancellationToken[] = [];
	whenDispatched: Promise<void> = Promise.resolve();
	whenCompleted: Promise<void> = Promise.resolve();
	runStatus: IAutomationRun['status'] = 'running';
	/** When set, dispatch reports this outcome instead of starting a session. */
	notStarted: (IAutomationRunDispatch & { kind: 'notStarted' }) | undefined;

	constructor(private readonly automationService: FakeAutomationService) {
		super();
	}

	override runOnce(automation: IAutomationDescriptor, token: CancellationToken = CancellationToken.None): IAutomationRunOperation {
		this.calls.push({
			automationId: automation.id,
			cancelled: token.isCancellationRequested,
		});
		this.tokens.push(token);
		const whenDispatched = this.whenDispatched.then<IAutomationRunDispatch>(() => {
			// Mirrors the real runner: the atomic claim decides who gets to dispatch.
			const activeRun = this.automationService.getActiveRunFor(automation.id);
			if (activeRun) {
				return { kind: 'alreadyRunning', activeRun };
			}
			if (this.notStarted) {
				return this.notStarted;
			}
			const sessionResource = SESSION_RESOURCE;
			const run: IAutomationRun = {
				id: 'run-1',
				automationId: automation.id,
				status: this.runStatus,
				trigger: 'manual',
				sessionResource,
				startedAt: NOW,
			};
			this.automationService.addRun(run);
			return { kind: 'started', run, sessionResource };
		});
		return {
			whenDispatched,
			whenCompleted: Promise.all([whenDispatched, this.whenCompleted]).then(() => undefined),
		};
	}
}

function editableAutomationKey(automation: IAutomationDescriptor): string {
	return JSON.stringify({
		name: automation.name,
		prompt: automation.prompt,
		schedule: automation.schedule,
		target: automation.target.kind === 'workspace'
			? { ...automation.target, folderUri: automation.target.folderUri.toString() }
			: automation.target,
		sessionTemplate: automation.sessionTemplate,
		modelId: automation.modelId,
		mode: automation.mode,
		permissionLevel: automation.permissionLevel,
		enabled: automation.enabled,
	});
}

class FakeSessionsManagementService extends mock<ISessionsManagementService>() {
	beforeGetFolderSessionTypes: (() => void) | undefined;

	constructor(
		private readonly session: ISession | undefined,
		private readonly resolveFromChatResource = false,
		private readonly folderSessionTypes: readonly IProviderSessionType[] = [],
		private readonly quickChatSessionTypes: readonly IProviderSessionType[] = [],
	) {
		super();
	}

	override getSession(): ISession | undefined {
		return this.resolveFromChatResource ? undefined : this.session;
	}

	override getSessionForChatResource(): { session: ISession; chat: IChat } | undefined {
		return this.resolveFromChatResource && this.session
			? { session: this.session, chat: upcastPartial<IChat>({ resource: CHAT_RESOURCE }) }
			: undefined;
	}

	override getSessionTypesForFolder(): IProviderSessionType[] {
		this.beforeGetFolderSessionTypes?.();
		return [...this.folderSessionTypes];
	}

	override getQuickChatSessionTypes(): IProviderSessionType[] {
		return [...this.quickChatSessionTypes];
	}
}

function createConfigurationService(enabled = true): TestConfigurationService {
	const configurationService = new TestConfigurationService();
	configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, enabled);
	return configurationService;
}

function createSession(options?: { readonly quickChat?: boolean; readonly workspace?: URI }): ISession {
	const workspace = options?.workspace === undefined
		? undefined
		: upcastPartial<ISessionWorkspace>({ uri: options.workspace });
	return upcastPartial<ISession>({
		resource: SESSION_RESOURCE,
		providerId: 'local-agent-host',
		sessionType: 'copilot',
		workspace: constObservable(workspace),
		isQuickChat: constObservable(options?.quickChat === true),
	});
}

function providerSessionType(providerId: string, sessionTypeId: string, supportsWorktreeConfiguration = false): IProviderSessionType {
	return {
		providerId,
		sessionType: upcastPartial<ISessionType>({ id: sessionTypeId, supportsWorktreeConfiguration }),
	};
}

async function invoke(tool: IToolImpl, parameters: Record<string, unknown>, sessionResource = SESSION_RESOURCE, token = CancellationToken.None, selectedCustomButton?: string, toolSpecificData?: IToolInvocation['toolSpecificData']): Promise<IToolResult> {
	return tool.invoke({
		callId: 'call-1',
		toolId: 'tool-1',
		parameters,
		context: { sessionResource },
		selectedCustomButton,
		toolSpecificData,
	}, async () => 0, progress, token);
}

function getText(result: IToolResult): string {
	const part = result.content[0];
	if (!part || part.kind !== 'text') {
		assert.fail('Expected a text tool result.');
	}
	return part.value;
}

suite('AutomationTools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tool data is gated by AI and Automations context keys', () => {
		const automationService = new FakeAutomationService();
		const configurationService = createConfigurationService();
		const runData = new RunAutomationTool(
			automationService,
			new RecordingAutomationRunner(automationService),
			configurationService,
		).getToolData();
		const listData = new ListAutomationsTool(automationService, configurationService).getToolData();
		const deleteData = new DeleteAutomationTool(automationService, configurationService).getToolData();
		const configureData = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			configurationService,
		).getToolData();

		const serialize = (tool: typeof listData) => tool.when?.serialize() ?? '';
		assert.deepStrictEqual([listData, configureData, runData, deleteData].map(tool => ({
			id: tool.id,
			referenceName: tool.toolReferenceName,
			aiEnabledGate: serialize(tool).includes(ChatContextKeys.enabled.key),
			automationsEnabledGate: serialize(tool).includes(ChatAutomationsEnabledContext.key),
			runsInWorkspace: tool.runsInWorkspace,
		})), [
			{
				id: ListAutomationsToolId,
				referenceName: 'listAutomations',
				aiEnabledGate: true,
				automationsEnabledGate: true,
				runsInWorkspace: false,
			},
			{
				id: ConfigureAutomationToolId,
				referenceName: 'configureAutomation',
				aiEnabledGate: true,
				automationsEnabledGate: true,
				runsInWorkspace: false,
			},
			{
				id: RunAutomationToolId,
				referenceName: 'runAutomation',
				aiEnabledGate: true,
				automationsEnabledGate: true,
				runsInWorkspace: false,
			},
			{
				id: DeleteAutomationToolId,
				referenceName: 'deleteAutomation',
				aiEnabledGate: true,
				automationsEnabledGate: true,
				runsInWorkspace: false,
			},
		]);
	});

	test('configureAutomation tool data requires explicit creation intent', () => {
		const modelDescription = createConfigureAutomationTool(
			new FakeAutomationService(),
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		).getToolData().modelDescription ?? '';

		assert.deepStrictEqual({
			requiresExplicitAutomationIntent: modelDescription.includes('only when the user explicitly asks for an automation'),
			allowsRecurringScheduleIntent: modelDescription.includes('or for a prompt to run on a recurring schedule'),
			excludesMonitoringRequests: modelDescription.includes('Do not infer that intent from requests merely to monitor, watch, follow, or keep something'),
			usesProviderTemplate: modelDescription.includes('Use "sessionTemplate" for provider-owned Model, Agent, Mode, Approvals'),
			rejectsMixedAliases: modelDescription.includes('Do not combine it with the legacy "modelId", "mode", or "permissionLevel" aliases'),
		}, {
			requiresExplicitAutomationIntent: true,
			allowsRecurringScheduleIntent: true,
			excludesMonitoringRequests: true,
			usesProviderTemplate: true,
			rejectsMixedAliases: true,
		});
	});

	test('listAutomations returns stable IDs and editable fields', async () => {
		const sessionTemplate = {
			modelId: 'gpt-test',
			agent: { uri: 'file:///agents/reviewer.agent.md' },
			config: {
				mode: 'agent',
				autoApprove: 'default',
				providerOption: { enabled: true },
			},
		};
		const automation = createAutomation({ sessionTemplate });
		const tool = new ListAutomationsTool(new FakeAutomationService([automation]), createConfigurationService());

		const result = await invoke(tool, {});

		assert.deepStrictEqual(JSON.parse(getText(result)), {
			catalogueState: 'ready',
			automations: [{
				id: 'automation-1',
				name: 'Daily review',
				prompt: 'Review the repository',
				schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
				target: {
					kind: 'workspace',
					folderUri: 'file:///workspace',
					providerId: 'local-agent-host',
					sessionTypeId: 'copilot',
					isolation: { kind: 'default' },
				},
				sessionTemplate,
				enabled: true,
				createdAt: NOW,
				updatedAt: NOW,
				lastRunAt: null,
				nextRunAt: '2026-01-02T09:00:00.000Z',
			}],
		});
	});

	test('listAutomations describes when its catalogue is complete', () => {
		const description = new ListAutomationsTool(new FakeAutomationService(), createConfigurationService()).getToolData().modelDescription ?? '';

		assert.deepStrictEqual({
			reportsState: description.includes('catalogueState'),
			definesComplete: description.includes('only "ready" means the list is complete'),
			warnsAboutFalseEmpty: description.includes('never interpret an empty non-ready result as no configured automations'),
		}, { reportsState: true, definesComplete: true, warnsAboutFalseEmpty: true });
	});

	for (const catalogueState of ['loading', 'unavailable', 'error'] as const) {
		test(`listAutomations preserves available rows in an incomplete ${catalogueState} catalogue`, async () => {
			const automationService = new FakeAutomationService();
			automationService.catalogueState.set(catalogueState, undefined);
			const tool = new ListAutomationsTool(automationService, createConfigurationService());
			const empty = await invoke(tool, {});
			const sessionTemplate = { modelId: 'provider-model', config: { providerOption: true } };
			automationService.automations.set([createAutomation({ sessionTemplate })], undefined);
			const populated = await invoke(tool, {});
			const populatedContent = JSON.parse(getText(populated));

			assert.deepStrictEqual({
				empty: JSON.parse(getText(empty)),
				emptyMessage: empty.toolResultMessage,
				populated: {
					state: populatedContent.catalogueState,
					ids: populatedContent.automations.map((automation: { id: string }) => automation.id),
					sessionTemplate: populatedContent.automations[0].sessionTemplate,
				},
				populatedMessage: populated.toolResultMessage,
			}, {
				empty: { catalogueState, automations: [] },
				emptyMessage: 'Listed 0 available automations; catalogue is incomplete',
				populated: { state: catalogueState, ids: ['automation-1'], sessionTemplate },
				populatedMessage: 'Listed 1 available automations; catalogue is incomplete',
			});
		});
	}

	test('listAutomations emits flat aliases only for legacy rows', async () => {
		const automation = createAutomation();
		const tool = new ListAutomationsTool(new FakeAutomationService([automation]), createConfigurationService());

		const result = await invoke(tool, {});
		const listed = JSON.parse(getText(result)).automations[0];

		assert.deepStrictEqual({
			sessionTemplate: listed.sessionTemplate,
			modelId: listed.modelId,
			mode: listed.mode,
			permissionLevel: listed.permissionLevel,
		}, {
			sessionTemplate: undefined,
			modelId: 'gpt-test',
			mode: 'agent',
			permissionLevel: 'default',
		});
	});

	test('runAutomation confirms and starts a manual run', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		const runner = new RecordingAutomationRunner(automationService);
		const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
		const parameters = { automationId: automation.id };
		const invocationCancellation = new CancellationTokenSource();

		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'call-1',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		const message = prepared.confirmationMessages?.message;
		const result = await invoke(tool, parameters, SESSION_RESOURCE, invocationCancellation.token);
		invocationCancellation.cancel();
		const runTokenCancelledAfterDispatch = runner.tokens[0]?.isCancellationRequested;
		invocationCancellation.dispose();

		assert.deepStrictEqual({
			confirmationTitle: prepared.confirmationMessages?.title,
			confirmationMessage: typeof message === 'string' ? message : message?.value,
			calls: runner.calls,
			runTokenCancelledAfterDispatch,
			result: JSON.parse(getText(result)),
		}, {
			confirmationTitle: 'Run Automation?',
			confirmationMessage: 'Run **Daily review** (`automation-1`) now? This starts a new agent session using the automation\'s configured prompt and permissions.',
			calls: [{
				automationId: 'automation-1',
				cancelled: false,
			}],
			runTokenCancelledAfterDispatch: false,
			result: {
				status: 'started',
				automation: { id: 'automation-1', name: 'Daily review' },
				run: {
					id: 'run-1',
					status: 'running',
					sessionResource: SESSION_RESOURCE.toString(),
				},
			},
		});
	});

	test('runAutomation reports the active run when the runner declines to claim it', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		automationService.addRun({
			id: 'active-run',
			automationId: automation.id,
			status: 'running',
			trigger: 'manual',
			sessionResource: SESSION_RESOURCE,
			startedAt: NOW,
		});
		const runner = new RecordingAutomationRunner(automationService);
		const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
		const parameters = { automationId: automation.id };

		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'call-1',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		const result = await invoke(tool, parameters);

		assert.deepStrictEqual({
			confirmation: prepared.confirmationMessages,
			// The runner owns the claim, so the tool still dispatches and lets it decline.
			runsCreated: automationService.runs.get().length,
			result: JSON.parse(getText(result)),
		}, {
			confirmation: undefined,
			runsCreated: 1,
			result: {
				status: 'already_running',
				automation: { id: 'automation-1', name: 'Daily review' },
				run: {
					id: 'active-run',
					status: 'running',
					sessionResource: SESSION_RESOURCE.toString(),
				},
			},
		});
	});

	test('runAutomation reports when dispatch does not start a run', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		const runner = new RecordingAutomationRunner(automationService);
		runner.notStarted = { kind: 'notStarted', reason: 'targetUnavailable' };
		const tool = new RunAutomationTool(automationService, runner, createConfigurationService());

		const result = await invoke(tool, { automationId: automation.id });

		assert.deepStrictEqual({
			error: result.toolResultError,
			calls: runner.calls.length,
		}, {
			error: 'Automation "automation-1" did not start. Its configured agent is unavailable.',
			calls: 1,
		});
	});

	test('deleteAutomation provides Delete and Cancel confirmation options', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		const tool = new DeleteAutomationTool(automationService, createConfigurationService());
		const parameters = { automationId: automation.id };

		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'call-1',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		const message = prepared?.confirmationMessages?.message;
		const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, 'delete');

		assert.deepStrictEqual({
			confirmationTitle: prepared?.confirmationMessages?.title,
			confirmationMessage: typeof message === 'string' ? message : message?.value,
			allowAutoConfirm: prepared?.confirmationMessages?.allowAutoConfirm,
			options: prepared?.confirmationMessages?.customOptions,
			deleted: automationService.deleted,
			automations: automationService.automations.get(),
			result: JSON.parse(getText(result)),
		}, {
			confirmationTitle: 'Delete Automation?',
			confirmationMessage: 'Delete **Daily review** (`automation-1`)? Its saved configuration and run history will be permanently removed. Runs already in flight will continue.',
			allowAutoConfirm: undefined,
			options: [
				{ id: 'delete', label: 'Delete', kind: ConfirmationOptionKind.Approve },
				{ id: 'cancel', label: 'Cancel', kind: ConfirmationOptionKind.Deny },
			],
			deleted: ['automation-1'],
			automations: [],
			result: {
				status: 'deleted',
				automation: { id: 'automation-1', name: 'Daily review' },
			},
		});
	});

	test('deleteAutomation rejects stale IDs before confirmation', async () => {
		const automationService = new FakeAutomationService();
		const tool = new DeleteAutomationTool(automationService, createConfigurationService());
		const parameters = { automationId: 'missing' };

		await assert.rejects(
			tool.prepareToolInvocation!({
				parameters,
				toolCallId: 'call-1',
				chatSessionResource: SESSION_RESOURCE,
			}, CancellationToken.None),
			/Automation "missing" does not exist/,
		);
		const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, 'delete');

		assert.deepStrictEqual({
			error: result.toolResultError,
			deleted: automationService.deleted,
		}, {
			error: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
			deleted: [],
		});
	});

	test('deleteAutomation Cancel option makes no changes', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		const tool = new DeleteAutomationTool(automationService, createConfigurationService());

		const result = await invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, CancellationToken.None, 'cancel');

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			deleted: automationService.deleted,
			automations: automationService.automations.get(),
		}, {
			result: {
				status: 'cancelled',
				message: 'The automation was not deleted.',
			},
			deleted: [],
			automations: [automation],
		});
	});

	test('deleteAutomation runs without a custom button after approval', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		const tool = new DeleteAutomationTool(automationService, createConfigurationService());

		const result = await invoke(
			tool,
			{ automationId: automation.id },
			SESSION_RESOURCE,
			CancellationToken.None,
		);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			deleted: automationService.deleted,
			automations: automationService.automations.get(),
		}, {
			result: {
				status: 'deleted',
				automation: { id: automation.id, name: automation.name },
			},
			deleted: [automation.id],
			automations: [],
		});
	});

	test('deleteAutomation cancellation makes no changes', async () => {
		const automation = createAutomation();
		const automationService = new FakeAutomationService([automation]);
		const tokenSource = new CancellationTokenSource();
		tokenSource.cancel();
		const tool = new DeleteAutomationTool(automationService, createConfigurationService());

		const result = await invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, tokenSource.token, 'delete');
		tokenSource.dispose();

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			deleted: automationService.deleted,
			automations: automationService.automations.get(),
		}, {
			result: {
				status: 'cancelled',
				message: 'The automation was not deleted.',
			},
			deleted: [],
			automations: [automation],
		});
	});

	test('configureAutomation prepares normal create and update confirmations', async () => {
		const existing = createAutomation();
		const tool = createConfigureAutomationTool(
			new FakeAutomationService([existing]),
			new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
			createConfigurationService(),
		);
		const createPrepared = await tool.prepareToolInvocation!({
			parameters: {
				name: 'Morning review',
				prompt: 'Review open pull requests',
				schedule: { interval: 'daily' },
			},
			toolCallId: 'create-call',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		const updatePrepared = await tool.prepareToolInvocation!({
			parameters: { automationId: existing.id, name: 'Updated review' },
			toolCallId: 'update-call',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);

		assert.deepStrictEqual({
			create: {
				title: createPrepared.confirmationMessages?.title,
				message: typeof createPrepared.confirmationMessages?.message === 'string'
					? createPrepared.confirmationMessages.message
					: createPrepared.confirmationMessages?.message?.value,
				toolSpecificData: createPrepared.toolSpecificData,
			},
			update: {
				title: updatePrepared.confirmationMessages?.title,
				message: typeof updatePrepared.confirmationMessages?.message === 'string'
					? updatePrepared.confirmationMessages.message
					: updatePrepared.confirmationMessages?.message?.value,
				expectedId: updatePrepared.toolSpecificData?.kind === 'automationConfiguration'
					? updatePrepared.toolSpecificData.expectedAutomationId
					: undefined,
			},
		}, {
			create: {
				title: 'Create Automation?',
				message: 'Create the automation **Morning review**?',
				toolSpecificData: undefined,
			},
			update: {
				title: 'Update Automation?',
				message: 'Apply the proposed changes to **Daily review** (`automation-1`)?',
				expectedId: existing.id,
			},
		});
	});

	test('configureAutomation creates from the invoking chat target and returns clickable result data', async () => {
		const automationService = new FakeAutomationService();
		const target: AutomationTarget = {
			kind: 'quickChat',
			providerId: 'local-agent-host',
			sessionTypeId: 'copilot',
		};
		const schedule: IAutomationSchedule = { interval: 'daily', scheduleHour: 8, scheduleMinute: 30, scheduleDay: 1 };
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(createSession({ quickChat: true }), true),
			createConfigurationService(),
		);

		const result = await invoke(tool, {
			name: 'Morning review',
			prompt: 'Review open pull requests',
			schedule: { interval: 'daily', scheduleHour: 8, scheduleMinute: 30 },
			enabled: true,
		}, CHAT_RESOURCE);

		assert.deepStrictEqual({
			created: automationService.created,
			status: JSON.parse(getText(result)).status,
			toolSpecificData: result.toolSpecificData,
		}, {
			created: [{
				name: 'Morning review',
				prompt: 'Review open pull requests',
				schedule,
				target,
				enabled: true,
			}],
			status: 'created',
			toolSpecificData: {
				kind: 'automationConfigured',
				automationId: 'created-automation',
				automationName: 'Morning review',
				operation: 'created',
			},
		});
	});

	test('configureAutomation rejects a current session without an available Automation authority', async () => {
		const automationService = new FakeAutomationService();
		automationService.available = false;
		const tool = createConfigureAutomationTool(automationService, new FakeSessionsManagementService(createSession({ quickChat: true })), createConfigurationService());
		const result = await invoke(tool, { name: 'Review', prompt: 'Review changes', schedule: { interval: 'manual' } });
		assert.match(getText(result), /does not support automations/);
		assert.deepStrictEqual(automationService.created, []);
	});

	test('configureAutomation reports rejected cross-host edits without a success result', async () => {
		const automation = createAutomation();
		const automationService = new class extends FakeAutomationService {
			override async updateAutomationIfUnchanged(): Promise<IGuardedAutomationUpdateResult> {
				throw new AutomationUnavailableError('Duplicate the automation on the new host. The original continues scheduling until you disable it.');
			}
		}([automation]);
		const tool = createConfigureAutomationTool(automationService, new FakeSessionsManagementService(undefined, false, [providerSessionType('another-host', 'copilot')]), createConfigurationService());
		const result = await invoke(tool, { automationId: automation.id, target: { kind: 'workspace', folderUri: FOLDER.toString(), providerId: 'another-host', sessionTypeId: 'copilot' } });
		assert.match(getText(result), /original continues scheduling/);
		assert.deepStrictEqual({ created: automationService.created, updated: automationService.updated, original: automationService.getAutomation(automation.id) }, { created: [], updated: [], original: automation });
	});

	test('configureAutomation applies a partial guarded update and returns clickable result data', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);
		const parameters = {
			automationId: existing.id,
			name: 'Updated review',
			schedule: { scheduleMinute: 45 },
			modelId: null,
			mode: null,
			permissionLevel: null,
		};
		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'update-call',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);

		const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, undefined, prepared.toolSpecificData);

		assert.deepStrictEqual({
			updated: automationService.updated,
			status: JSON.parse(getText(result)).status,
			toolSpecificData: result.toolSpecificData,
		}, {
			updated: [{
				id: existing.id,
				patch: {
					name: 'Updated review',
					schedule: { ...existing.schedule, scheduleMinute: 45 },
					modelId: null,
					mode: null,
					permissionLevel: null,
				},
			}],
			status: 'updated',
			toolSpecificData: {
				kind: 'automationConfigured',
				automationId: existing.id,
				automationName: 'Updated review',
				operation: 'updated',
			},
		});
	});

	test('configureAutomation reports persisted, blocked, and failed outcomes without identifiers', async () => {
		const telemetryService = new TestTelemetryService();
		const sessionsManagementService = new FakeSessionsManagementService(createSession({ workspace: FOLDER }));
		const configurationService = createConfigurationService();
		await invoke(createConfigureAutomationTool(
			new FakeAutomationService(),
			sessionsManagementService,
			configurationService,
			telemetryService,
		), {
			name: 'Morning review',
			prompt: 'Review open pull requests',
			schedule: { interval: 'daily' },
		}, SESSION_RESOURCE);

		const cancellation = new CancellationTokenSource();
		cancellation.cancel();
		await invoke(createConfigureAutomationTool(
			new FakeAutomationService(),
			sessionsManagementService,
			configurationService,
			telemetryService,
		), {}, SESSION_RESOURCE, cancellation.token);

		const failingService = new class extends FakeAutomationService {
			override createAutomation(): Promise<IAutomationDescriptor> {
				throw new Error('storage unavailable');
			}
		}();
		await assert.rejects(invoke(createConfigureAutomationTool(
			failingService,
			sessionsManagementService,
			configurationService,
			telemetryService,
		), {
			name: 'Morning review',
			prompt: 'Review open pull requests',
			schedule: { interval: 'daily' },
		}, SESSION_RESOURCE), /storage unavailable/);

		assert.deepStrictEqual(telemetryService.events.map(event => ({ name: event.name, data: event.data })), [
			{ name: 'automation.configureOutcome', data: { operation: 'create', outcome: 'created' } },
			{ name: 'automation.configureOutcome', data: { operation: 'unknown', outcome: 'blocked' } },
			{ name: 'automation.configureOutcome', data: { operation: 'create', outcome: 'failed' } },
		]);
	});

	test('configureAutomation accepts a provider mode returned by listAutomations', async () => {
		const existing = createAutomation({ mode: 'autopilot' });
		const automationService = new FakeAutomationService([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);
		const parameters = {
			automationId: existing.id,
			mode: 'autopilot',
		};
		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'update-call',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);

		await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, undefined, prepared.toolSpecificData);

		assert.deepStrictEqual(automationService.updated, [{
			id: existing.id,
			patch: { mode: 'autopilot' },
		}]);
	});

	test('configureAutomation updates the complete provider session template', async () => {
		const existing = createAutomation({
			sessionTemplate: {
				modelId: 'old-model',
				config: { mode: 'interactive', providerOption: false },
			},
		});
		const automationService = new FakeAutomationService([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);
		const sessionTemplate = {
			modelId: 'new-model',
			modelConfiguration: { thinkingLevel: 'low', contextSize: 200_000, futureOption: null },
			agent: { uri: 'file:///agents/reviewer.agent.md' },
			config: {
				mode: 'plan',
				autoApprove: 'assisted',
				providerOption: { enabled: true },
			},
		};

		await invoke(tool, {
			automationId: existing.id,
			sessionTemplate,
		});

		assert.deepStrictEqual(automationService.updated, [{
			id: existing.id,
			patch: { sessionTemplate },
		}]);
	});

	test('listAutomations preserves model options for a configureAutomation round-trip', async () => {
		const sessionTemplate = { modelId: 'model', modelConfiguration: { thinkingLevel: 'low', futureOption: true } };
		const existing = createAutomation({ sessionTemplate });
		const automationService = new FakeAutomationService([existing]);
		const configurationService = createConfigurationService();
		const listed = await invoke(new ListAutomationsTool(automationService, configurationService), {});
		const returnedTemplate = JSON.parse(getText(listed)).automations[0].sessionTemplate;
		const tool = createConfigureAutomationTool(automationService, new FakeSessionsManagementService(undefined), configurationService);
		await invoke(tool, { automationId: existing.id, sessionTemplate: returnedTemplate });

		assert.deepStrictEqual(automationService.updated, [{ id: existing.id, patch: { sessionTemplate } }]);
	});

	test('configureAutomation validates and bounds model-specific configuration', async () => {
		const automationService = new FakeAutomationService();
		const tool = createConfigureAutomationTool(automationService, new FakeSessionsManagementService(undefined), createConfigurationService());
		const errors: IToolResult['toolResultError'][] = [];
		for (const sessionTemplate of [
			{ modelConfiguration: { thinkingLevel: 'low' } },
			{ modelId: 'model', modelConfiguration: { nested: { value: true } } },
			{ modelId: 'model', modelConfiguration: { value: Number.POSITIVE_INFINITY } },
			{ modelId: 'model', modelConfiguration: { value: 'x'.repeat(70_000) } },
			{ modelId: 'model', modelConfiguration: Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [index, null])) },
		]) {
			const result = await invoke(tool, {
				name: 'Invalid model configuration',
				prompt: 'Do not save',
				schedule: { interval: 'manual' },
				target: { kind: 'workspace', folderUri: FOLDER.toString() },
				sessionTemplate,
			});
			errors.push(result.toolResultError);
		}

		assert.deepStrictEqual({ errors, created: automationService.created }, {
			errors: [
				'"sessionTemplate.modelConfiguration" requires "sessionTemplate.modelId".',
				'"sessionTemplate.modelConfiguration" must contain only JSON primitive values.',
				'"sessionTemplate.modelConfiguration.value" must be JSON-safe.',
				'"sessionTemplate.modelConfiguration" must not exceed 65536 characters.',
				'"sessionTemplate.modelConfiguration" must not contain more than 10000 values.',
			],
			created: [],
		});
	});

	test('configureAutomation reports legacy alias updates to a canonical template as input errors', async () => {
		const existing = createAutomation({
			sessionTemplate: {
				modelId: 'model',
				config: { mode: 'interactive', autoApprove: 'default' },
			},
		});
		const automationService = new FakeAutomationService([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);

		const result = await invoke(tool, {
			automationId: existing.id,
			permissionLevel: 'autoApprove',
		});

		assert.deepStrictEqual({
			error: result.toolResultError,
			updates: automationService.updated,
		}, {
			error: 'Legacy "modelId", "mode", and "permissionLevel" aliases cannot update an automation with a canonical session template. Pass the complete updated "sessionTemplate" returned by listAutomations.',
			updates: [],
		});
	});

	test('configureAutomation surfaces authority changes detected during the guarded update', async () => {
		const existing = createAutomation();
		const automationService = new class extends FakeAutomationService {
			override async updateAutomationIfUnchanged(): Promise<IGuardedAutomationUpdateResult> {
				throw new AutomationSessionTemplateAuthorityError();
			}
		}([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);

		const result = await invoke(tool, {
			automationId: existing.id,
			permissionLevel: 'autoApprove',
		});

		assert.strictEqual(result.toolResultError, 'A canonical Automation session template cannot be updated through legacy configuration aliases.');
	});

	test('configureAutomation rejects editable changes made while awaiting approval', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);
		const parameters = { automationId: existing.id, name: 'Proposed name' };
		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'update-call',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		automationService.automations.set([
			{ ...existing, prompt: 'Changed in another window', updatedAt: '2026-01-01T00:01:00.000Z' },
		], undefined);

		const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, undefined, prepared.toolSpecificData);

		assert.deepStrictEqual({
			error: result.toolResultError,
			updated: automationService.updated,
		}, {
			error: 'Automation "automation-1" changed before the update was applied. Call listAutomations to refresh it before proposing new changes. No changes were made.',
			updated: [],
		});
	});

	test('configureAutomation permits runtime metadata changes while awaiting approval', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);
		const parameters = { automationId: existing.id, name: 'Proposed name' };
		const prepared = await tool.prepareToolInvocation!({
			parameters,
			toolCallId: 'update-call',
			chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		automationService.automations.set([{
			...existing,
			updatedAt: '2026-01-01T00:01:00.000Z',
			lastRunAt: '2026-01-01T00:01:00.000Z',
			nextRunAt: '2026-01-02T09:00:00.000Z',
		}], undefined);

		const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, undefined, prepared.toolSpecificData);

		assert.deepStrictEqual({
			status: JSON.parse(getText(result)).status,
			updated: automationService.updated,
		}, {
			status: 'updated',
			updated: [{ id: existing.id, patch: { name: 'Proposed name' } }],
		});
	});

	for (const target of [
		{ kind: 'workspace', folderUri: 'file:///another-workspace', providerId: 'local-agent-host', sessionTypeId: 'copilot', isolation: 'folder' },
		{ kind: 'workspace', folderUri: FOLDER.toString(), providerId: 'local-agent-host', sessionTypeId: 'claude', isolation: 'worktree', branch: 'main' },
		{ kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'claude' },
	]) {
		test(`configureAutomation updates ${target.kind}/${target.sessionTypeId} on an update-only host`, async () => {
			const existing = createAutomation();
			const automationService = new FakeAutomationService([existing]);
			automationService.creationAllowed = false;
			const candidates = [providerSessionType('local-agent-host', 'copilot', true), providerSessionType('local-agent-host', 'claude', true)];
			const tool = createConfigureAutomationTool(
				automationService, new FakeSessionsManagementService(undefined, false, candidates, candidates), createConfigurationService(),
			);
			const result = await invoke(tool, { automationId: existing.id, target });
			const [update] = automationService.updated;
			assert.deepStrictEqual({
				error: result.toolResultError,
				status: JSON.parse(getText(result)).status,
				updates: automationService.updated.length,
				creates: automationService.created.length,
				owner: update?.patch.target?.providerId,
				agent: update?.patch.target?.sessionTypeId,
				targetKind: update?.patch.target?.kind,
			}, {
				error: undefined, status: 'updated', updates: 1, creates: 0,
				owner: 'local-agent-host', agent: target.sessionTypeId, targetKind: target.kind,
			});
		});
	}

	test('configureAutomation rejects new definitions and unsupported edits on an update-only host', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		automationService.creationAllowed = false;
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(createSession({ quickChat: true }), false, [], [providerSessionType('local-agent-host', 'copilot')]),
			createConfigurationService(),
		);
		const created = await invoke(tool, { name: 'New', prompt: 'Review', schedule: { interval: 'manual' } });
		automationService.updatesAllowed = false;
		const updated = await invoke(tool, { automationId: existing.id, target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilot' } });
		assert.deepStrictEqual({
			creationRejected: created.toolResultError !== undefined,
			updateRejected: updated.toolResultError !== undefined,
			created: automationService.created, updated: automationService.updated,
		}, { creationRejected: true, updateRejected: true, created: [], updated: [] });
	});

	test('configureAutomation reports stale approval before target authority or availability failures', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		automationService.creationAllowed = false;
		const tool = createConfigureAutomationTool(automationService, new FakeSessionsManagementService(undefined), createConfigurationService());
		const parameters = {
			automationId: existing.id,
			target: { kind: 'quickChat', providerId: 'another-host', sessionTypeId: 'copilot' },
		};
		const prepared = await tool.prepareToolInvocation({
			parameters, toolCallId: 'update-call', chatSessionResource: SESSION_RESOURCE,
		}, CancellationToken.None);
		automationService.automations.set([{ ...existing, name: 'Changed elsewhere' }], undefined);
		const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, undefined, prepared.toolSpecificData);
		assert.match(getText(result), /changed before the update was applied/);
		assert.deepStrictEqual(automationService.updated, []);
	});

	test('configureAutomation validates explicit targets before writing', async () => {
		const automationService = new FakeAutomationService();
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(
				undefined,
				false,
				[providerSessionType('local-agent-host', 'copilot', false)],
			),
			createConfigurationService(),
		);

		const result = await invoke(tool, {
			name: 'Invalid worktree',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target: {
				kind: 'workspace',
				folderUri: FOLDER.toString(),
				providerId: 'local-agent-host',
				sessionTypeId: 'copilot',
				isolation: 'worktree',
				branch: 'main',
			},
		});

		assert.deepStrictEqual({
			error: result.toolResultError,
			created: automationService.created,
		}, {
			error: 'Session type "copilot" does not support worktree isolation.',
			created: [],
		});
	});

	test('configureAutomation rechecks cancellation immediately before writing', async () => {
		const automationService = new FakeAutomationService();
		const tokenSource = new CancellationTokenSource();
		tokenSource.cancel();
		const tool = createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
			createConfigurationService(),
		);

		const result = await invoke(tool, {
			name: 'Cancelled',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
		}, SESSION_RESOURCE, tokenSource.token);
		tokenSource.dispose();

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			created: automationService.created,
		}, {
			result: {
				status: 'cancelled',
				message: 'The automation change was cancelled. No changes were made.',
			},
			created: [],
		});
	});

	test('configureAutomation rechecks the feature setting immediately before writing', async () => {
		const automationService = new FakeAutomationService();
		const configurationService = createConfigurationService();
		const sessionsManagementService = new FakeSessionsManagementService(
			undefined,
			false,
			[providerSessionType('local-agent-host', 'copilot')],
		);
		sessionsManagementService.beforeGetFolderSessionTypes = () => configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
		const tool = createConfigureAutomationTool(automationService, sessionsManagementService, configurationService);

		const result = await invoke(tool, {
			name: 'Disabled',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target: {
				kind: 'workspace',
				folderUri: FOLDER.toString(),
				providerId: 'local-agent-host',
				sessionTypeId: 'copilot',
				isolation: 'default',
			},
		});

		assert.deepStrictEqual({
			error: result.toolResultError,
			created: automationService.created,
		}, {
			error: 'Automations are disabled.',
			created: [],
		});
	});

	test('configureAutomation rejects stale IDs and malformed targets', async () => {
		const tool = createConfigureAutomationTool(
			new FakeAutomationService(),
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);

		const staleResult = await invoke(tool, { automationId: 'missing', name: 'Updated' });
		const malformedTargetResult = await invoke(tool, {
			name: 'Invalid target',
			prompt: 'Do not save',
			schedule: { interval: 'weekly' },
			target: {
				kind: 'workspace',
				folderUri: 'not-an-absolute-uri',
				isolation: 'worktree',
				branch: 'main',
			},
		});
		const mixedConfigurationResult = await invoke(tool, {
			name: 'Mixed configuration',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target: { kind: 'workspace', folderUri: FOLDER.toString() },
			mode: 'agent',
			sessionTemplate: { config: { mode: 'plan' } },
		});
		const unsafeConfigurationResult = await invoke(tool, {
			name: 'Unsafe configuration',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target: { kind: 'workspace', folderUri: FOLDER.toString() },
			sessionTemplate: { config: { value: new Date(0) } },
		});

		assert.deepStrictEqual({
			staleError: staleResult.toolResultError,
			targetError: malformedTargetResult.toolResultError,
			mixedConfigurationError: mixedConfigurationResult.toolResultError,
			unsafeConfigurationError: unsafeConfigurationResult.toolResultError,
		}, {
			staleError: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
			targetError: '"target.folderUri" must be a valid absolute URI.',
			mixedConfigurationError: '"sessionTemplate" cannot be combined with legacy "modelId", "mode", or "permissionLevel" aliases.',
			unsafeConfigurationError: '"sessionTemplate.config.value" must contain only JSON values.',
		});
	});

	test('configureAutomation bounds opaque provider configuration', async () => {
		const tool = createConfigureAutomationTool(
			new FakeAutomationService(),
			new FakeSessionsManagementService(undefined),
			createConfigurationService(),
		);
		let deeplyNested: Record<string, unknown> = {};
		for (let depth = 0; depth < 40; depth++) {
			deeplyNested = { nested: deeplyNested };
		}
		const target = { kind: 'workspace', folderUri: FOLDER.toString() };
		const deeplyNestedResult = await invoke(tool, {
			name: 'Deep configuration',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target,
			sessionTemplate: { config: deeplyNested },
		});
		const oversizedResult = await invoke(tool, {
			name: 'Large configuration',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target,
			sessionTemplate: { config: { value: 'x'.repeat(70_000) } },
		});
		const tooManyValuesResult = await invoke(tool, {
			name: 'Wide configuration',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
			target,
			sessionTemplate: { config: { values: Array.from({ length: 10_001 }, () => null) } },
		});

		assert.deepStrictEqual({
			depthBounded: typeof deeplyNestedResult.toolResultError === 'string' && deeplyNestedResult.toolResultError.includes('exceeds the maximum nesting depth of 32'),
			sizeBounded: oversizedResult.toolResultError,
			nodeCountBounded: tooManyValuesResult.toolResultError,
		}, {
			depthBounded: true,
			sizeBounded: '"sessionTemplate.config" must not exceed 65536 characters.',
			nodeCountBounded: '"sessionTemplate.config" must not contain more than 10000 values.',
		});
	});

	test('disabled Automations cannot be listed, configured, run, or deleted', async () => {
		const automationService = new FakeAutomationService([createAutomation()]);
		const configurationService = createConfigurationService(false);
		const runner = new RecordingAutomationRunner(automationService);
		const listResult = await invoke(new ListAutomationsTool(automationService, configurationService), {});
		const configureResult = await invoke(createConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
			configurationService,
		), {
			name: 'Disabled',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
		});
		const runResult = await invoke(
			new RunAutomationTool(automationService, runner, configurationService),
			{ automationId: 'automation-1' },
		);
		const deleteResult = await invoke(
			new DeleteAutomationTool(automationService, configurationService),
			{ automationId: 'automation-1' },
			SESSION_RESOURCE,
			CancellationToken.None,
			'delete',
		);

		assert.deepStrictEqual({
			listError: listResult.toolResultError,
			configureError: configureResult.toolResultError,
			runError: runResult.toolResultError,
			deleteError: deleteResult.toolResultError,
			runCalls: runner.calls,
			deleted: automationService.deleted,
		}, {
			listError: 'Automations are disabled.',
			configureError: 'Automations are disabled.',
			runError: 'Automations are disabled.',
			deleteError: 'Automations are disabled.',
			runCalls: [],
			deleted: [],
		});
	});
});
