/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatToolInvocationPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { CodeBlockModelCollection } from '../../../../common/widget/codeBlockModelCollection.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { CollapsibleListPool } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IChatTodo, IChatTodoListService } from '../../../../common/tools/chatTodoListService.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';

const testSessionUri = URI.parse('chat-session://test/session1');

/**
 * Regression test for issue #299234.
 *
 * Before the fix, ChatToolInvocationPart's constructor called setTodos()
 * from toolSpecificData every time a part was constructed. Parts can be
 * constructed out of chronological order due to lazy rendering (collapsed
 * thinking/subagent sections), session restore, or scroll virtualization.
 *
 * When an older tool invocation's part was constructed AFTER a newer one,
 * its setTodos() call overwrote the correct state with stale data. The
 * widget then showed incomplete state while the chat text claimed completion.
 *
 * The fix removes the setTodos() call from the constructor entirely.
 */
suite('ChatToolInvocationPart todo list side-effect (issue #299234)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockMarkdownRenderer: IMarkdownRenderer;
	let mockListPool: CollapsibleListPool;
	let mockEditorPool: EditorPool;
	let mockCodeBlockModelCollection: CodeBlockModelCollection;
	let setTodosCalls: { sessionResource: URI; todos: IChatTodo[] }[];

	function createMockRenderContext(): IChatContentPartRenderContext {
		const mockElement: Partial<IChatResponseViewModel> = {
			isComplete: true,
			id: 'test-response-id',
			sessionResource: testSessionUri,
			get model() { return {} as IChatResponseViewModel['model']; }
		};

		return {
			element: mockElement as IChatResponseViewModel,
			inlineTextModels: {} as InlineTextModelCollection,
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			editorPool: mockEditorPool,
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as DiffEditorPool,
			codeBlockModelCollection: mockCodeBlockModelCollection,
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None
		};
	}

	function createSerializedToolInvocationWithTodos(todoList: { id: string; title: string; status: 'not-started' | 'in-progress' | 'completed' }[]): IChatToolInvocationSerialized {
		return {
			kind: 'toolInvocationSerialized',
			toolCallId: 'call-' + Math.random().toString(36).substring(7),
			toolId: 'manage_todo_list',
			invocationMessage: 'Updating TODO list',
			originMessage: undefined,
			pastTenseMessage: 'Updated TODO list',
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: true,
			presentation: undefined,
			source: ToolDataSource.Internal,
			toolSpecificData: {
				kind: 'todoList',
				todoList
			},
		};
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);
		setTodosCalls = [];

		instantiationService.stub(IChatTodoListService, {
			_serviceBrand: undefined,
			onDidUpdateTodos: Event.None,
			getTodos: () => [],
			setTodos: (sessionResource: URI, todos: IChatTodo[]) => {
				setTodosCalls.push({ sessionResource, todos: [...todos] });
			},
			migrateTodos: () => { },
		});

		mockMarkdownRenderer = {
			render: (_markdown: IMarkdownString, _options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown => {
				const element = outElement ?? mainWindow.document.createElement('div');
				const content = typeof _markdown === 'string' ? _markdown : (_markdown.value ?? '');
				element.textContent = content;
				return { element, dispose: () => { } };
			}
		};

		instantiationService.stub(IHoverService, {
			_serviceBrand: undefined,
			showDelayedHover: () => undefined,
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
			showInstantHover: () => undefined,
			hideHover: () => { },
			showAndFocusLastHover: () => { },
			setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
			showManagedHover: () => { }
		});

		mockListPool = {} as CollapsibleListPool;
		mockEditorPool = {} as EditorPool;
		mockCodeBlockModelCollection = {} as CodeBlockModelCollection;
	});

	teardown(() => {
		disposables.dispose();
	});

	function createPart(toolInvocation: IChatToolInvocationSerialized): ChatToolInvocationPart {
		const context = createMockRenderContext();
		const part = store.add(instantiationService.createInstance(
			ChatToolInvocationPart,
			toolInvocation,
			context,
			mockMarkdownRenderer,
			mockListPool,
			mockEditorPool,
			() => 500,
			mockCodeBlockModelCollection,
			new Set<string>(),
			0
		));

		mainWindow.document.body.appendChild(part.domNode);
		disposables.add({ dispose: () => part.domNode.remove() });

		return part;
	}

	test('constructing a part with stale todoList data must not call setTodos', () => {
		const staleTodoData = createSerializedToolInvocationWithTodos([
			{ id: '1', title: 'Task 1', status: 'not-started' },
			{ id: '2', title: 'Task 2', status: 'not-started' },
			{ id: '3', title: 'Task 3', status: 'not-started' },
		]);

		createPart(staleTodoData);

		assert.strictEqual(
			setTodosCalls.length, 0,
			'ChatToolInvocationPart constructor must not call setTodos — ' +
			'before the fix for #299234, this was 1'
		);
	});
});
