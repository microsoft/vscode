/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId, BrowserViewStorageScope } from '../../../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../../../common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import '../../../electron-browser/features/browserTabManagementFeatures.js';

suite('Browser Duplicate Tab', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('duplicates the clicked inactive tab next to itself with the same data', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const data: IBrowserEditorInputData = {
			id: 'source', url: 'https://example.com/path?query=value#section', title: 'Source', favicon: 'data:image/png;base64,AA==',
			associatedResource: URI.file('/workspace/index.html'),
			session: { scope: BrowserViewStorageScope.Workspace, affinity: 'workspace', network: { authority: 'ssh-remote+host' } },
		};
		let created: IBrowserEditorInputData | undefined;
		instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
			override getOrCreateLazy(options: IBrowserEditorInputData): BrowserEditorInput {
				created = options;
				return duplicate;
			}
		});
		const source = disposables.add(instantiationService.createInstance(BrowserEditorInput, data, async () => { throw new Error('Should not resolve source'); }));
		const duplicate = disposables.add(instantiationService.createInstance(BrowserEditorInput, { id: 'duplicate' }, async () => { throw new Error('Should not resolve duplicate'); }));
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override get activeEditor() { return null; }
			override getEditorByIndex(index: number) { return index === 2 ? source : undefined; }
			override getIndexOfEditor(editor: EditorInput) { return editor === source ? 2 : -1; }
		};
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get activeGroup(): IEditorGroup {
				throw new Error('Clicked tab context must not use the active group');
			}
			override getGroup(id: number) { return id === group.id ? group : undefined; }
		});
		let opened: { editor: EditorInput; options: IEditorOptions | undefined; group: number | undefined } | undefined;
		instantiationService.stub(IEditorService, 'openEditor', async (editor: EditorInput, options?: IEditorOptions, group?: number) => {
			opened = { editor, options, group };
			return undefined;
		});
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(BrowserViewCommandId.DuplicateTab)!.handler(accessor, source.resource, { groupId: 7, editorIndex: 2 }));
		assert.ok(created?.id && created.id !== source.id);
		assert.deepStrictEqual({ ...created, id: source.id }, data);
		assert.deepStrictEqual(opened, { editor: duplicate, options: { pinned: true, index: 3 }, group: 7 });
	});

	test('menu visibility follows the clicked editor including file-backed browser tabs', () => {
		const item = MenuRegistry.getMenuItems(MenuId.EditorTitleContext).find(item => isIMenuItem(item) && item.command.id === BrowserViewCommandId.DuplicateTab);
		assert.ok(item?.when);
		const context = new Context(1, null);
		assert.deepStrictEqual(['workbench.editors.textResourceEditor', BrowserEditorInput.EDITOR_ID].map(editorId => {
			context.setValue('resourceScheme', 'file');
			context.setValue('activeEditor', editorId === BrowserEditorInput.EDITOR_ID ? 'workbench.editors.textResourceEditor' : BrowserEditorInput.EDITOR_ID);
			context.setValue('editorTitleContextEditorId', editorId);
			return item.when!.evaluate(context);
		}), [false, true]);
	});
});
