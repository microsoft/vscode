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
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AutomationTarget, IAutomation, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IToolImpl, IToolInvocation, IToolResult, ToolProgress } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, ISession, ISessionType, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ConfigureAutomationTool, ConfigureAutomationToolId, DeleteAutomationTool, DeleteAutomationToolId, ListAutomationsTool, ListAutomationsToolId } from '../../browser/automationTools.js';

const FOLDER = URI.parse('file:///workspace');
const SESSION_RESOURCE = URI.parse('agent-session://local/session');
const CHAT_RESOURCE = URI.parse('agent-chat://local/chat');
const NOW = '2026-01-01T00:00:00.000Z';
const progress: ToolProgress = { report: () => { } };

function createAutomation(overrides?: Partial<IAutomation>): IAutomation {
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
	override readonly automations = observableValue<readonly IAutomation[]>(this, []);
	readonly created: ICreateAutomationOptions[] = [];
	readonly updated: Array<{ readonly id: string; readonly patch: IUpdateAutomationOptions }> = [];
	readonly deleted: string[] = [];

	constructor(automations: readonly IAutomation[] = []) {
		super();
		this.automations.set(automations, undefined);
	}

	override getAutomation(id: string): IAutomation | undefined {
		return this.automations.get().find(automation => automation.id === id);
	}

	override async createAutomation(options: ICreateAutomationOptions): Promise<IAutomation> {
		this.created.push(options);
		return {
			...options,
			id: 'created-automation',
			enabled: options.enabled ?? true,
			createdAt: NOW,
			updatedAt: NOW,
		};
	}

	override async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation> {
		this.updated.push({ id, patch });
		const existing = this.getAutomation(id);
		assert.ok(existing);
		return {
			...existing,
			name: patch.name ?? existing.name,
			prompt: patch.prompt ?? existing.prompt,
			schedule: patch.schedule ?? existing.schedule,
			target: patch.target ?? existing.target,
			modelId: patch.modelId === null ? undefined : patch.modelId ?? existing.modelId,
			mode: patch.mode === null ? undefined : patch.mode ?? existing.mode,
			permissionLevel: patch.permissionLevel === null ? undefined : patch.permissionLevel ?? existing.permissionLevel,
			enabled: patch.enabled ?? existing.enabled,
			updatedAt: NOW,
		};
	}

	override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomation): Promise<IGuardedAutomationUpdateResult> {
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

function editableAutomationKey(automation: IAutomation): string {
	return JSON.stringify({
		name: automation.name,
		prompt: automation.prompt,
		schedule: automation.schedule,
		target: automation.target.kind === 'workspace'
			? { ...automation.target, folderUri: automation.target.folderUri.toString() }
			: automation.target,
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
		const listData = new ListAutomationsTool(automationService, configurationService).getToolData();
		const deleteData = new DeleteAutomationTool(automationService, configurationService).getToolData();
		const configureData = new ConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(undefined),
			configurationService,
		).getToolData();

		const serialize = (tool: typeof listData) => tool.when?.serialize() ?? '';
		assert.deepStrictEqual([listData, configureData, deleteData].map(tool => ({
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
				id: DeleteAutomationToolId,
				referenceName: 'deleteAutomation',
				aiEnabledGate: true,
				automationsEnabledGate: true,
				runsInWorkspace: false,
			},
		]);
	});

	test('listAutomations returns stable IDs and editable fields', async () => {
		const automation = createAutomation();
		const tool = new ListAutomationsTool(new FakeAutomationService([automation]), createConfigurationService());

		const result = await invoke(tool, {});

		assert.deepStrictEqual(JSON.parse(getText(result)), {
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
				modelId: 'gpt-test',
				mode: 'agent',
				permissionLevel: 'default',
				enabled: true,
				createdAt: NOW,
				updatedAt: NOW,
				lastRunAt: null,
				nextRunAt: '2026-01-02T09:00:00.000Z',
			}],
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
		const tool = new ConfigureAutomationTool(
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
		const tool = new ConfigureAutomationTool(
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

	test('configureAutomation applies a partial guarded update and returns clickable result data', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		const tool = new ConfigureAutomationTool(
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

	test('configureAutomation rejects editable changes made while awaiting approval', async () => {
		const existing = createAutomation();
		const automationService = new FakeAutomationService([existing]);
		const tool = new ConfigureAutomationTool(
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
		const tool = new ConfigureAutomationTool(
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

	test('configureAutomation validates explicit targets before writing', async () => {
		const automationService = new FakeAutomationService();
		const tool = new ConfigureAutomationTool(
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
		const tool = new ConfigureAutomationTool(
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
		const tool = new ConfigureAutomationTool(automationService, sessionsManagementService, configurationService);

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
		const tool = new ConfigureAutomationTool(
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

		assert.deepStrictEqual({
			staleError: staleResult.toolResultError,
			targetError: malformedTargetResult.toolResultError,
		}, {
			staleError: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
			targetError: '"target.folderUri" must be a valid absolute URI.',
		});
	});

	test('disabled Automations cannot be listed, configured, or deleted', async () => {
		const automationService = new FakeAutomationService([createAutomation()]);
		const configurationService = createConfigurationService(false);
		const listResult = await invoke(new ListAutomationsTool(automationService, configurationService), {});
		const configureResult = await invoke(new ConfigureAutomationTool(
			automationService,
			new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
			configurationService,
		), {
			name: 'Disabled',
			prompt: 'Do not save',
			schedule: { interval: 'manual' },
		});
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
			deleteError: deleteResult.toolResultError,
			deleted: automationService.deleted,
		}, {
			listError: 'Automations are disabled.',
			configureError: 'Automations are disabled.',
			deleteError: 'Automations are disabled.',
			deleted: [],
		});
	});
});
