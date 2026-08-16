/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { ExplorerItem } from '../../common/explorerModel.js';
import { getContext } from '../../browser/views/explorerView.js';
import { listInvalidItemForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { CompressedNavigationController, FilesFilter, findAncestorGitIgnoreResources } from '../../browser/views/explorerViewer.js';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { provideDecorations } from '../../browser/views/explorerDecorationsProvider.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullFilesConfigurationService, TestContextService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { URI } from '../../../../../base/common/uri.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IExplorerService } from '../../browser/files.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { FileChangesEvent, FileChangeType } from '../../../../../platform/files/common/files.js';

class AncestorGitIgnoreTestFileService extends TestFileService {
	private readonly contents = new ResourceMap<string>();

	constructor(private readonly existing: ResourceSet) {
		super();
	}

	override async exists(resource: URI): Promise<boolean> {
		return this.existing.has(resource);
	}

	setResourceContent(resource: URI, content: string): void {
		this.contents.set(resource, content);
	}

	override async readFile(resource: URI) {
		this.setContent(this.contents.get(resource) ?? this.getContent());
		return super.readFile(resource);
	}
}

suite('Files - ExplorerView', () => {

	const $ = dom.$;

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const fileService = new TestFileService();
	const configService = new TestConfigurationService();


	function createStat(this: any, path: string, name: string, isFolder: boolean, hasChildren: boolean, size: number, mtime: number, isSymLink = false, isUnknown = false): ExplorerItem {
		return new ExplorerItem(toResource.call(this, path), fileService, configService, NullFilesConfigurationService, undefined, isFolder, isSymLink, false, false, name, mtime, isUnknown);
	}

	test('getContext', async function () {
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);
		const noNavigationController = { getCompressedNavigationController: (stat: ExplorerItem) => undefined };

		assert.deepStrictEqual(getContext([s1], [s2, s3, s4], true, noNavigationController), [s2, s3, s4]);
		assert.deepStrictEqual(getContext([s1], [s1, s3, s4], true, noNavigationController), [s1, s3, s4]);
		assert.deepStrictEqual(getContext([s1], [s3, s1, s4], false, noNavigationController), [s1]);
		assert.deepStrictEqual(getContext([], [s3, s1, s4], false, noNavigationController), []);
		assert.deepStrictEqual(getContext([], [s3, s1, s4], true, noNavigationController), [s3, s1, s4]);
	});

	test('find ancestor gitignore resources from repository root to workspace parent', async () => {
		const existing = new Set([
			URI.file('/repo/.git').toString(),
		]);
		const resources = await findAncestorGitIgnoreResources(URI.file('/repo/packages/app'), resource => Promise.resolve(existing.has(resource.toString())));

		assert.deepStrictEqual(resources, [
			URI.file('/repo/.gitignore'),
			URI.file('/repo/packages/.gitignore'),
		]);
	});

	test('find ancestor gitignore resources stops at nearest repository root', async () => {
		const existing = new Set([
			URI.file('/repo/.git').toString(),
			URI.file('/repo/packages/.git').toString(),
		]);
		const resources = await findAncestorGitIgnoreResources(URI.file('/repo/packages/app'), resource => Promise.resolve(existing.has(resource.toString())));

		assert.deepStrictEqual(resources, [URI.file('/repo/packages/.gitignore')]);
	});

	test('find ancestor gitignore resources stops when workspace is repository root', async () => {
		const existing = new Set([
			URI.file('/repo/.git').toString(),
			URI.file('/repo/packages/app/.git').toString(),
		]);
		const resources = await findAncestorGitIgnoreResources(URI.file('/repo/packages/app'), resource => Promise.resolve(existing.has(resource.toString())));

		assert.deepStrictEqual(resources, []);
	});

	test('find ancestor gitignore resources requires a repository boundary', async () => {
		const resources = await findAncestorGitIgnoreResources(URI.file('/users/example/workspace'), () => Promise.resolve(false));

		assert.deepStrictEqual(resources, []);
	});

	test('files filter applies gitignore from ancestor repository root', async () => {
		const workspaceRoot = URI.file('/repo/packages/app');
		const existing = new ResourceSet([
			URI.file('/repo/.git'),
			URI.file('/repo/.gitignore'),
			URI.file('/repo/packages/app/.gitignore'),
		]);
		const ancestorFileService = new AncestorGitIgnoreTestFileService(existing);
		ancestorFileService.setResourceContent(URI.file('/repo/.gitignore'), '*.log');
		ancestorFileService.setResourceContent(URI.file('/repo/packages/app/.gitignore'), '!keep.log');
		const contextService = new TestContextService(new Workspace('workspace', [new WorkspaceFolder({ uri: workspaceRoot, name: 'app', index: 0 })], false, null, () => false));
		const configurationService = new TestConfigurationService({
			files: { exclude: {} },
			explorer: { excludeGitIgnore: true }
		});
		const filter = ds.add(new FilesFilter(
			contextService,
			configurationService,
			{ getEditableData: () => undefined } as Partial<IExplorerService> as IExplorerService,
			{ onDidVisibleEditorsChange: Event.None, visibleEditors: [] } as Partial<IEditorService> as IEditorService,
			ds.add(new UriIdentityService(ancestorFileService)),
			ancestorFileService
		));
		const processIgnoreFile = Reflect.get(filter, 'processIgnoreFile') as (root: string, resource: URI) => Promise<void>;
		await processIgnoreFile.call(filter, workspaceRoot.toString(), URI.file('/repo/packages/app/.gitignore'));

		assert.strictEqual(filter.isIgnored(URI.file('/repo/packages/app/output.log'), workspaceRoot, false), true);
		assert.strictEqual(filter.isIgnored(URI.file('/repo/packages/app/keep.log'), workspaceRoot, false), false);
		assert.deepStrictEqual(ancestorFileService.watches.map(resource => resource.toString()), [
			URI.file('/repo/.gitignore').toString(),
			URI.file('/repo/packages/.gitignore').toString(),
		]);

		ancestorFileService.setResourceContent(URI.file('/repo/.gitignore'), '*.tmp');
		const updated = Event.toPromise(filter.onDidChange);
		ancestorFileService.fireFileChanges(new FileChangesEvent([{ resource: URI.file('/repo/.gitignore'), type: FileChangeType.UPDATED }], false));
		await updated;

		assert.strictEqual(filter.isIgnored(URI.file('/repo/packages/app/output.log'), workspaceRoot, false), false);
		assert.strictEqual(filter.isIgnored(URI.file('/repo/packages/app/output.tmp'), workspaceRoot, false), true);

		existing.delete(URI.file('/repo/.gitignore'));
		const deleted = Event.toPromise(filter.onDidChange);
		ancestorFileService.fireFileChanges(new FileChangesEvent([{ resource: URI.file('/repo/.gitignore'), type: FileChangeType.DELETED }], false));
		await deleted;

		assert.strictEqual(filter.isIgnored(URI.file('/repo/packages/app/output.tmp'), workspaceRoot, false), false);
	});

	test('decoration provider', async function () {
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		s1.error = new Error('A test error');
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d, true);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);
		assert.strictEqual(provideDecorations(s3), undefined);
		assert.deepStrictEqual(provideDecorations(s2), {
			tooltip: 'Symbolic Link',
			letter: '\u2937'
		});
		assert.deepStrictEqual(provideDecorations(s1), {
			tooltip: 'Unable to resolve workspace folder (A test error)',
			letter: '!',
			color: listInvalidItemForeground
		});

		const unknown = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d, false, true);
		assert.deepStrictEqual(provideDecorations(unknown), {
			tooltip: 'Unknown File Type',
			letter: '?'
		});
	});

	test('compressed navigation controller', async function () {
		const container = $('.file');
		const label = $('.label');
		const labelName1 = $('.label-name');
		const labelName2 = $('.label-name');
		const labelName3 = $('.label-name');
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);

		dom.append(container, label);
		dom.append(label, labelName1);
		dom.append(label, labelName2);
		dom.append(label, labelName3);
		const emitter = new Emitter<void>();

		const navigationController = new CompressedNavigationController('id', [s1, s2, s3], {
			container,
			templateDisposables: ds.add(new DisposableStore()),
			elementDisposables: ds.add(new DisposableStore()),
			contribs: [],
			// eslint-disable-next-line local/code-no-any-casts
			label: <any>{
				container: label,
				onDidRender: emitter.event
			},
		}, 1, false);

		ds.add(navigationController);

		assert.strictEqual(navigationController.count, 3);
		assert.strictEqual(navigationController.index, 2);
		assert.strictEqual(navigationController.current, s3);
		navigationController.next();
		assert.strictEqual(navigationController.current, s3);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s2);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s1);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s1);
		navigationController.last();
		assert.strictEqual(navigationController.current, s3);
		navigationController.first();
		assert.strictEqual(navigationController.current, s1);
		navigationController.setIndex(1);
		assert.strictEqual(navigationController.current, s2);
		navigationController.setIndex(44);
		assert.strictEqual(navigationController.current, s2);
	});
});
