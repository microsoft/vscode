/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { extUri } from '../../../../../base/common/resources.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { CommentThread } from '../../../../../editor/common/languages.js';
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
import { ReviewZoneWidget } from '../../browser/commentThreadZoneWidget.js';
import { ICommentThreadChangedEvent } from '../../common/commentModel.js';
import { AGENTS_WINDOW_EDITOR_COMMENTS_SETTING } from '../../common/commentsConfiguration.js';

suite('CommentController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createThread(line: number): CommentThread<IRange> {
		return new class extends mock<CommentThread<IRange>>() {
			override readonly threadId = `thread-${line}`;
			override readonly range = new Range(line, 1, line, 1);
			override readonly comments = [];
			override readonly isDisposed = false;
			override resource: string | null = null;
		}();
	}

	/**
	 * Shows the threads of a comment controller in an editor, in fake widgets that record when they are displayed,
	 * updated and disposed, and runs the test with a way to compute the comments again.
	 * @param display Lets the test decide when displaying a thread's widget finishes.
	 */
	async function withCommentWidgets(getThreads: () => readonly CommentThread<IRange>[], display: () => Promise<void>, run: (recompute: () => Promise<void>, events: readonly string[], add: (thread: CommentThread<IRange>) => void, change: (thread: CommentThread<IRange>) => void) => Promise<void>): Promise<void> {
		const onDidUpdateCommentingRanges = store.add(new Emitter<{ uniqueOwner: string }>());
		const onDidUpdateCommentThreads = store.add(new Emitter<ICommentThreadChangedEvent>());
		const commentService = new class extends mock<ICommentService>() {
			override readonly isCommentingEnabled = true;
			override readonly onDidDeleteDataProvider = Event.None;
			override readonly onDidSetDataProvider = Event.None;
			override readonly onDidUpdateCommentingRanges = onDidUpdateCommentingRanges.event;
			override readonly onDidSetResourceCommentInfos = Event.None;
			override readonly onDidChangeCommentingEnabled = Event.None;
			override readonly onDidUpdateCommentThreads = onDidUpdateCommentThreads.event;
			override readonly onDidChangeCurrentCommentThread = Event.None;
			override getDocumentComments(resource: URI): Promise<ICommentInfo[]> {
				return Promise.resolve([{ uniqueOwner: 'test', threads: [...getThreads()], commentingRanges: { resource, ranges: [new Range(1, 1, 3, 1)], fileComments: false } }]);
			}
			override removeContinueOnComment(): undefined {
				return undefined;
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
			[IConfigurationService, new TestConfigurationService({ 'diffEditor.renderSideBySide': true })],
			[IContextKeyService, new MockContextKeyService()],
			[IContextMenuService, new class extends mock<IContextMenuService>() { }()],
			[IQuickInputService, new class extends mock<IQuickInputService>() { }()],
			[IViewsService, new class extends mock<IViewsService>() { }()],
			[IEditorService, new class extends mock<IEditorService>() { }()],
			[IUriIdentityService, new class extends mock<IUriIdentityService>() { override readonly extUri = extUri; }()],
		);

		await withAsyncTestCodeEditor(['line 1', 'line 2', 'line 3'], { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
			const events: string[] = [];
			const createWidget = (uniqueOwner: string, thread: CommentThread<IRange>) => new class extends mock<ReviewZoneWidget>() {
				override get uniqueOwner() {
					return uniqueOwner;
				}
				override get commentThread() {
					return thread;
				}
				override get onDidChangeExpandedState() {
					return Event.None;
				}
				override get onDidClose() {
					return Event.None;
				}
				override async display(): Promise<void> {
					events.push(`display:${thread.threadId}`);
					await display();
				}
				override async update(): Promise<void> {
					events.push(`update:${thread.threadId}`);
				}
				override getPendingComments() {
					return { newComment: undefined, edits: {} };
				}
				override dispose(): void {
					events.push(`dispose:${thread.threadId}`);
				}
			}();
			sinon.stub(instantiationService, 'createInstance').callThrough()
				.withArgs(ReviewZoneWidget).callsFake((_ctor, _editor, uniqueOwner, thread) => createWidget(uniqueOwner as string, thread as CommentThread<IRange>));

			const controller = instantiationService.createInstance(CommentController, editor);
			try {
				await timeout(0);
				await run(async () => {
					onDidUpdateCommentingRanges.fire({ uniqueOwner: 'test' });
					await timeout(0);
				}, events, thread => {
					thread.resource = editor.getModel().uri.toString();
					onDidUpdateCommentThreads.fire({ uniqueOwner: 'test', owner: 'test', ownerLabel: 'Test', added: [thread], removed: [], changed: [], pending: [] });
				}, thread => {
					thread.resource = editor.getModel().uri.toString();
					onDidUpdateCommentThreads.fire({ uniqueOwner: 'test', owner: 'test', ownerLabel: 'Test', added: [], removed: [], changed: [thread], pending: [] });
				});
			} finally {
				controller.dispose();
			}
		});
	}

	test('keeps the widgets of the threads that are still shown when the comments are computed again', async () => {
		const [first, second, third] = [1, 2, 3].map(createThread);
		let threads = [first, second];
		await withCommentWidgets(() => threads, () => Promise.resolve(), async (recompute, events) => {
			threads = [first, third];
			await recompute();

			assert.deepStrictEqual(events, ['display:thread-1', 'display:thread-2', 'dispose:thread-2', 'update:thread-1', 'display:thread-3']);
		});
	});

	test('shows each thread once when newer comments replace the comments that it is showing', async () => {
		// Displaying a thread's widget waits until the test lets it finish.
		const display = new DeferredPromise<void>();
		const threads = [1, 2].map(createThread);
		await withCommentWidgets(() => threads, () => display.p, async (recompute, events) => {
			await recompute();
			display.complete();
			await timeout(0);

			assert.deepStrictEqual(events, ['display:thread-1', 'display:thread-1', 'dispose:thread-1', 'display:thread-2']);
		});
	});

	test('shows a thread once when it is added while the comments are computed again', async () => {
		let display = Promise.resolve();
		const thread = createThread(1);
		let threads: CommentThread<IRange>[] = [];
		await withCommentWidgets(() => threads, () => display, async (recompute, events, add) => {
			// Displaying the thread waits until the test lets it finish.
			const gate = new DeferredPromise<void>();
			display = gate.p;
			threads = [thread];
			add(thread);
			await timeout(0);
			await recompute();
			gate.complete();
			await timeout(0);

			assert.deepStrictEqual(events, ['display:thread-1', 'display:thread-1', 'dispose:thread-1']);
		});
	});

	test('updates a thread that changes while its widget is being displayed', async () => {
		let display = Promise.resolve();
		const thread = createThread(1);
		await withCommentWidgets(() => [], () => display, async (_recompute, events, add, change) => {
			const gate = new DeferredPromise<void>();
			display = gate.p;
			add(thread);
			await timeout(0);
			change(thread);
			await timeout(0);
			gate.complete();
			await timeout(0);

			assert.deepStrictEqual(events, ['display:thread-1', 'update:thread-1']);
		});
	});

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
