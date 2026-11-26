/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { withAsyncTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { CommentController } from '../../browser/commentsController.js';
import { ICommentInfo, ICommentService } from '../../browser/commentService.js';
import { AGENTS_WINDOW_EDITOR_COMMENTS_SETTING } from '../../common/commentsConfiguration.js';

suite('CommentController', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows comments in the Agents window only while its setting is enabled', async () => {
		const configurationService = new TestConfigurationService({ [AGENTS_WINDOW_EDITOR_COMMENTS_SETTING]: false });
		const contextKeyService = new MockContextKeyService();
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		const commentService = new class extends mock<ICommentService>() {
			override readonly isCommentingEnabled = true;
			override readonly onDidDeleteDataProvider = Event.None;
			override readonly onDidSetDataProvider = Event.None;
			override readonly onDidUpdateCommentingRanges = Event.None;
			override readonly onDidSetResourceCommentInfos = Event.None;
			override readonly onDidChangeCommentingEnabled = Event.None;
			override readonly onDidUpdateCommentThreads = Event.None;
			override readonly onDidChangeCurrentCommentThread = Event.None;
			override getDocumentComments(resource: URI): Promise<ICommentInfo[]> {
				return Promise.resolve([{ uniqueOwner: 'test', threads: [], commentingRanges: { resource, ranges: [new Range(1, 1, 2, 1)], fileComments: false } }]);
			}
			override resourceHasCommentingRanges(): boolean {
				return false;
			}
			override registerContinueOnCommentProvider(): IDisposable {
				return Disposable.None;
			}
		}();
		const services = new ServiceCollection(
			[ICommentService, commentService],
			[IConfigurationService, configurationService],
			[IContextKeyService, contextKeyService],
			[IContextMenuService, new class extends mock<IContextMenuService>() { }()],
			[IQuickInputService, new class extends mock<IQuickInputService>() { }()],
			[IViewsService, new class extends mock<IViewsService>() { }()],
			[IEditorService, new class extends mock<IEditorService>() { }()],
			[IUriIdentityService, new class extends mock<IUriIdentityService>() { }()],
		);

		await withAsyncTestCodeEditor(['line 1', 'line 2', 'line 3'], { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
			const getState = () => ({
				hasCommentingRanges: editor.getModel().getAllDecorations().some(decoration => decoration.options.description === 'commenting-range-decorator'),
				reservesSpace: editor.getRawOptions().extraEditorClassName?.split(' ').includes('inline-comment') ?? false,
			});
			const setEnabled = async (enabled: boolean) => {
				configurationService.setUserConfiguration(AGENTS_WINDOW_EDITOR_COMMENTS_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === AGENTS_WINDOW_EDITOR_COMMENTS_SETTING }));
				await timeout(0);
			};

			const controller = instantiationService.createInstance(CommentController, editor);
			try {
				await timeout(0);
				const initiallyDisabled = getState();
				await setEnabled(true);
				const enabled = getState();
				await setEnabled(false);

				assert.deepStrictEqual({ initiallyDisabled, enabled, disabled: getState() }, {
					initiallyDisabled: { hasCommentingRanges: false, reservesSpace: false },
					enabled: { hasCommentingRanges: true, reservesSpace: true },
					disabled: { hasCommentingRanges: false, reservesSpace: false },
				});
			} finally {
				controller.dispose();
			}
		});
	});
});
