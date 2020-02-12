/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorActivation, IEditorModel } from 'vs/platform/editor/common/editor';
import { URI } from 'vs/base/common/uri';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, IFileEditorInput, GroupIdentifier, ISaveOptions, IRevertOptions, EditorsOrder, IEditorInput } from 'vs/workbench/common/editor';
import { workbenchInstantiationService, TestStorageService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { EditorService, DelegatingEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorGroup, IEditorGroupsService, GroupDirection, GroupsArrangement } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorRegistry, EditorDescriptor, Extensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { timeout } from 'vs/base/common/async';
import { toResource } from 'vs/base/test/common/utils';
import { IFileService } from 'vs/platform/files/common/files';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { UntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { NullFileSystemProvider } from 'vs/platform/files/test/common/nullFileSystemProvider';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const TEST_EDITOR_ID = 'MyTestEditorForEditorService';
const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorService';

class TestEditorControl extends BaseEditor {

	constructor(@ITelemetryService telemetryService: ITelemetryService) { super(TEST_EDITOR_ID, NullTelemetryService, new TestThemeService(), new TestStorageService()); }

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		super.setInput(input, options, token);

		await input.resolve();
	}

	getId(): string { return TEST_EDITOR_ID; }
	layout(): void { }
	createEditor(): any { }
}

class TestEditorInput extends EditorInput implements IFileEditorInput {
	gotDisposed = false;
	gotSaved = false;
	gotSavedAs = false;
	gotReverted = false;
	dirty = false;
	private fails = false;
	constructor(public resource: URI) { super(); }

	getTypeId() { return TEST_EDITOR_INPUT_ID; }
	resolve(): Promise<IEditorModel | null> { return !this.fails ? Promise.resolve(null) : Promise.reject(new Error('fails')); }
	matches(other: TestEditorInput): boolean { return other && other.resource && this.resource.toString() === other.resource.toString() && other instanceof TestEditorInput; }
	setEncoding(encoding: string) { }
	getEncoding() { return undefined; }
	setPreferredEncoding(encoding: string) { }
	setMode(mode: string) { }
	setPreferredMode(mode: string) { }
	getResource(): URI { return this.resource; }
	setForceOpenAsBinary(): void { }
	setFailToOpen(): void {
		this.fails = true;
	}
	async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		this.gotSaved = true;
		return this;
	}
	async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		this.gotSavedAs = true;
		return this;
	}
	async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<boolean> {
		this.gotReverted = true;
		this.gotSaved = false;
		this.gotSavedAs = false;
		return true;
	}
	isDirty(): boolean {
		return this.dirty;
	}
	isReadonly(): boolean {
		return false;
	}
	dispose(): void {
		super.dispose();
		this.gotDisposed = true;
	}
}

class FileServiceProvider extends Disposable {
	constructor(scheme: string, @IFileService fileService: IFileService) {
		super();

		this._register(fileService.registerProvider(scheme, new NullFileSystemProvider()));
	}
}

