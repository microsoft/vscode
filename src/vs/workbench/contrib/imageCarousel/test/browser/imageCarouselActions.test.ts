/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService, ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IContextMenuService, IContextMenuMenuDelegate } from '../../../../../platform/contextview/browser/contextView.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IVisibleEditorPane } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestEditorGroupsService, TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { ImageCarouselEditor } from '../../browser/imageCarouselEditor.js';
import { ImageCarouselEditorInput } from '../../browser/imageCarouselEditorInput.js';
import { ICarouselImage, ImageCarouselContextKeys, ImageCarouselContextMenu } from '../../browser/imageCarouselTypes.js';
import { isWeb, OS } from '../../../../../base/common/platform.js';
import { IExplorerService } from '../../../files/browser/files.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver, ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { createSimpleKeybinding } from '../../../../../base/common/keybindings.js';
import '../../../files/browser/fileActions.contribution.js';
import '../../browser/imageCarouselActions.js';

suite('ImageCarouselActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const svg = VSBuffer.fromString('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="red" d="M0 0h2v2H0z"/></svg>');
	let instantiation: ReturnType<typeof workbenchInstantiationService>;
	let editor: ImageCarouselEditor;
	let group: TestEditorGroupView;
	let container: HTMLElement;
	let errors: unknown[];

	setup(() => {
		instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IWebviewService, {});
		instantiation.stub(IWorkspaceContextService, 'isInsideWorkspace', () => true);
		errors = [];
		instantiation.stub(INotificationService, 'error', (error: Error) => errors.push(error));
		group = new TestEditorGroupView(2);
		const unrelatedGroup = new TestEditorGroupView(1);
		instantiation.stub(IEditorGroupsService, new TestEditorGroupsService([unrelatedGroup, group]));
		sinon.stub(group, 'getEditorByIndex').callsFake(index => group.editors[index]);
		sinon.stub(group, 'getIndexOfEditor').callsFake(input => group.editors.indexOf(input));
		editor = store.add(instantiation.createInstance(ImageCarouselEditor, group));
		group.activeEditorPane = editor as IVisibleEditorPane;
		container = $('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		editor.create(container);
	});

	teardown(() => sinon.restore());

	async function load(images: ICarouselImage[]): Promise<void> {
		const input = store.add(new ImageCarouselEditorInput({ id: 'test', title: 'Test', sections: [{ title: '', images }] }));
		group.activeEditor = input;
		group.editors = [input];
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const image = container.querySelector<HTMLImageElement>('.main-image')!;
		if (!image.complete || !image.src) {
			await new Promise<void>(resolve => store.add(addDisposableListener(image, 'load', () => resolve())));
		}
	}

	async function run(id: string, groupId = group.id): Promise<void> {
		const command = CommandsRegistry.getCommand(id)!;
		await instantiation.invokeFunction(command.handler, { groupId, editorIndex: 0 });
	}

	test('exports cached bytes rather than re-reading a changed source', async () => {
		let reads = 0;
		instantiation.stub(IFileService, 'readFile', async (resource: URI) => {
			reads++;
			return { resource, value: svg };
		});
		await load([{ id: 'file', name: 'image.svg', mimeType: 'image/svg+xml', uri: URI.file('/images/image.svg') }]);
		const before = reads;
		const data = await editor.getCurrentImageData();
		assert.deepStrictEqual({ bytes: data.toString(), additionalReads: reads - before }, { bytes: svg.toString(), additionalReads: 0 });
	});

	test('copy targets the originating group and surfaces clipboard failures', async () => {
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg }]);
		const failure = new Error('Clipboard denied');
		const copy = sinon.stub(editor, 'copyImage').rejects(failure);
		await run('imageCarousel.copyImage');
		assert.deepStrictEqual({ calls: copy.callCount, errors }, { calls: 1, errors: [failure] });
	});

	test('stale group context does not copy from another editor', async () => {
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg }]);
		const copy = sinon.stub(editor, 'copyImage').resolves();
		await run('imageCarousel.copyImage', 99);
		assert.deepStrictEqual({ calls: copy.callCount, errors: errors.length }, { calls: 0, errors: 1 });
	});

	test('copy shortcut resolves in the carousel without intercepting text input', async () => {
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg }]);
		const items = KeybindingsRegistry.getDefaultKeybindings().map(item => new ResolvedKeybindingItem(
			item.keybinding ? USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0] : undefined,
			item.command, item.commandArgs, item.when ?? undefined, true, null, false,
		));
		const resolver = new KeybindingResolver(items, [], () => { });
		const key = USLayoutResolvedKeybinding.getDispatchStr(createSimpleKeybinding(KeyMod.CtrlCmd | KeyCode.KeyC, OS))!;
		const contextService = editor.scopedContextKeyService!;
		contextService.createKey('activeEditor', ImageCarouselEditor.ID);
		const inputFocus = contextService.createKey<boolean>('inputFocus', false);
		const context = { getValue: <T>(key: string) => contextService.getContextKeyValue<T>(key) };
		const result = resolver.resolve(context, [], key);
		inputFocus.set(true);
		const inputResult = resolver.resolve(context, [], key);
		assert.deepStrictEqual({
			command: result.kind === ResultKind.KbFound ? result.commandId : undefined,
			interceptsInput: inputResult.kind === ResultKind.KbFound && inputResult.commandId === 'imageCarousel.copyImage',
		}, { command: 'imageCarousel.copyImage', interceptsInput: false });
	});

	test('context menu and source capabilities follow the current image', async () => {
		const sourceUri = URI.file('/images/image.svg');
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg, sourceUri }]);
		let menu: string | undefined;
		instantiation.stub(IContextMenuService, 'showContextMenu', (delegate: IContextMenuMenuDelegate) => { menu = delegate.menuId?.id; });
		container.querySelector('.image-area')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const context = editor.scopedContextKeyService!;
		assert.deepStrictEqual({
			menu,
			canCopy: context.getContextKeyValue(ImageCarouselContextKeys.canCopy.key),
			hasSource: context.getContextKeyValue(ImageCarouselContextKeys.hasSource.key),
		}, { menu: ImageCarouselContextMenu.id, canCopy: true, hasSource: true });
		editor.clearInput();
		assert.deepStrictEqual({
			image: editor.currentImage,
			hasMedia: context.getContextKeyValue(ImageCarouselContextKeys.hasMedia.key),
		}, { image: undefined, hasMedia: false });
	});

	test('generated images have no source actions', async () => {
		await load([{ id: 'generated', name: 'Image', mimeType: 'image/svg+xml', data: svg, uri: URI.parse('vscode-chat-response-resource:/generated.svg') }]);
		assert.deepStrictEqual({
			source: editor.sourceUri,
			hasSource: editor.scopedContextKeyService!.getContextKeyValue(ImageCarouselContextKeys.hasSource.key),
		}, { source: undefined, hasSource: false });
	});

	test('open source uses the main editor group and closes only its preview', async () => {
		const sourceUri = URI.file('/images/image.svg');
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg, sourceUri }]);
		instantiation.stub(IFileService, 'hasProvider', () => true);
		const open = instantiation.stub(IEditorService, 'openEditor', async () => editor);
		const close = sinon.stub(group, 'closeEditor').resolves(true);
		await run('imageCarousel.openSource');
		assert.deepStrictEqual({
			resource: open.firstCall.args[0],
			group: open.firstCall.args[1],
			closed: close.firstCall.args[0],
			errors,
		}, {
			resource: { resource: sourceUri, options: { pinned: true } },
			group: instantiation.get(IEditorGroupsService).mainPart.activeGroup,
			closed: editor.input,
			errors: [],
		});
	});

	test('reveal uses the registered Explorer view in the Agents window', async () => {
		const sourceUri = URI.file('/images/image.svg');
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg, sourceUri }]);
		const calls: string[] = [];
		instantiation.stub(IExplorerService, {
			getViewId: () => 'sessions.files.explorer',
			select: async (resource: URI) => { calls.push(resource.toString()); },
		});
		instantiation.stub(IViewsService, {});
		instantiation.stub(IViewsService, 'openView', async (id: string) => {
			calls.push(id);
			return { focus: () => calls.push('focus') };
		});
		sinon.stub(group, 'closeEditor').callsFake(async () => { calls.push('close'); return true; });
		await run('imageCarousel.revealSource');
		assert.deepStrictEqual({ calls, errors }, { calls: ['sessions.files.explorer', 'close', sourceUri.toString(), 'focus'], errors: [] });
	});

	test('save preserves encoding, supplies an extension and respects cancellation', async function () {
		if (isWeb) {
			this.skip();
		}
		await load([{ id: 'image', name: 'Image', mimeType: 'image/svg+xml', data: svg }]);
		const target = URI.file('/saved/image.svg');
		const options: ISaveDialogOptions[] = [];
		let cancel = false;
		instantiation.stub(IFileDialogService, 'defaultFilePath', async () => URI.file('/saved'));
		instantiation.stub(IFileDialogService, 'showSaveDialog', async (option: ISaveDialogOptions) => { options.push(option); return cancel ? undefined : target; });
		const writes: string[] = [];
		instantiation.stub(IFileService, 'writeFile', async (_resource: URI, data: VSBuffer) => {
			writes.push(data.toString());
			return { resource: target };
		});
		await run('imageCarousel.saveMediaAs');
		cancel = true;
		await run('imageCarousel.saveMediaAs');
		assert.deepStrictEqual({ names: options.map(option => option.defaultUri?.path), writes, errors }, {
			names: ['/saved/Image.svg', '/saved/Image.svg'], writes: [svg.toString()], errors: [],
		});
	});
});
