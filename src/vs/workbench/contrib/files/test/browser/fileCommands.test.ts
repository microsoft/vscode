/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../browser/fileConstants.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerView } from '../../browser/views/explorerView.js';
import { SESSIONS_FILES_VIEW_ID, VIEW_ID } from '../../common/files.js';
import '../../browser/fileCommands.js';

suite('Reveal in Explorer command', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/workspace/folder');

	function createServices(viewId: string, selectError?: Error) {
		const instantiation = store.add(new TestInstantiationService());
		const calls: object[] = [];
		const view = upcastPartial<ExplorerView>({
			autoReveal: true,
			setExpanded: expanded => { calls.push({ expanded }); return true; },
			focus: () => { calls.push({ focus: true }); },
		});
		instantiation.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ isInsideWorkspace: () => true }));
		instantiation.stub(IEditorService, upcastPartial<IEditorService>({}));
		instantiation.stub(IListService, upcastPartial<IListService>({}));
		instantiation.stub(IViewsService, upcastPartial<IViewsService>({
			openView: async <T>(id: string, focus?: boolean) => { calls.push({ view: id, focus }); return view as T; },
		}));
		instantiation.stub(IExplorerService, upcastPartial<IExplorerService>({
			getViewId: () => viewId,
			select: async (uri, reveal) => {
				calls.push({ select: uri.toString(), reveal, autoReveal: view.autoReveal });
				if (selectError) {
					throw selectError;
				}
			},
		}));
		return { instantiation, calls, view };
	}

	for (const viewId of [VIEW_ID, SESSIONS_FILES_VIEW_ID]) {
		test(`reveals in the application's Explorer: ${viewId}`, async () => {
			const { instantiation, calls, view } = createServices(viewId);
			await instantiation.invokeFunction(CommandsRegistry.getCommand(REVEAL_IN_EXPLORER_COMMAND_ID)!.handler, resource);
			assert.deepStrictEqual({ calls, autoReveal: view.autoReveal }, {
				calls: [
					{ view: viewId, focus: false },
					{ expanded: true },
					{ select: resource.toString(), reveal: 'force', autoReveal: false },
					{ focus: true },
				],
				autoReveal: true,
			});
		});
	}

	test('restores auto-reveal when selection fails', async () => {
		const error = new Error('Selection failed');
		const { instantiation, view } = createServices(SESSIONS_FILES_VIEW_ID, error);
		await assert.rejects(async () => instantiation.invokeFunction(CommandsRegistry.getCommand(REVEAL_IN_EXPLORER_COMMAND_ID)!.handler, resource), error);
		assert.strictEqual(view.autoReveal, true);
	});
});