suite('EditorService', () => {

	let disposables: IDisposable[] = [];

	setup(() => {
		disposables.push(Registry.as<IEditorRegistry>(Extensions.Editors).registerEditor(EditorDescriptor.create(TestEditorControl, TEST_EDITOR_ID, 'My Test Editor For Next Editor Service'), [new SyncDescriptor(TestEditorInput)]));
	});

	teardown(() => {
		dispose(disposables);
		disposables = [];
	});

	function createEditorService(): [EditorPart, EditorService, IInstantiationService] {
		const instantiationService = workbenchInstantiationService();

		const part = instantiationService.createInstance(EditorPart);
		part.create(document.createElement('div'));
		part.layout(400, 300);

		instantiationService.stub(IEditorGroupsService, part);

		const editorService = instantiationService.createInstance(EditorService);
		instantiationService.stub(IEditorService, editorService);

		return [part, editorService, instantiationService];
	}

	test('basics', async () => {
		const [part, service, testInstantiationService] = createEditorService();

		let input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-basics'));
		let otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-basics'));

		let activeEditorChangeEventCounter = 0;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEventCounter++;
		});

		let visibleEditorChangeEventCounter = 0;
		const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
			visibleEditorChangeEventCounter++;
		});

		let didCloseEditorListenerCounter = 0;
		const didCloseEditorListener = service.onDidCloseEditor(() => {
			didCloseEditorListenerCounter++;
		});

		await part.whenRestored;

		// Open input
		let editor = await service.openEditor(input, { pinned: true });

		assert.ok(editor instanceof TestEditorControl);
		assert.equal(editor, service.activeControl);
		assert.equal(1, service.count);
		assert.equal(input, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
		assert.equal(input, service.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
		assert.equal(input, service.activeEditor);
		assert.equal(service.visibleControls.length, 1);
		assert.equal(service.visibleControls[0], editor);
		assert.ok(!service.activeTextEditorWidget);
		assert.ok(!service.activeTextEditorMode);
		assert.equal(service.visibleTextEditorWidgets.length, 0);
		assert.equal(service.isOpen(input), true);
		assert.equal(activeEditorChangeEventCounter, 1);
		assert.equal(visibleEditorChangeEventCounter, 1);

		// Close input
		await editor!.group!.closeEditor(input);

		assert.equal(0, service.count);
		assert.equal(0, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length);
		assert.equal(0, service.getEditors(EditorsOrder.SEQUENTIAL).length);
		assert.equal(didCloseEditorListenerCounter, 1);
		assert.equal(activeEditorChangeEventCounter, 2);
		assert.equal(visibleEditorChangeEventCounter, 2);
		assert.ok(input.gotDisposed);

		// Open again 2 inputs (disposed editors are ignored!)
		await service.openEditor(input, { pinned: true });
		assert.equal(0, service.count);

		// Open again 2 inputs (recreate because disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-basics'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-basics'));

		await service.openEditor(input, { pinned: true });
		editor = await service.openEditor(otherInput, { pinned: true });

		assert.equal(2, service.count);
		assert.equal(otherInput, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
		assert.equal(input, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].editor);
		assert.equal(input, service.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
		assert.equal(otherInput, service.getEditors(EditorsOrder.SEQUENTIAL)[1].editor);
		assert.equal(service.visibleControls.length, 1);
		assert.equal(service.isOpen(input), true);
		assert.equal(service.isOpen(otherInput), true);

		assert.equal(activeEditorChangeEventCounter, 4);
		assert.equal(visibleEditorChangeEventCounter, 4);

		activeEditorChangeListener.dispose();
		visibleEditorChangeListener.dispose();
		didCloseEditorListener.dispose();

		part.dispose();
	});

	test('openEditors() / replaceEditors()', async () => {
		const [part, service, testInstantiationService] = createEditorService();

		const input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-openEditors'));
		const otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-openEditors'));
		const replaceInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource3-openEditors'));

		await part.whenRestored;

		// Open editors
		await service.openEditors([{ editor: input }, { editor: otherInput }]);
		assert.equal(part.activeGroup.count, 2);

		// Replace editors
		await service.replaceEditors([{ editor: input, replacement: replaceInput }], part.activeGroup);
		assert.equal(part.activeGroup.count, 2);
		assert.equal(part.activeGroup.getIndexOfEditor(replaceInput), 0);

		part.dispose();
	});

	test('caching', function () {
		const instantiationService = workbenchInstantiationService();
		const service = instantiationService.createInstance(EditorService);

		// Cached Input (Files)
		const fileResource1 = toResource.call(this, '/foo/bar/cache1.js');
		const fileInput1 = service.createInput({ resource: fileResource1 });
		assert.ok(fileInput1);

		const fileResource2 = toResource.call(this, '/foo/bar/cache2.js');
		const fileInput2 = service.createInput({ resource: fileResource2 });
		assert.ok(fileInput2);

		assert.notEqual(fileInput1, fileInput2);

		const fileInput1Again = service.createInput({ resource: fileResource1 });
		assert.equal(fileInput1Again, fileInput1);

		fileInput1Again!.dispose();

		assert.ok(fileInput1!.isDisposed());

		const fileInput1AgainAndAgain = service.createInput({ resource: fileResource1 });
		assert.notEqual(fileInput1AgainAndAgain, fileInput1);
		assert.ok(!fileInput1AgainAndAgain!.isDisposed());

		// Cached Input (Resource)
		const resource1 = URI.from({ scheme: 'custom', path: '/foo/bar/cache1.js' });
		const input1 = service.createInput({ resource: resource1 });
		assert.ok(input1);

		const resource2 = URI.from({ scheme: 'custom', path: '/foo/bar/cache2.js' });
		const input2 = service.createInput({ resource: resource2 });
		assert.ok(input2);

		assert.notEqual(input1, input2);

		const input1Again = service.createInput({ resource: resource1 });
		assert.equal(input1Again, input1);

		input1Again!.dispose();

		assert.ok(input1!.isDisposed());

		const input1AgainAndAgain = service.createInput({ resource: resource1 });
		assert.notEqual(input1AgainAndAgain, input1);
		assert.ok(!input1AgainAndAgain!.isDisposed());
	});

	test('createInput', async function () {
		const instantiationService = workbenchInstantiationService();
		const service = instantiationService.createInstance(EditorService);

		const mode = 'create-input-test';
		ModesRegistry.registerLanguage({
			id: mode,
		});

		// Untyped Input (file)
		let input = service.createInput({ resource: toResource.call(this, '/index.html'), options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof FileEditorInput);
		let contentInput = <FileEditorInput>input;
		assert.strictEqual(contentInput.getResource().fsPath, toResource.call(this, '/index.html').fsPath);

		// Untyped Input (file, encoding)
		input = service.createInput({ resource: toResource.call(this, '/index.html'), encoding: 'utf16le', options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		assert.equal(contentInput.getPreferredEncoding(), 'utf16le');

		// Untyped Input (file, mode)
		input = service.createInput({ resource: toResource.call(this, '/index.html'), mode });
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		assert.equal(contentInput.getPreferredMode(), mode);

		// Untyped Input (file, different mode)
		input = service.createInput({ resource: toResource.call(this, '/index.html'), mode: 'text' });
		assert(input instanceof FileEditorInput);
		contentInput = <FileEditorInput>input;
		assert.equal(contentInput.getPreferredMode(), 'text');

		// Untyped Input (untitled)
		input = service.createInput({ options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof UntitledTextEditorInput);

		// Untyped Input (untitled with contents)
		input = service.createInput({ contents: 'Hello Untitled', options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof UntitledTextEditorInput);
		let model = await input.resolve() as UntitledTextEditorModel;
		assert.equal(model.textEditorModel!.getValue(), 'Hello Untitled');

		// Untyped Input (untitled with mode)
		input = service.createInput({ mode, options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof UntitledTextEditorInput);
		model = await input.resolve() as UntitledTextEditorModel;
		assert.equal(model.getMode(), mode);

		// Untyped Input (untitled with file path)
		input = service.createInput({ resource: URI.file('/some/path.txt'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof UntitledTextEditorInput);
		assert.ok((input as UntitledTextEditorInput).model.hasAssociatedFilePath);

		// Untyped Input (untitled with untitled resource)
		input = service.createInput({ resource: URI.parse('untitled://Untitled-1'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof UntitledTextEditorInput);
		assert.ok(!(input as UntitledTextEditorInput).model.hasAssociatedFilePath);

		// Untyped Input (untitled with custom resource)
		const provider = instantiationService.createInstance(FileServiceProvider, 'untitled-custom');

		input = service.createInput({ resource: URI.parse('untitled-custom://some/path'), forceUntitled: true, options: { selection: { startLineNumber: 1, startColumn: 1 } } });
		assert(input instanceof UntitledTextEditorInput);
		assert.ok((input as UntitledTextEditorInput).model.hasAssociatedFilePath);

		provider.dispose();

		// Untyped Input (resource)
		input = service.createInput({ resource: URI.parse('custom:resource') });
		assert(input instanceof ResourceEditorInput);
	});

	test('delegate', function (done) {
		const instantiationService = workbenchInstantiationService();

		class MyEditor extends BaseEditor {

			constructor(id: string) {
				super(id, undefined!, new TestThemeService(), new TestStorageService());
			}

			getId(): string {
				return 'myEditor';
			}

			layout(): void { }

			createEditor(): any { }
		}

		const ed = instantiationService.createInstance(MyEditor, 'my.editor');

		const inp = instantiationService.createInstance(ResourceEditorInput, 'name', 'description', URI.parse('my://resource-delegate'), undefined);
		const delegate = instantiationService.createInstance(DelegatingEditorService, async (delegate, group, input) => {
			assert.strictEqual(input, inp);

			done();

			return ed;
		});

		delegate.openEditor(inp);
	});

	test('close editor does not dispose when editor opened in other group', async () => {
		const [part, service, testInstantiationService] = createEditorService();

		const input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-close1'));

		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		await part.whenRestored;

		// Open input
		await service.openEditor(input, { pinned: true });
		await service.openEditor(input, { pinned: true }, rightGroup);

		const editors = service.editors;
		assert.equal(editors.length, 2);
		assert.equal(editors[0], input);
		assert.equal(editors[1], input);

		// Close input
		await rootGroup.closeEditor(input);
		assert.equal(input.isDisposed(), false);

		await rightGroup.closeEditor(input);
		assert.equal(input.isDisposed(), true);

		part.dispose();
	});

	test('open to the side', async () => {
		const [part, service, testInstantiationService] = createEditorService();

		const input1 = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource1-openside'));
		const input2 = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-openside'));

		const rootGroup = part.activeGroup;

		await part.whenRestored;

		await service.openEditor(input1, { pinned: true }, rootGroup);
		let editor = await service.openEditor(input1, { pinned: true, preserveFocus: true }, SIDE_GROUP);

		assert.equal(part.activeGroup, rootGroup);
		assert.equal(part.count, 2);
		assert.equal(editor!.group, part.groups[1]);

		// Open to the side uses existing neighbour group if any
		editor = await service.openEditor(input2, { pinned: true, preserveFocus: true }, SIDE_GROUP);
		assert.equal(part.activeGroup, rootGroup);
		assert.equal(part.count, 2);
		assert.equal(editor!.group, part.groups[1]);

		part.dispose();
	});

	test('editor group activation', async () => {
		const [part, service, testInstantiationService] = createEditorService();

		const input1 = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource1-openside'));
		const input2 = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-openside'));

		const rootGroup = part.activeGroup;

		await part.whenRestored;

		await service.openEditor(input1, { pinned: true }, rootGroup);
		let editor = await service.openEditor(input2, { pinned: true, preserveFocus: true, activation: EditorActivation.ACTIVATE }, SIDE_GROUP);
		const sideGroup = editor!.group;

		assert.equal(part.activeGroup, sideGroup);

		editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.PRESERVE }, rootGroup);
		assert.equal(part.activeGroup, sideGroup);

		editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.ACTIVATE }, rootGroup);
		assert.equal(part.activeGroup, rootGroup);

		editor = await service.openEditor(input2, { pinned: true, activation: EditorActivation.PRESERVE }, sideGroup);
		assert.equal(part.activeGroup, rootGroup);

		editor = await service.openEditor(input2, { pinned: true, activation: EditorActivation.ACTIVATE }, sideGroup);
		assert.equal(part.activeGroup, sideGroup);

		part.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);
		editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.RESTORE }, rootGroup);
		assert.equal(part.activeGroup, sideGroup);

		part.dispose();
	});

	test('active editor change / visible editor change events', async function () {
		const [part, service, testInstantiationService] = createEditorService();

		let input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		let otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));

		let activeEditorChangeEventFired = false;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEventFired = true;
		});

		let visibleEditorChangeEventFired = false;
		const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
			visibleEditorChangeEventFired = true;
		});

		function assertActiveEditorChangedEvent(expected: boolean) {
			assert.equal(activeEditorChangeEventFired, expected, `Unexpected active editor change state (got ${activeEditorChangeEventFired}, expected ${expected})`);
			activeEditorChangeEventFired = false;
		}

		function assertVisibleEditorsChangedEvent(expected: boolean) {
			assert.equal(visibleEditorChangeEventFired, expected, `Unexpected visible editors change state (got ${visibleEditorChangeEventFired}, expected ${expected})`);
			visibleEditorChangeEventFired = false;
		}

		async function closeEditorAndWaitForNextToOpen(group: IEditorGroup, input: EditorInput): Promise<void> {
			await group.closeEditor(input);
			await timeout(0); // closing an editor will not immediately open the next one, so we need to wait
		}

		await part.whenRestored;

		// 1.) open, open same, open other, close
		let editor = await service.openEditor(input, { pinned: true });
		const group = editor!.group!;
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		editor = await service.openEditor(input);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		editor = await service.openEditor(otherInput);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		await closeEditorAndWaitForNextToOpen(group, otherInput);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		await closeEditorAndWaitForNextToOpen(group, input);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 2.) open, open same (forced open) (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		editor = await service.openEditor(input, { forceReload: true });
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await closeEditorAndWaitForNextToOpen(group, input);

		// 3.) open, open inactive, close (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		editor = await service.openEditor(otherInput, { inactive: true });
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await group.closeAllEditors();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 4.) open, open inactive, close inactive (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		editor = await service.openEditor(otherInput, { inactive: true });
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await closeEditorAndWaitForNextToOpen(group, otherInput);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await group.closeAllEditors();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 5.) add group, remove group (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		let rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		rightGroup.focus();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(false);

		part.removeGroup(rightGroup);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(false);

		await group.closeAllEditors();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 6.) open editor in inactive group (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await rightGroup.openEditor(otherInput);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		await closeEditorAndWaitForNextToOpen(rightGroup, otherInput);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		await group.closeAllEditors();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 7.) activate group (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await rightGroup.openEditor(otherInput);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		group.focus();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(false);

		await closeEditorAndWaitForNextToOpen(rightGroup, otherInput);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(true);

		await group.closeAllEditors();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 8.) move editor (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		editor = await service.openEditor(otherInput, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		group.moveEditor(otherInput, group, { index: 0 });
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await group.closeAllEditors();
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		// 9.) close editor in inactive group (recreate inputs that got disposed)
		input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-active'));
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await rightGroup.openEditor(otherInput);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		await closeEditorAndWaitForNextToOpen(group, input);
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(true);

		// cleanup
		activeEditorChangeListener.dispose();
		visibleEditorChangeListener.dispose();

		part.dispose();
	});

	test('two active editor change events when opening editor to the side', async function () {
		const [part, service, testInstantiationService] = createEditorService();

		let input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));

		let activeEditorChangeEvents = 0;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEvents++;
		});

		function assertActiveEditorChangedEvent(expected: number) {
			assert.equal(activeEditorChangeEvents, expected, `Unexpected active editor change state (got ${activeEditorChangeEvents}, expected ${expected})`);
			activeEditorChangeEvents = 0;
		}

		await part.whenRestored;

		await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(1);

		await service.openEditor(input, { pinned: true }, SIDE_GROUP);

		// we expect 2 active editor change events: one for the fact that the
		// active editor is now in the side group but also one for when the
		// editor has finished loading. we used to ignore that second change
		// event, however many listeners are interested on the active editor
		// when it has fully loaded (e.g. a model is set). as such, we cannot
		// simply ignore that second event from the editor service, even though
		// the actual editor input is the same
		assertActiveEditorChangedEvent(2);

		// cleanup
		activeEditorChangeListener.dispose();

		part.dispose();
	});

	test('activeTextEditorWidget / activeTextEditorMode', async () => {
		const [part, service] = createEditorService();

		await part.whenRestored;

		// Open untitled input
		let editor = await service.openEditor({});

		assert.equal(service.activeControl, editor);
		assert.equal(service.activeTextEditorWidget, editor?.getControl());
		assert.equal(service.activeTextEditorMode, 'plaintext');

		part.dispose();
	});

	test('openEditor returns NULL when opening fails or is inactive', async function () {
		const [part, service, testInstantiationService] = createEditorService();

		const input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource-active'));
		const otherInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-inactive'));
		const failingInput = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource3-failing'));
		failingInput.setFailToOpen();

		await part.whenRestored;

		let editor = await service.openEditor(input, { pinned: true });
		assert.ok(editor);

		let otherEditor = await service.openEditor(otherInput, { inactive: true });
		assert.ok(!otherEditor);

		let failingEditor = await service.openEditor(failingInput);
		assert.ok(!failingEditor);

		part.dispose();
	});

	test('save, saveAll, revertAll', async function () {
		const [part, service, testInstantiationService] = createEditorService();

		const input1 = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource1-openside'));
		input1.dirty = true;
		const input2 = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource2-openside'));
		input2.dirty = true;

		const rootGroup = part.activeGroup;

		await part.whenRestored;

		await service.openEditor(input1, { pinned: true });
		await service.openEditor(input2, { pinned: true });

		await service.save({ groupId: rootGroup.id, editor: input1 });
		assert.equal(input1.gotSaved, true);

		await service.save({ groupId: rootGroup.id, editor: input1 }, { saveAs: true });
		assert.equal(input1.gotSavedAs, true);

		await service.revertAll();
		assert.equal(input1.gotReverted, true);

		await service.saveAll();
		assert.equal(input1.gotSaved, true);
		assert.equal(input2.gotSaved, true);

		await service.saveAll({ saveAs: true });
		assert.equal(input1.gotSavedAs, true);
		assert.equal(input2.gotSavedAs, true);

		part.dispose();
	});
});
