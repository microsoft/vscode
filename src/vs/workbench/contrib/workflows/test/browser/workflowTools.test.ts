/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { WorkflowDefinition } from '../../../../../platform/workflow/common/workflow.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { AICustomizationSource } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../chat/common/customizationHarnessService.js';
import { ILanguageModelToolsService, IToolData, IToolResult, ToolDataSource, ToolSet } from '../../../chat/common/tools/languageModelToolsService.js';
import { WorkflowAuthoringService } from '../../browser/workflowAuthoringService.js';
import { WorkflowCatalogService } from '../../browser/workflowCatalogService.js';
import { WorkflowTool, WorkflowToolsContribution } from '../../browser/workflowTools.js';
import { IWorkflowAuthoringService } from '../../common/workflowAuthoring.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { WorkflowSettingId } from '../../common/workflowConfiguration.js';
import { testCheckpointType, testWorkflowDefinition } from '../common/workflowTestData.js';

suite('Workflow authoring tools', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const project = URI.parse('workflow-tools://host/project');
	const otherProject = URI.parse('workflow-tools://host/other');
	const profile = URI.parse('workflow-tools://host/profile');
	const session = URI.parse('agent-host-copilotcli:/session');
	const scope = { workspace: project };
	const definition: WorkflowDefinition = {
		...testWorkflowDefinition(),
		checkpoints: [{ id: 'plan', type: 'vscode.workflow/plan@1' }],
	};
	const guard = () => { };

	function setup() {
		const files = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(files.registerProvider(project.scheme, provider));
		const workspace = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): Workspace { return new Workspace('test', [toWorkspaceFolder(project), toWorkspaceFolder(otherProject)], false, null, () => false); }
		};
		const profiles = new class extends mock<IUserDataProfileService>() {
			override readonly onDidChangeCurrentProfile = Event.None;
			override currentProfile = toUserDataProfile('test', 'Personal', profile, joinPath(profile, 'cache'));
		};
		const extensions = new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensions = Event.None;
			override readonly extensions = [];
			override async whenInstalledExtensionsRegistered(): Promise<boolean> { return true; }
		};
		const catalog = store.add(new WorkflowCatalogService(files, workspace, profiles, extensions));
		let dirty = false;
		const workingCopies = upcastPartial<IWorkingCopyService>({ isDirty: () => dirty });
		const authoring = new WorkflowAuthoringService(catalog, files, workingCopies);
		const configuration = new TestConfigurationService({ [WorkflowSettingId.Enabled]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const sentiment = { hidden: false };
		const entitlement = upcastPartial<IChatEntitlementService>({ sentiment });
		let sources: readonly AICustomizationSource[] | undefined;
		const harness = upcastPartial<ICustomizationHarnessService>({
			findHarnessById: id => ({ id, label: id, icon: Codicon.agent, workflowSources: sources }),
		});
		const identity = store.add(new UriIdentityService(files));
		const tool = (name: WorkflowTool['name']) => new WorkflowTool(name, authoring, configuration, entitlement, workspace, identity, harness);
		const invoke = (name: WorkflowTool['name'], parameters: Record<string, unknown> = {}, workingDirectory: URI | undefined = project, token = CancellationToken.None) =>
			tool(name).invoke({ toolId: `vscode_${name}`, callId: 'call', parameters, context: { sessionResource: session, workingDirectory } }, async () => 0, { report: () => { } }, token);
		return { files, provider, catalog, profiles, authoring, configuration, sentiment, workspace, entitlement, identity, harness, tool, invoke, setDirty: (value: boolean) => { dirty = value; }, setSources: (value: readonly AICustomizationSource[]) => { sources = value; } };
	}

	function text(result: IToolResult): string {
		assert.strictEqual(result.content[0].kind, 'text');
		return result.content[0].value;
	}

	test('lists workflows and reusable checkpoints without writing files', async () => {
		const { files, invoke } = setup();
		const writes = sinon.spy(files, 'writeFile');
		const workflows = text(await invoke('listWorkflows'));
		const checkpoints = text(await invoke('listWorkflowCheckpoints'));
		const details = text(await invoke('listWorkflowCheckpoints', { references: ['vscode.workflow/plan@1'] }));
		assert.deepStrictEqual({
			workflows: workflows.includes('"checkpoints"'),
			sources: workflows.includes('"readOnly":true'),
			references: checkpoints.includes('vscode.workflow/plan@1'),
			summary: checkpoints.includes('"proofSchema"'),
			details: details.includes('"proofSchema"') && details.includes('"instructions"'),
			writes: writes.callCount,
		}, { workflows: true, sources: true, references: true, summary: false, details: true, writes: 0 });
	});

	test('creates a personal workflow and updates it without changing resolved snapshots', async () => {
		const { catalog, authoring, invoke } = setup();
		const created = text(await invoke('createWorkflow', { definition }));
		const entry = (await catalog.getCatalog(project)).workflows.find(entry => entry.definition?.id === definition.id)!;
		const snapshot = await catalog.resolve(entry, project);
		const before = await authoring.readWorkflow(entry.key, scope);
		await invoke('updateWorkflow', { key: entry.key, revision: before.revision, definition: { ...definition, label: 'Changed label' } });
		const after = await authoring.readWorkflow(entry.key, scope);
		assert.deepStrictEqual({
			created: created.includes('"status":"created"'),
			source: after.entry.source.kind,
			label: after.entry.definition?.label,
			oldSnapshot: snapshot.label,
			newRevision: after.revision !== before.revision,
			checkpoints: snapshot.checkpoints.map(checkpoint => checkpoint.id),
		}, { created: true, source: 'user', label: 'Changed label', oldSnapshot: definition.label, newRevision: true, checkpoints: ['plan'] });
	});

	test('writes workspace workflows only into the invoking session worktree', async () => {
		const { catalog, invoke } = setup();
		await invoke('createWorkflow', { definition, target: 'workspace' }, otherProject);
		assert.deepStrictEqual({
			invoking: (await catalog.getCatalog(otherProject)).workflows.filter(entry => entry.source.kind === 'workspace').map(entry => entry.definition?.id),
			unrelated: (await catalog.getCatalog(project)).workflows.filter(entry => entry.source.kind === 'workspace').length,
		}, { invoking: [definition.id], unrelated: 0 });
	});

	test('rejects stale updates even when replacement content has the same length', async () => {
		const { authoring, files } = setup();
		const before = await authoring.createWorkflow(definition, 'user', scope, guard);
		await files.writeFile(before.entry.resource!, VSBuffer.fromString(before.content.replace('Feature delivery', 'Feature Delivery')));
		await assert.rejects(authoring.updateWorkflow(before.entry.key, { ...definition, label: 'Stale update' }, before.revision, scope, guard), /changed after it was read/);
		assert.strictEqual((await authoring.readWorkflow(before.entry.key, scope)).entry.definition?.label, 'Feature Delivery');
	});

	test('serializes competing updates and accepts only the first matching revision', async () => {
		const { authoring } = setup();
		const before = await authoring.createWorkflow(definition, 'user', scope, guard);
		const settled = await Promise.allSettled(['First', 'Second'].map(label => authoring.updateWorkflow(before.entry.key, { ...definition, label }, before.revision, scope, guard)));
		assert.deepStrictEqual({ status: settled.map(result => result.status), label: (await authoring.readWorkflow(before.entry.key, scope)).entry.definition?.label }, { status: ['fulfilled', 'rejected'], label: 'First' });
	});

	test('preserves JSONC comments and unchanged checkpoint contracts', async () => {
		const { files, authoring, catalog } = setup();
		const created = await authoring.createWorkflow(definition, 'user', scope, guard);
		await files.writeFile(created.entry.resource!, VSBuffer.fromString('// Workflow rationale\n' + created.content));
		const before = await authoring.readWorkflow(created.entry.key, scope);
		const contracts = (await catalog.getCatalog(project)).checkpointTypes;
		await authoring.updateWorkflow(before.entry.key, { ...definition, label: 'Edited' }, before.revision, scope, guard);
		assert.deepStrictEqual({
			comment: (await authoring.readWorkflow(before.entry.key, scope)).content.startsWith('// Workflow rationale'),
			contracts: (await catalog.getCatalog(project)).checkpointTypes,
		}, { comment: true, contracts });
	});

	test('refuses unsaved editor changes instead of replacing them', async () => {
		const { authoring, setDirty } = setup();
		const before = await authoring.createWorkflow(definition, 'user', scope, guard);
		setDirty(true);
		await assert.rejects(authoring.updateWorkflow(before.entry.key, { ...definition, label: 'Edited' }, before.revision, scope, guard), /unsaved editor changes/);
		assert.strictEqual((await authoring.readWorkflow(before.entry.key, scope)).content, before.content);
	});

	test('reads built-in definitions but requires a new id to copy them', async () => {
		const { authoring } = setup();
		const builtin = (await authoring.getCatalog(scope)).workflows.find(entry => entry.source.kind === 'builtin')!;
		const document = await authoring.readWorkflow(builtin.key, scope);
		await assert.rejects(authoring.updateWorkflow(builtin.key, builtin.definition, document.revision, scope, guard), /read-only/);
		await assert.rejects(authoring.createWorkflow(builtin.definition, 'user', scope, guard), /already exists/);
		const copy = await authoring.createWorkflow({ ...builtin.definition, id: 'my/copied-workflow' }, 'user', scope, guard);
		assert.deepStrictEqual({ id: copy.entry.definition?.id, source: copy.entry.source.kind, readOnly: copy.entry.readOnly }, { id: 'my/copied-workflow', source: 'user', readOnly: false });
	});

	test('rejects missing checkpoint references, duplicate ids and invalid bindings before creation', async () => {
		const { authoring, files } = setup();
		const writes = sinon.spy(files, 'createFile');
		const definitions = [
			{ ...definition, checkpoints: [{ id: 'missing', type: 'missing/type@1' }] },
			{ ...definition, checkpoints: [definition.checkpoints[0], definition.checkpoints[0]] },
			{ ...definition, checkpoints: [{ ...definition.checkpoints[0], inputs: { missing: { checkpoint: 'later', outputPointer: '' } } }] },
			{ ...definition, checkpoints: [] },
		];
		for (const invalid of definitions) {
			await assert.rejects(authoring.createWorkflow(invalid, 'user', scope, guard));
		}
		assert.strictEqual(writes.callCount, 0);
	});

	test('supports workflow-local checkpoints without changing the reusable library', async () => {
		const { authoring, catalog } = setup();
		const localType = { ...testCheckpointType(), source: { kind: 'builtin', id: 'forged' } };
		const created = await authoring.createWorkflow({ ...definition, checkpoints: [{ id: 'summary', type: 'test/summary@1', localType }] }, 'user', scope, guard);
		assert.deepStrictEqual({
			storedProvenance: created.content.includes('"source"'),
			localSource: created.entry.definition?.checkpoints[0].localType?.source?.kind,
			library: (await catalog.getCatalog(project)).checkpointTypes.some(entry => entry.definition?.id === 'test/summary'),
		}, { storedProvenance: false, localSource: 'user', library: false });
	});

	test('does not overwrite colliding filenames or identities from another source', async () => {
		const { authoring, files, catalog } = setup();
		await catalog.createWorkflow(definition, project);
		await assert.rejects(authoring.createWorkflow(definition, 'user', scope, guard), /already exists/);
		const first = await authoring.createWorkflow({ ...definition, id: 'test/collision' }, 'user', scope, guard);
		await assert.rejects(authoring.createWorkflow({ ...definition, id: 'test-collision', label: 'Overwrite' }, 'user', scope, guard));
		assert.strictEqual((await files.readFile(first.entry.resource!)).value.toString(), first.content);
	});

	test('requires an explicit folder to create a workspace workflow in a multi-root window', async () => {
		const { tool } = setup();
		const create = tool('createWorkflow');
		await assert.rejects(create.invoke({ toolId: 'vscode_createWorkflow', callId: 'call', parameters: { definition, target: 'workspace' }, context: undefined }, async () => 0, { report: () => { } }, CancellationToken.None), /explicit workspace folder/);
	});

	test('rejects paths and keys outside the invoking session workspace', async () => {
		const { authoring, invoke } = setup();
		const other = await authoring.createWorkflow(definition, otherProject, { workspace: otherProject }, guard);
		await assert.rejects(invoke('listWorkflows', { workspace: otherProject.toString() }), /outside this session/);
		await assert.rejects(invoke('getWorkflow', { key: other.entry.key }), /not available/);
	});

	test('source restrictions use the invoking harness and block hidden checkpoint contracts', async () => {
		const { setSources, catalog, invoke } = setup();
		await catalog.createWorkflow(definition, project);
		setSources(['user']);
		const result = text(await invoke('listWorkflows'));
		await assert.rejects(invoke('createWorkflow', { definition: { ...definition, id: 'test/hidden-checkpoint' } }), /checkpoint|resolve|type/i);
		await assert.rejects(invoke('createWorkflow', { definition, target: 'workspace' }), /does not support/);
		assert.ok(result.includes('"workflows":[]'));
	});

	test('disabled AI, disabled workflows, and cancellation reject direct invocations', async () => {
		const { configuration, sentiment, invoke } = setup();
		await configuration.setUserConfiguration(WorkflowSettingId.Enabled, false);
		await assert.rejects(invoke('listWorkflows'), /disabled/);
		await configuration.setUserConfiguration(WorkflowSettingId.Enabled, true);
		sentiment.hidden = true;
		await assert.rejects(invoke('createWorkflow', { definition }), /disabled/);
		sentiment.hidden = false;
		await assert.rejects(invoke('createWorkflow', { definition }, project, CancellationToken.Cancelled), /Canceled/);
	});

	test('revocation during folder creation prevents writing the workflow', async () => {
		const { files, catalog, invoke } = setup();
		await files.createFolder(catalog.userWorkflowsHome);
		const cancellation = store.add(new CancellationTokenSource());
		sinon.stub(files, 'createFolder').callsFake(async resource => {
			cancellation.cancel();
			return files.resolve(resource, { resolveMetadata: true });
		});
		const writes = sinon.spy(files, 'createFile');
		await assert.rejects(invoke('createWorkflow', { definition }, project, cancellation.token), /Canceled/);
		assert.strictEqual(writes.callCount, 0);
	});

	for (const operation of ['create', 'update'] as const) {
		test(`a profile change during validation prevents ${operation} from writing either profile`, async () => {
			const { files, profiles, authoring } = setup();
			const document = await authoring.createWorkflow(definition, 'user', scope, guard);
			const replacement = { ...definition, id: operation === 'create' ? 'test/new-workflow' : definition.id, label: 'Updated label' };
			const nextProfile = joinPath(profile, 'next');
			sinon.stub(authoring, 'validateWorkflow').callsFake(async () => {
				profiles.currentProfile = toUserDataProfile('next', 'Next', nextProfile, joinPath(nextProfile, 'cache'));
				return replacement;
			});
			const creates = sinon.spy(files, 'createFile');
			const writes = sinon.spy(files, 'writeFile');
			await assert.rejects(operation === 'create'
				? authoring.createWorkflow(replacement, 'user', scope, guard)
				: authoring.updateWorkflow(document.entry.key, replacement, document.revision, scope, guard),
			/active profile changed/);
			assert.deepStrictEqual({
				creates: creates.callCount, writes: writes.callCount, original: (await files.readFile(document.entry.resource!)).value.toString(),
			}, { creates: 0, writes: 0, original: document.content });
		});
	}

	test('preparing a mutation asks for standard confirmation without saving', async () => {
		const { files, tool } = setup();
		const writes = sinon.spy(files, 'createFile');
		const prepared = await tool('createWorkflow').prepareToolInvocation({ parameters: { definition }, toolCallId: 'call', chatSessionResource: session, workingDirectory: project }, CancellationToken.None);
		assert.deepStrictEqual({
			title: prepared.confirmationMessages?.title,
			scope: String(prepared.confirmationMessages?.message).includes('personal profile'),
			noStart: String(prepared.confirmationMessages?.message).includes('no workflow will start'),
			writes: writes.callCount,
		}, { title: 'Create Workflow?', scope: true, noStart: true, writes: 0 });
	});

	test('missing references and missing required edit values are explicit errors', async () => {
		const { invoke } = setup();
		await assert.rejects(invoke('listWorkflowCheckpoints', { references: ['unknown/checkpoint@1'] }), /unavailable/);
		await assert.rejects(invoke('listWorkflowCheckpoints', { references: [] }), /non-empty array/);
		await assert.rejects(invoke('getWorkflow', {}), /key/);
		await assert.rejects(invoke('updateWorkflow', { key: 'anything', definition }), /revision/);
	});

	test('tool descriptions preserve definition-only semantics and edit prerequisites', () => {
		const { tool } = setup();
		const create = tool('createWorkflow').getToolData();
		const update = tool('updateWorkflow').getToolData();
		assert.deepStrictEqual({
			gated: create.when?.keys().sort(),
			createPrerequisite: create.modelDescription.includes('listWorkflowCheckpoints'),
			noRun: create.modelDescription.includes('never attaches, starts, or resumes'),
			editPrerequisite: update.modelDescription.includes('Call getWorkflow first'),
			approval: create.canRequestPreApproval,
			schema: update.inputSchema?.required,
		}, {
			gated: ['chatIsEnabled', 'config.chat.workflows.enabled'],
			createPrerequisite: true, noRun: true, editPrerequisite: true, approval: true,
			schema: ['key', 'definition', 'revision'],
		});
	});

	test('publishes all five tools in a non-deprecated tool set for agent-host discovery', () => {
		const { authoring, configuration, workspace, entitlement, identity, harness } = setup();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IWorkflowAuthoringService, authoring);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IWorkspaceContextService, workspace);
		instantiation.stub(IChatEntitlementService, entitlement);
		instantiation.stub(IUriIdentityService, identity);
		instantiation.stub(ICustomizationHarnessService, harness);
		const registered: IToolData[] = [];
		const contextKeys = store.add(new MockContextKeyService());
		contextKeys.createKey('chatIsEnabled', true);
		const enabled = contextKeys.createKey<boolean>('config.chat.workflows.enabled', true);
		sinon.stub(contextKeys, 'contextMatchesRules').callsFake(rules => rules?.evaluate({ getValue: key => contextKeys.getContextKeyValue(key) }) ?? true);
		const toolSet = new ToolSet('workflows', 'workflows', Codicon.listTree, ToolDataSource.Internal, undefined, undefined, undefined, false, false, contextKeys);
		const toolsService = upcastPartial<ILanguageModelToolsService>({
			createToolSet: () => Object.assign(toolSet, { dispose: () => { } }),
			registerTool: data => {
				registered.push(data);
				return toDisposable(() => registered.splice(registered.indexOf(data), 1));
			},
		});
		const contribution = store.add(new WorkflowToolsContribution(toolsService, instantiation));
		const published = [...toolSet.getTools()].map(data => data.toolReferenceName);
		enabled.set(false);
		const hidden = [...toolSet.getTools()].length;
		contribution.dispose();
		assert.deepStrictEqual({ published, hidden, remainingRegistrations: registered.length, remainingMembers: [...toolSet.getTools()].length }, {
			published: ['listWorkflows', 'getWorkflow', 'listWorkflowCheckpoints', 'createWorkflow', 'updateWorkflow'],
			hidden: 0, remainingRegistrations: 0, remainingMembers: 0,
		});
	});
});
