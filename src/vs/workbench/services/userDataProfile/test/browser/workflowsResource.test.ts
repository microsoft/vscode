/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { WORKFLOW_MAX_FILE_SIZE } from '../../../../../platform/workflow/common/workflowFiles.js';
import { WorkflowsResource, WorkflowsResourceInitializer, WorkflowsResourceTreeItem } from '../../browser/workflowsResource.js';
import { IUserDataProfileService } from '../../common/userDataProfile.js';

suite('Workflows profile resource', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const root = URI.parse('workflow-profile-test:/profiles');
	const source = toUserDataProfile('source', 'Source', joinPath(root, 'source'), root);
	const target = toUserDataProfile('target', 'Target', joinPath(root, 'target'), root);

	function createResource() {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(root.scheme, store.add(new InMemoryFileSystemProvider())));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUserDataProfileService, { currentProfile: target });
		return { fileService, instantiationService, resource: instantiationService.createInstance(WorkflowsResource) };
	}

	test('round-trip preserves JSONC definitions but never exports other files or run state', async () => {
		const { fileService, resource } = createResource();
		const files = { 'feature.workflow.jsonc': '// An editable draft\n{"label":"Feature"}\n', 'plan.checkpoint.jsonc': '{"label":"Plan"}\n' };
		for (const [name, content] of Object.entries({ ...files, 'workflow_runs.sqlite': 'private run state', 'notes.txt': 'not a definition' })) {
			await fileService.writeFile(joinPath(source.workflowsHome, name), VSBuffer.fromString(content));
		}
		await fileService.createFolder(joinPath(source.workflowsHome, 'nested.workflow.jsonc'));
		await resource.apply(await resource.getContent(source), target);
		assert.deepStrictEqual({
			exported: JSON.parse(await resource.getContent(target)),
			children: (await fileService.resolve(target.workflowsHome)).children?.map(child => child.name).sort(),
		}, { exported: { files }, children: Object.keys(files).sort() });
	});

	for (const name of ['../outside.workflow.jsonc', '..\\outside.checkpoint.jsonc', '/outside.workflow.jsonc', 'C:outside.workflow.jsonc', 'state.sqlite']) {
		test(`rejects '${name}' before writing any imported file`, async () => {
			const { fileService, resource } = createResource();
			await assert.rejects(resource.apply(JSON.stringify({ files: { 'valid.workflow.jsonc': '{}', [name]: '{}' } }), target), /Invalid workflow definition/);
			assert.strictEqual(await fileService.exists(target.workflowsHome), false);
		});
	}

	test('invalid shapes and oversized definitions fail explicitly without writes', async () => {
		const { fileService, resource } = createResource();
		for (const value of [null, [], {}, { files: [] }, { files: { 'plan.checkpoint.jsonc': false } }, { files: { 'feature.workflow.jsonc': 'x'.repeat(WORKFLOW_MAX_FILE_SIZE + 1) } }]) {
			await assert.rejects(resource.apply(JSON.stringify(value), target));
		}
		assert.strictEqual(await fileService.exists(target.workflowsHome), false);
	});

	test('nonportable filenames are rejected before writing any definitions', async () => {
		const { fileService, resource } = createResource();
		for (const name of ['bad\u0000name.workflow.jsonc', 'CON.workflow.jsonc', 'bad?name.checkpoint.jsonc']) {
			await assert.rejects(resource.apply(JSON.stringify({ files: { 'valid.workflow.jsonc': '{}', [name]: '{}' } }), target));
		}
		assert.strictEqual(await fileService.exists(target.workflowsHome), false);
	});

	test('profile export selection omits a definition without deleting it', async () => {
		const { fileService, resource, instantiationService } = createResource();
		await resource.apply(JSON.stringify({ files: { 'feature.workflow.jsonc': '{}', 'plan.checkpoint.jsonc': '{}' } }), source);
		const tree = instantiationService.createInstance(WorkflowsResourceTreeItem, source);
		tree.checkbox = { isChecked: true };
		const children = await tree.getChildren();
		children[0].checkbox!.isChecked = false;
		assert.deepStrictEqual({
			selected: JSON.parse(await tree.getContent()),
			fileStillExists: await fileService.exists(joinPath(source.workflowsHome, 'feature.workflow.jsonc')),
			labels: children.map(child => child.accessibilityInformation?.label),
		}, { selected: { files: { 'plan.checkpoint.jsonc': '{}' } }, fileStillExists: true, labels: ['feature.workflow.jsonc', 'plan.checkpoint.jsonc'] });
	});

	test('initialization uses the current profile and does not create a run', async () => {
		const { resource, instantiationService } = createResource();
		const files = { 'feature.workflow.jsonc': '{"label":"Feature"}' };
		await instantiationService.createInstance(WorkflowsResourceInitializer).initialize(JSON.stringify({ files }));
		assert.deepStrictEqual({ source: JSON.parse(await resource.getContent(source)), target: JSON.parse(await resource.getContent(target)) }, { source: { files: {} }, target: { files } });
	});

	test('unavailable file systems are errors rather than empty successful exports', async () => {
		const { resource } = createResource();
		await assert.rejects(resource.getContent({ ...source, workflowsHome: source.workflowsHome.with({ scheme: 'unavailable-profile' }) }));
	});
});
