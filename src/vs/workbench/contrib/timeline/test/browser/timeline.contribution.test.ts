/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService, WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { ExplorerItem } from '../../../files/common/explorerModel.js';
import { ITimelineService, TimelinePaneId } from '../../common/timeline.js';
import '../../browser/timeline.contribution.js';

suite('Open Timeline command', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createExplorerItem(path: string, isDirectory: boolean): ExplorerItem {
		return new ExplorerItem(URI.file(path), upcastPartial<IFileService>({}), upcastPartial<IConfigurationService>({}), NullFilesConfigurationService, undefined, isDirectory);
	}

	async function runCommand(options: { argument?: URI; activeEditor?: string; explorerFocus?: ExplorerItem }): Promise<string[]> {
		const disposables = new DisposableStore();
		try {
			const calls: string[] = [];
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			instantiationService.stub(IListService, disposables.add(new ListService()));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				activeEditor: options.activeEditor ? disposables.add(new TestEditorInput(URI.file(options.activeEditor), 'testEditor')) : undefined,
			}));
			instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
				openView: async id => { calls.push(`openView ${id}`); return null; },
			}));
			instantiationService.stub(ITimelineService, upcastPartial<ITimelineService>({
				setUri: async uri => { calls.push(`setUri ${uri.path}`); },
			}));

			if (options.explorerFocus) {
				const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
				disposables.add(toDisposable(() => container.remove()));
				const list = disposables.add(instantiationService.createInstance(WorkbenchList<ExplorerItem>, 'TimelineCommandTest', container,
					{ getHeight: () => 22, getTemplateId: () => 'item' },
					[{ templateId: 'item', renderTemplate: () => undefined, renderElement: () => { }, disposeTemplate: () => { } }],
					{ accessibilityProvider: { getAriaLabel: item => item.name, getWidgetAriaLabel: () => 'Timeline Command Test' } }
				));
				list.layout(100);
				list.splice(0, 0, [options.explorerFocus]);
				list.setFocus([0]);
				list.domFocus();
				// The browser skips the focus event when the test window lacks OS focus, so dispatch it for the list service
				list.getHTMLElement().dispatchEvent(new FocusEvent('focus'));
			}

			await instantiationService.invokeFunction(CommandsRegistry.getCommand('files.openTimeline')!.handler, options.argument);
			return calls;
		} finally {
			disposables.dispose();
		}
	}

	test('resolves the resource from the argument, the focused file or the active editor', async () => {
		assert.deepStrictEqual({
			argument: await runCommand({ argument: URI.file('/workspace/argument.txt'), activeEditor: '/workspace/active.txt' }),
			activeEditor: await runCommand({ activeEditor: '/workspace/active.txt' }),
			focusedFile: await runCommand({ activeEditor: '/workspace/active.txt', explorerFocus: createExplorerItem('/workspace/focused.txt', false) }),
			focusedFolder: await runCommand({ activeEditor: '/workspace/active.txt', explorerFocus: createExplorerItem('/workspace/folder', true) }),
			noResource: await runCommand({}),
		}, {
			argument: ['setUri /workspace/argument.txt'],
			activeEditor: ['setUri /workspace/active.txt'],
			focusedFile: ['setUri /workspace/focused.txt'],
			focusedFolder: ['setUri /workspace/active.txt'],
			noResource: [`openView ${TimelinePaneId}`],
		});
	});
});
