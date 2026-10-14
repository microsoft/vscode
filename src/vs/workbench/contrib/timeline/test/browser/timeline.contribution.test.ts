/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestEditorInput } from '../../../../test/browser/workbenchTestServices.js';
import { ITimelineService, TimelinePaneId } from '../../common/timeline.js';
import '../../browser/timeline.contribution.js';

suite('Open Timeline command', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function runCommand(options: { argument?: URI; activeEditor?: string }): Promise<string[]> {
		const disposables = new DisposableStore();
		try {
			const calls: string[] = [];
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IListService, upcastPartial<IListService>({ lastFocusedList: undefined }));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				activeEditor: options.activeEditor ? disposables.add(new TestEditorInput(URI.file(options.activeEditor), 'testEditor')) : undefined,
			}));
			instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
				openView: async id => { calls.push(`openView ${id}`); return null; },
			}));
			instantiationService.stub(ITimelineService, upcastPartial<ITimelineService>({
				setUri: async uri => { calls.push(`setUri ${uri.path}`); },
			}));

			await instantiationService.invokeFunction(CommandsRegistry.getCommand('files.openTimeline')!.handler, options.argument);
			return calls;
		} finally {
			disposables.dispose();
		}
	}

	test('resolves the resource from the argument or the active editor', async () => {
		assert.deepStrictEqual({
			argument: await runCommand({ argument: URI.file('/workspace/argument.txt'), activeEditor: '/workspace/active.txt' }),
			activeEditor: await runCommand({ activeEditor: '/workspace/active.txt' }),
			noResource: await runCommand({}),
		}, {
			argument: ['setUri /workspace/argument.txt'],
			activeEditor: ['setUri /workspace/active.txt'],
			noResource: [`openView ${TimelinePaneId}`],
		});
	});
});
