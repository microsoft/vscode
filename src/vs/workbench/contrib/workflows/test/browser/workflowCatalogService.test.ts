/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { WorkflowCatalogService } from '../../browser/workflowCatalogService.js';
import { workflowCheckpointSchemaId, workflowSchemaId } from '../../common/workflowCatalogModel.js';
import { testCheckpointType, testWorkflowDefinition } from '../common/workflowTestData.js';

suite('Workflow catalog service', () => {
	teardown(() => sinon.restore());
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const project = URI.parse('workflow-test://host/project');
	const profile = URI.parse('workflow-test://host/profile');
	const extensionRoot = URI.parse('workflow-test://host/extensions/example');

	function setupCatalog() {
		const log = store.add(new class extends NullLogService {
			readonly errors: (string | Error | undefined)[] = [];
			override error(message?: string | Error): void { this.errors.push(message); }
		});
		const files = store.add(new FileService(log));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(files.registerProvider('workflow-test', provider));
		const workspace = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): Workspace { return new Workspace('test', [toWorkspaceFolder(project)], false, null, () => false); }
		};
		const profiles = new class extends mock<IUserDataProfileService>() {
			override readonly onDidChangeCurrentProfile = Event.None;
			override currentProfile = toUserDataProfile('test-profile', 'Personal', profile, joinPath(profile, 'cache'));
		};
		const extensions = new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensions = Event.None;
			override extensions: readonly IExtensionDescription[] = [];
			override async whenInstalledExtensionsRegistered(): Promise<boolean> { return true; }
		};
		return { files, log, extensions, profiles, service: store.add(new WorkflowCatalogService(files, workspace, profiles, extensions)) };
	}

	test('unsupported workspace schemes report unavailability without I/O or watchers and retain other sources', async () => {
		const { files, log, service } = setupCatalog();
		const virtual = URI.parse('mock-project:/mock');
		await service.createCheckpointType(testCheckpointType(), 'user');
		await service.createWorkflow(testWorkflowDefinition(), 'user');
		const watches = sinon.spy(files, 'createWatcher');
		const resolves = sinon.spy(files, 'resolve');
		const reads = sinon.spy(files, 'readFile');
		const folders = sinon.spy(files, 'createFolder');
		const writes = sinon.spy(files, 'createFile');
		store.add(service.watch(virtual));
		const catalog = await service.getCatalog(virtual);
		const repeated = await service.getCatalog(virtual);
		await assert.rejects(service.createWorkflow(testWorkflowDefinition(), virtual), /no file system provider/);
		await assert.rejects(service.createCheckpointType(testCheckpointType(), virtual), /no file system provider/);
		await timeout(0);
		assert.deepStrictEqual({
			unsupportedRequests: [
				...watches.args.map(([resource]) => resource),
				...resolves.args.map(([resource]) => resource),
				...reads.args.map(([resource]) => resource),
				...folders.args.map(([resource]) => resource),
				...writes.args.map(([resource]) => resource),
			].filter(resource => resource.scheme === virtual.scheme),
			sources: catalog.workflows.map(entry => entry.source.kind),
			watches: watches.args.map(([resource]) => resource.toString()),
			diagnostics: catalog.diagnostics.map(diagnostic => [diagnostic.severity, diagnostic.code, diagnostic.resource?.toString(), diagnostic.message.includes('no file system provider')]),
			repeatedDiagnostics: repeated.diagnostics.map(diagnostic => [diagnostic.severity, diagnostic.code, diagnostic.resource?.toString(), diagnostic.message.includes('no file system provider')]),
			errors: log.errors,
		}, {
			unsupportedRequests: [],
			sources: ['builtin', 'builtin', 'user'],
			watches: [service.userWorkflowsHome.toString(), profile.toString()],
			diagnostics: [['warning', 'source', joinPath(virtual, '.vscode', 'workflows').toString(), true]],
			repeatedDiagnostics: [['warning', 'source', joinPath(virtual, '.vscode', 'workflows').toString(), true]],
			errors: [],
		});
	});

	test('provider registration enables workspace discovery and removal never reinstalls unsupported watches', async () => {
		const { files, log, service } = setupCatalog();
		const virtual = URI.parse('mock-project:/mock');
		const watches = sinon.spy(files, 'createWatcher');
		store.add(service.watch(virtual));
		let changes = 0;
		store.add(service.onDidChange(() => changes++));
		const provider = store.add(new InMemoryFileSystemProvider());
		const registration = store.add(files.registerProvider(virtual.scheme, provider));
		const registrationChanges = changes;
		await service.createWorkflow({ ...testWorkflowDefinition(), checkpoints: [{ id: 'plan', type: 'vscode.workflow/plan@1' }] }, virtual);
		const available = await service.getCatalog(virtual);
		const supportedWatches = watches.args.map(([resource]) => resource).filter(resource => resource.scheme === virtual.scheme).map(resource => resource.toString());
		watches.resetHistory();
		const beforeRemoval = changes;
		registration.dispose();
		const removalChanges = changes - beforeRemoval;
		const unavailable = await service.getCatalog(virtual);
		await timeout(0);
		assert.deepStrictEqual({
			registrationChanges, removalChanges,
			availableSources: available.workflows.map(entry => entry.source.kind),
			availableDiagnostics: available.diagnostics,
			supportedWatches,
			removedWatches: watches.args.map(([resource]) => resource).filter(resource => resource.scheme === virtual.scheme),
			unavailableSources: unavailable.workflows.map(entry => entry.source.kind),
			unavailableDiagnostics: unavailable.diagnostics.map(diagnostic => [diagnostic.severity, diagnostic.code]),
			errors: log.errors,
		}, {
			registrationChanges: 1, removalChanges: 1,
			availableSources: ['builtin', 'builtin', 'workspace'],
			availableDiagnostics: [],
			supportedWatches: [joinPath(virtual, '.vscode', 'workflows').toString(), joinPath(virtual, '.vscode').toString(), virtual.toString()],
			removedWatches: [],
			unavailableSources: ['builtin', 'builtin'],
			unavailableDiagnostics: [['warning', 'source']],
			errors: [],
		});
	});

	test('discovery activates lazy filesystem providers before deciding a source is unavailable', async () => {
		const { files, log, service } = setupCatalog();
		const virtual = URI.parse('workflow-lazy:/project');
		const provider = store.add(new InMemoryFileSystemProvider());
		let activations = 0;
		store.add(files.onWillActivateFileSystemProvider(event => {
			if (event.scheme === virtual.scheme && !files.hasProvider(virtual)) {
				activations++;
				store.add(files.registerProvider(virtual.scheme, provider));
			}
		}));
		const watches = sinon.spy(files, 'createWatcher');
		store.add(service.watch(virtual));
		const catalog = await service.getCatalog(virtual);
		await timeout(0);
		assert.deepStrictEqual({
			activations,
			watches: watches.args.filter(([resource]) => resource.scheme === virtual.scheme).length,
			diagnostics: catalog.diagnostics,
			errors: log.errors,
		}, { activations: 1, watches: 3, diagnostics: [], errors: [] });
	});

	test('discovers workspace and profile files without modifying them', async () => {
		const { files, service } = setupCatalog();
		await files.createFolder(joinPath(project, '.vscode', 'workflows'));
		await files.createFolder(service.userWorkflowsHome);
		await files.writeFile(joinPath(project, '.vscode', 'workflows', 'summary.checkpoint.jsonc'), VSBuffer.fromString(JSON.stringify(testCheckpointType())));
		const content = JSON.stringify(testWorkflowDefinition());
		const resource = joinPath(service.userWorkflowsHome, 'feature.workflow.jsonc');
		await files.writeFile(resource, VSBuffer.fromString(content));
		await files.writeFile(joinPath(service.userWorkflowsHome, 'ignored.json'), VSBuffer.fromString(content));
		const catalog = await service.getCatalog();
		assert.deepStrictEqual({
			home: service.userWorkflowsHome.toString(),
			workflows: catalog.workflows.filter(entry => entry.source.kind !== 'builtin').map(entry => [entry.label, entry.source.kind, entry.readOnly]),
			contracts: catalog.checkpointTypes.filter(entry => entry.source.kind !== 'builtin').map(entry => entry.source.kind),
			diagnostics: catalog.diagnostics,
			content: (await files.readFile(resource)).value.toString(),
		}, { home: 'workflow-test://host/profile/workflows', workflows: [['Feature delivery', 'user', false]], contracts: ['workspace'], diagnostics: [], content });
	});

	test('resolves both string-path contributions with registered provenance and refuses package escapes', async () => {
		const { files, extensions, service } = setupCatalog();
		await files.createFolder(joinPath(extensionRoot, 'templates'));
		await files.writeFile(joinPath(extensionRoot, 'templates', 'summary.checkpoint.jsonc'), VSBuffer.fromString(JSON.stringify({ ...testCheckpointType(), $schema: workflowCheckpointSchemaId })));
		await files.writeFile(joinPath(extensionRoot, 'templates', 'feature.workflow.jsonc'), VSBuffer.fromString(JSON.stringify({ ...testWorkflowDefinition(), $schema: workflowSchemaId })));
		extensions.extensions = [new class extends mock<IExtensionDescription>() {
			override readonly identifier = new ExtensionIdentifier('example.workflows');
			override readonly name = 'workflows';
			override readonly displayName = 'Example Workflows';
			override readonly extensionLocation = extensionRoot;
			override readonly contributes = {
				commands: [],
				workflowCheckpointTypes: ['./templates/summary.checkpoint.jsonc'],
				workflowTemplates: ['templates\\feature.workflow.jsonc', '../outside.workflow.jsonc'],
			};
		}];
		const catalog = await service.getCatalog(project);
		const contributed = catalog.workflows.filter(entry => entry.source.kind === 'extension');
		const snapshot = await service.resolve(contributed[0], project);
		extensions.extensions = [];
		const disabled = await service.getCatalog(project);
		await assert.rejects(service.resolve(contributed[0], project), /no longer available/);
		assert.deepStrictEqual({
			contributed: contributed.map(entry => [entry.source.id, entry.readOnly, entry.diagnostics.length]),
			contracts: catalog.checkpointTypes.filter(entry => entry.source.kind === 'extension').map(entry => [entry.definition?.id, entry.source.id, entry.readOnly]),
			resolved: snapshot.checkpoints.map(checkpoint => `${checkpoint.type.id}@${checkpoint.type.version}`),
			metadata: [Object.hasOwn(snapshot, '$schema'), Object.hasOwn(snapshot.checkpoints[0].type, '$schema')],
			errors: catalog.diagnostics.map(diagnostic => diagnostic.code),
			disabled: [disabled.workflows.some(entry => entry.source.kind === 'extension'), disabled.checkpointTypes.some(entry => entry.source.kind === 'extension')],
		}, {
			contributed: [['example.workflows', true, 0]],
			contracts: [['test/summary', 'example.workflows', true]],
			resolved: ['test/summary@1', 'test/summary@1'],
			metadata: [false, false],
			errors: ['source'],
			disabled: [false, false],
		});
	});

	test('saving a new definition never overwrites an existing file', async () => {
		const { files, service } = setupCatalog();
		const original = { ...testWorkflowDefinition(), checkpoints: [{ id: 'plan', type: 'vscode.workflow/plan@1' }] };
		const resource = await service.createWorkflow(original, 'user');
		await assert.rejects(service.createWorkflow({ ...original, label: 'Replacement' }, 'user'));
		const contents = (await files.readFile(resource)).value.toString();
		assert.deepStrictEqual({ source: contents.includes('"source"'), label: JSON.parse(contents).label }, { source: false, label: original.label });
	});

	test('new versions receive separate files rather than replacing an earlier contract', async () => {
		const { service } = setupCatalog();
		await service.createCheckpointType(testCheckpointType('test/summary', 1), 'user');
		await service.createCheckpointType(testCheckpointType('test/summary', 2), 'user');
		const catalog = await service.getCatalog();
		assert.deepStrictEqual(catalog.checkpointTypes.filter(entry => entry.source.kind === 'user').map(entry => [entry.definition?.version, entry.diagnostics]), [[1, []], [2, []]]);
	});

	test('resolving a stale selection never silently switches to another version', async () => {
		const { service, files } = setupCatalog();
		const definition = { ...testWorkflowDefinition(), checkpoints: [{ id: 'plan', type: 'vscode.workflow/plan@1' }] };
		const resource = await service.createWorkflow(definition, 'user');
		const entry = (await service.getCatalog()).workflows.find(entry => entry.resource?.toString() === resource.toString())!;
		await files.writeFile(resource, VSBuffer.fromString(JSON.stringify({ ...definition, version: 2 })));
		await assert.rejects(service.resolve(entry), /identity or version changed/);
	});

	test('personal discovery and creation follow the active profile', async () => {
		const { service, profiles } = setupCatalog();
		const definition = { ...testWorkflowDefinition(), checkpoints: [{ id: 'plan', type: 'vscode.workflow/plan@1' }] };
		const oldResource = await service.createWorkflow(definition, 'user');
		const oldEntry = (await service.getCatalog()).workflows.find(entry => entry.resource?.toString() === oldResource.toString())!;
		const otherProfile = joinPath(profile, 'other-profile');
		profiles.currentProfile = toUserDataProfile('other-profile', 'Other', otherProfile, joinPath(otherProfile, 'cache'));
		await assert.rejects(service.resolve(oldEntry), /no longer available/);
		const resource = await service.createWorkflow(definition, 'user');
		const personal = (await service.getCatalog()).workflows.filter(entry => entry.source.kind === 'user');
		assert.deepStrictEqual({
			home: service.userWorkflowsHome.toString(),
			entries: personal.map(entry => [entry.resource?.toString(), entry.source.id]),
			separateResource: resource.toString() !== oldResource.toString(),
		}, {
			home: joinPath(otherProfile, 'workflows').toString(),
			entries: [[resource.toString(), 'other-profile']],
			separateResource: true,
		});
	});
});
