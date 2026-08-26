/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../../../base/browser/dom.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { BaseObservable } from '../../../../../../../base/common/observableInternal/observables/baseObservable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { TestMenuService, workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { ChatSubagentContentPart } from '../../../../browser/widget/chatContentParts/chatSubagentContentPart.js';
import { IChatHookPart, IChatMarkdownContent, IChatSubagentToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ChatResponseModelChangeReason } from '../../../../common/model/chatModel.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown, MarkdownRenderOptions } from '../../../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString, isMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { EditorPool, DiffEditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AccessibilityWorkbenchSettingId } from '../../../../../accessibility/browser/accessibilityConfiguration.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { RunSubagentTool } from '../../../../common/tools/builtinTools/runSubagentTool.js';
import { CollapsibleListPool } from '../../../../browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuActionOptions, IMenuService, MenuId, MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatConfiguration } from '../../../../common/constants.js';
import { formatCompactSubagentDuration, getSubagentEditorResource, IOpenSubagentChatContext, OpenSubagentChatActionViewItem, shouldAnimateSubagentToolTransition } from '../../../../browser/widget/chatContentParts/chatSubagentOpenChat.js';

class TestOpenChatActionViewItem extends ActionViewItem {
	constructor(sourceAction: IAction, options: IActionViewItemOptions) {
		super(undefined, new Action(sourceAction.id, sourceAction.label, sourceAction.class, true, context => sourceAction.run(context)), options);
		if (this.action instanceof Action) {
			this._register(this.action);
		}
	}
}

class TestActionViewItemService implements IActionViewItemService {
	declare _serviceBrand: undefined;
	private readonly _onDidChange = new Emitter<MenuId>();
	readonly onDidChange = this._onDidChange.event;
	private _providerAvailable = true;

	get hasChangeListeners(): boolean {
		return this._onDidChange.hasListeners();
	}

	setProviderAvailable(available: boolean): void {
		this._providerAvailable = available;
	}

	fireDidChange(menuId: MenuId): void {
		this._onDidChange.fire(menuId);
	}

	register(_menu: MenuId, _commandId: string | MenuId, _provider: IActionViewItemFactory): { dispose(): void } {
		return { dispose: () => { } };
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
		if (!this._providerAvailable || menu !== MenuId.ChatSubagentContent || commandId !== CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID) {
			return undefined;
		}
		return (action, options) => new TestOpenChatActionViewItem(action, options);
	}
}

class TestSubagentMenuService extends TestMenuService {
	createMenuCalls = 0;
	getMenuActionsCalls = 0;

	constructor(private readonly openChatAction: MenuItemAction) {
		super();
	}

	override createMenu(id: MenuId, contextKeyService: IContextKeyService) {
		this.createMenuCalls++;
		return super.createMenu(id, contextKeyService);
	}

	override getMenuActions(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuActionOptions): ReturnType<IMenuService['getMenuActions']> {
		this.getMenuActionsCalls++;
		if (id === MenuId.ChatSubagentContent) {
			return [['navigation', [this.openChatAction]]];
		}
		return super.getMenuActions(id, contextKeyService, options);
	}
}

suite('ChatSubagentContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type ToolInvocationParameters = IChatToolInvocation.State extends { parameters: infer P } ? P : never;

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockMarkdownRenderer: IMarkdownRenderer;
	let mockAnchorService: IChatMarkdownAnchorService;
	let mockHoverService: IHoverService;
	let mockListPool: CollapsibleListPool;
	let mockEditorPool: EditorPool;
	let announcedToolProgressKeys: Set<string>;
	let actionViewItemService: TestActionViewItemService;
	let menuService: TestSubagentMenuService;
	let markdownRenderCount: number;

	function createMockRenderContext(isComplete: boolean = false, sessionResource: URI = URI.parse('chat-session://test/session1')): IChatContentPartRenderContext {
		const mockElement: Partial<IChatResponseViewModel> = {
			isComplete,
			id: 'test-response-id',
			sessionResource,
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
			currentWidth: observableValue('currentWidth', 500),
			onDidChangeVisibility: Event.None
		};
	}

	function createState(stateType: IChatToolInvocation.StateKind, parameters?: ToolInvocationParameters): IChatToolInvocation.State {
		switch (stateType) {
			case IChatToolInvocation.StateKind.Streaming:
				return {
					type: IChatToolInvocation.StateKind.Streaming,
					partialInput: observableValue('partialInput', {}),
					streamingMessage: observableValue('streamingMessage', undefined)
				};
			case IChatToolInvocation.StateKind.Completed:
				return {
					type: IChatToolInvocation.StateKind.Completed,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					resultDetails: undefined,
					postConfirmed: undefined,
					contentForModel: [{ kind: 'text', value: 'test result' }]
				};
			case IChatToolInvocation.StateKind.Executing:
				return {
					type: IChatToolInvocation.StateKind.Executing,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					progress: observableValue('progress', { message: undefined, progress: undefined })
				};
			case IChatToolInvocation.StateKind.WaitingForAuthentication:
				return {
					type: IChatToolInvocation.StateKind.WaitingForAuthentication,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					server: {
						id: 'server',
						name: 'MCP server',
						resource: 'https://mcp.example.com',
					},
					cancel: () => { },
				};
			case IChatToolInvocation.StateKind.WaitingForConfirmation:
				return {
					type: IChatToolInvocation.StateKind.WaitingForConfirmation,
					parameters,
					confirmationMessages: {
						title: 'Confirm action',
						message: 'Are you sure you want to proceed?'
					},
					confirm: () => { }
				};
			case IChatToolInvocation.StateKind.WaitingForPostApproval:
				return {
					type: IChatToolInvocation.StateKind.WaitingForPostApproval,
					parameters,
					confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					resultDetails: undefined,
					contentForModel: [{ kind: 'text', value: 'test result' }],
					confirm: () => { }
				};
			case IChatToolInvocation.StateKind.Cancelled:
				return {
					type: IChatToolInvocation.StateKind.Cancelled,
					parameters,
					reason: ToolConfirmKind.Denied
				};
		}
	}

	function createMockToolInvocation(options: {
		toolId?: string;
		toolCallId?: string;
		subAgentInvocationId?: string;
		toolSpecificData?: IChatSubagentToolInvocationData;
		stateType?: IChatToolInvocation.StateKind;
		parameters?: ToolInvocationParameters;
		invocationMessage?: string;
	} = {}): IChatToolInvocation {
		const stateType = options.stateType ?? IChatToolInvocation.StateKind.Streaming;
		const stateValue = createState(stateType, options.parameters);
		const toolCallId = options.toolCallId ?? 'tool-call-' + Math.random().toString(36).substring(7);

		const toolInvocation: IChatToolInvocation = {
			presentation: undefined,
			toolSpecificData: options.toolSpecificData ?? {
				kind: 'subagent',
				description: 'Test subagent description',
				agentName: 'TestAgent',
				prompt: 'Test prompt'
			},
			originMessage: undefined,
			invocationMessage: options.invocationMessage ?? 'Running subagent',
			pastTenseMessage: undefined,
			source: ToolDataSource.Internal,
			toolId: options.toolId ?? RunSubagentTool.Id,
			toolCallId: toolCallId,
			subAgentInvocationId: options.subAgentInvocationId,
			state: observableValue('state', stateValue),
			toolSpecificDataKind: observableValue('test', (options.toolSpecificData ?? { kind: 'subagent' }).kind),
			isAttachedToThinking: false,
			kind: 'toolInvocation',
			toJSON: () => createMockSerializedToolInvocation({
				toolId: options.toolId ?? RunSubagentTool.Id,
				subAgentInvocationId: options.subAgentInvocationId,
				toolSpecificData: options.toolSpecificData,
				isComplete: stateType === IChatToolInvocation.StateKind.Completed
			})
		};

		return toolInvocation;
	}

	function createMockSerializedToolInvocation(options: {
		toolId?: string;
		subAgentInvocationId?: string;
		toolSpecificData?: IChatSubagentToolInvocationData;
		isComplete?: boolean;
	} = {}): IChatToolInvocationSerialized {
		return {
			presentation: undefined,
			toolSpecificData: options.toolSpecificData ?? {
				kind: 'subagent',
				description: 'Test subagent description',
				agentName: 'TestAgent',
				prompt: 'Test prompt',
				result: 'Test result text'
			},
			originMessage: undefined,
			invocationMessage: 'Running subagent',
			pastTenseMessage: undefined,
			resultDetails: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: options.isComplete ?? true,
			toolCallId: options.subAgentInvocationId ?? 'test-tool-call-id',
			toolId: options.toolId ?? RunSubagentTool.Id,
			source: ToolDataSource.Internal,
			subAgentInvocationId: options.subAgentInvocationId,
			kind: 'toolInvocationSerialized'
		};
	}

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);
		markdownRenderCount = 0;

		// Create a mock markdown renderer
		mockMarkdownRenderer = {
			render: (_markdown: IMarkdownString, _options?: MarkdownRenderOptions, outElement?: HTMLElement): IRenderedMarkdown => {
				markdownRenderCount++;
				const element = outElement ?? mainWindow.document.createElement('div');
				const content = typeof _markdown === 'string' ? _markdown : (_markdown.value ?? '');
				element.textContent = content;
				return {
					element,
					dispose: () => { }
				};
			}
		};

		// Mock the anchor service
		mockAnchorService = {
			_serviceBrand: undefined,
			register: () => ({ dispose: () => { } }),
			lastFocusedAnchor: undefined
		};
		instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);

		// Mock hover service
		mockHoverService = {
			_serviceBrand: undefined,
			showDelayedHover: () => undefined,
			setupDelayedHover: () => ({ dispose: () => { } }),
			setupDelayedHoverAtMouse: () => ({ dispose: () => { } }),
			showInstantHover: () => undefined,
			hideHover: () => { },
			showAndFocusLastHover: () => { },
			setupManagedHover: () => ({ dispose: () => { }, show: () => { }, hide: () => { }, update: () => { } }),
			showManagedHover: () => { }
		};
		instantiationService.stub(IHoverService, mockHoverService);
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
			override isMotionReduced(): boolean { return false; }
		}());
		actionViewItemService = new TestActionViewItemService();
		instantiationService.stub(IActionViewItemService, actionViewItemService);
		menuService = new TestSubagentMenuService(new MenuItemAction(
			{ id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' },
			undefined,
			{ shouldForwardArgs: true },
			undefined,
			undefined,
			instantiationService.get(IContextKeyService),
			instantiationService.get(ICommandService),
		));
		instantiationService.stub(IMenuService, menuService);
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, true);

		// Mock list pool and editor pool
		mockListPool = {} as CollapsibleListPool;
		mockEditorPool = {} as EditorPool;
		announcedToolProgressKeys = new Set();
	});

	teardown(() => {
		disposables.dispose();
	});

	function createPart(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		idOverride?: string
	): ChatSubagentContentPart {
		const part = store.add(instantiationService.createInstance(
			ChatSubagentContentPart,
			idOverride ?? toolInvocation.subAgentInvocationId ?? toolInvocation.toolCallId,
			toolInvocation,
			context,
			mockMarkdownRenderer,
			mockListPool,
			mockEditorPool,
			() => 500,
			announcedToolProgressKeys
		));

		mainWindow.document.body.appendChild(part.domNode);
		disposables.add({ dispose: () => part.domNode.remove() });

		return part;
	}

	function getCollapseButton(part: ChatSubagentContentPart): HTMLElement | undefined {
		const button = part.domNode.querySelector('.chat-used-context-label > .monaco-button');
		return isHTMLElement(button) ? button : undefined;
	}

	function getCollapseButtonLabel(button: HTMLElement): HTMLElement | undefined {
		const label = button.querySelector('.monaco-button-mdlabel');
		return isHTMLElement(label) ? label : undefined;
	}

	function getCollapseButtonIcon(button: HTMLElement): HTMLElement | undefined {
		const icon = button.firstElementChild;
		return isHTMLElement(icon) ? icon : undefined;
	}

	function getWrapperElement(part: ChatSubagentContentPart): HTMLElement | undefined {
		const wrapper = part.domNode.querySelector('.chat-thinking-collapsible');
		return isHTMLElement(wrapper) ? wrapper : undefined;
	}

	function getOpenChatContext(part: ChatSubagentContentPart): IOpenSubagentChatContext | undefined {
		return (part as unknown as { _openChatToolbar?: { actionBar?: { context?: IOpenSubagentChatContext } } })._openChatToolbar?.actionBar?.context;
	}

	function setOpenChatOnlyMode(part: ChatSubagentContentPart, enabled: boolean): void {
		const toolbar = (part as unknown as { _openChatToolbar?: { getItemsLength(): number; getItemAction(index: number): Action | undefined } })._openChatToolbar;
		assert.ok(toolbar);
		const action = store.add(new Action('openSubagent', 'Open Subagent', '', enabled));
		toolbar.getItemsLength = () => 1;
		toolbar.getItemAction = () => action;
		(part as unknown as { _updateOpenChatOnlyMode(): void })._updateOpenChatOnlyMode();
	}

	suite('Basic rendering', () => {
		test('should create subagent part with correct classes', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.ok(part.domNode.classList.contains('chat-thinking-box'), 'Should have chat-thinking-box class');
			assert.ok(part.domNode.classList.contains('chat-subagent-part'), 'Should have chat-subagent-part class');
			assert.ok(part.domNode.classList.contains('chat-thinking-fixed-mode'), 'Should have chat-thinking-fixed-mode class');
			assert.ok(part.domNode.classList.contains('chat-collapsible-content-animatable'), 'Should prepare expandable content for animation');
			assert.strictEqual(part.domNode.classList.contains('chat-collapsible-content-animated'), false, 'Should preserve the collapsed streaming preview at rest');
		});

		test('should render the open-chat toolbar beside the collapse button', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const header = part.domNode.querySelector('.chat-used-context-label');
			const toolbar = header?.querySelector('.chat-subagent-open-chat-toolbar');
			const collapseButton = getCollapseButton(part);

			assert.deepStrictEqual({
				hasChatClass: part.domNode.classList.contains('chat-subagent-has-chat'),
				toolbarParentIsHeader: toolbar?.parentElement === header,
				toolbarPrecedesCollapseButton: toolbar?.nextElementSibling === collapseButton,
			}, {
				hasChatClass: true,
				toolbarParentIsHeader: true,
				toolbarPrecedesCollapseButton: true,
			});
		});

		test('should publish only specialized subagent types to the rich pill', () => {
			const specialized = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Audit narrative against captures',
					agentDisplayName: 'Code Reviewer',
					agentName: 'code-reviewer',
					chatResource: 'ahp-chat://subagent/test/explore',
				}
			}), createMockRenderContext(false));
			const generic = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Install npm dependencies',
					agentDisplayName: 'Task',
					agentName: 'task',
					chatResource: 'ahp-chat://subagent/test/task',
				}
			}), createMockRenderContext(false), 'generic-subagent');

			assert.deepStrictEqual({
				specialized: getOpenChatContext(specialized)?.agentType,
				generic: getOpenChatContext(generic)?.agentType,
			}, {
				specialized: 'Code Reviewer',
				generic: undefined,
			});
		});

		test('should preserve inline rendering when rich subagent rendering is disabled', () => {
			const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			configService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));

			assert.deepStrictEqual({
				hasChatClass: part.domNode.classList.contains('chat-subagent-has-chat'),
				hasToolbar: !!part.domNode.querySelector('.chat-subagent-open-chat-toolbar'),
				collapseButtonVisible: getCollapseButton(part)?.style.display !== 'none',
			}, {
				hasChatClass: false,
				hasToolbar: false,
				collapseButtonVisible: true,
			});
		});

		test('should derive the editor resource from the parent session and subagent chat id', () => {
			const resource = getSubagentEditorResource({
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
				parentSessionResource: 'agent-host-copilotcli:/session',
			});

			assert.deepStrictEqual(resource && {
				scheme: resource.scheme,
				path: resource.path,
				fragment: resource.fragment,
				chatResource: new URLSearchParams(resource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM),
			}, {
				scheme: 'agent-host-copilotcli',
				path: '/session',
				fragment: 'subagent/tool-call',
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
			});
		});

		test('should show compact elapsed time without worked-for copy', () => {
			assert.deepStrictEqual({
				running: formatCompactSubagentDuration(1_000, undefined, 66_000),
				completed: formatCompactSubagentDuration(1_000, 65_000),
			}, {
				running: '1m 5s',
				completed: '1m 5s',
			});
		});

		test('should render the specialized subagent type before the title', () => {
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				{
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
					parentSessionResource: 'agent-host-copilotcli:/session',
					title: 'Audit narrative against captures',
					agentType: 'Explore',
				},
				action,
				{},
				false,
			));
			const container = mainWindow.document.createElement('div');
			viewItem.render(container);
			const pill = container.querySelector('.chat-subagent-pill-content');
			const agentType = pill?.querySelector('.chat-subagent-pill-agent-type');
			const title = pill?.querySelector('.chat-subagent-pill-label');

			assert.deepStrictEqual({
				agentType: agentType?.textContent,
				agentTypePrecedesTitle: agentType?.nextElementSibling === title,
				ariaLabel: container.getAttribute('aria-label'),
			}, {
				agentType: 'Explore',
				agentTypePrecedesTitle: true,
				ariaLabel: 'Open subagent chat: Audit narrative against captures. Subagent type Explore',
			});
		});

		test('should animate only when the active tool call changes', () => {
			assert.deepStrictEqual({
				workingToWorking: shouldAnimateSubagentToolTransition(undefined, false, undefined, false),
				workingToTool: shouldAnimateSubagentToolTransition(undefined, false, 'tool-1', true),
				sameTool: shouldAnimateSubagentToolTransition('tool-1', true, 'tool-1', true),
				differentTool: shouldAnimateSubagentToolTransition('tool-1', true, 'tool-2', true),
				toolToWorking: shouldAnimateSubagentToolTransition('tool-1', true, undefined, false),
			}, {
				workingToWorking: false,
				workingToTool: true,
				sameTool: false,
				differentTool: true,
				toolToWorking: true,
			});
		});

		test('should settle a queued same-tool label update without starting another transition', () => {
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				undefined,
				action,
				{},
				false,
			));
			viewItem.render(mainWindow.document.createElement('div'));
			const internals = viewItem as unknown as {
				_displayedToolCallId: string;
				_displayedToolLabel: string;
				_targetToolCallId: string;
				_targetToolLabel: string;
				_toolTransitionPhase: 'idle' | 'out' | 'in';
				_runToolTransition(): void;
			};
			internals._displayedToolCallId = 'tool-1';
			internals._displayedToolLabel = 'Read';
			internals._targetToolCallId = 'tool-1';
			internals._targetToolLabel = 'Reading package.json';
			internals._toolTransitionPhase = 'idle';

			internals._runToolTransition();

			assert.deepStrictEqual({
				displayedLabel: internals._displayedToolLabel,
				transitionPhase: internals._toolTransitionPhase,
			}, {
				displayedLabel: 'Reading package.json',
				transitionPhase: 'idle',
			});
		});

		test('should reserve an activity row before the first tool call', () => {
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				{
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
					parentSessionResource: 'agent-host-copilotcli:/session',
					isActive: true,
				},
				action,
				{},
				false,
			));
			const container = mainWindow.document.createElement('div');
			viewItem.render(container);
			const activity = container.querySelector<HTMLElement>('.chat-subagent-pill-active-tool');

			assert.deepStrictEqual({
				hidden: activity?.classList.contains('hidden'),
				label: activity?.querySelector('.chat-subagent-pill-active-tool-label')?.textContent,
				hasWorkingIcon: activity?.querySelector('.chat-subagent-pill-active-tool-icon')?.classList.contains('codicon-comment-compact'),
				ariaLabel: container.getAttribute('aria-label'),
			}, {
				hidden: false,
				label: 'Working on it...',
				hasWorkingIcon: true,
				ariaLabel: 'Open Subagent. Subagent is working',
			});
		});

		test('should hide the activity row while a confirmation is shown', () => {
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				{
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
					parentSessionResource: 'agent-host-copilotcli:/session',
					isActive: true,
					confirmationCount: 1,
					activeToolCallId: 'tool-1',
					activeToolLabel: 'Run npm i in VS Code repository',
					activeToolIcon: Codicon.terminal,
				},
				action,
				{},
				false,
			));
			const container = mainWindow.document.createElement('div');
			viewItem.render(container);
			const activity = container.querySelector<HTMLElement>('.chat-subagent-pill-active-tool');

			assert.deepStrictEqual({
				hidden: activity?.classList.contains('hidden'),
				ariaLabel: container.getAttribute('aria-label'),
			}, {
				hidden: true,
				ariaLabel: 'Open Subagent. Subagent is waiting for input',
			});
		});

		test('should sanitize agent-provided markdown in active tool labels', () => {
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				{
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
					parentSessionResource: 'agent-host-copilotcli:/session',
					isActive: true,
					activeToolCallId: 'tool-1',
					activeToolLabel: '![remote](https://example.com/image.png)',
					activeToolIcon: Codicon.search,
				},
				action,
				{},
				false,
			));
			const container = mainWindow.document.createElement('div');
			viewItem.render(container);

			assert.strictEqual(container.querySelectorAll('.chat-subagent-pill-active-tool-label img').length, 0);
		});

		test('should transition between generic and tool activity semantics', () => {
			const baseContext = {
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
				parentSessionResource: 'agent-host-copilotcli:/session',
				isActive: true,
			};
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				baseContext,
				action,
				{},
				false,
			));
			const container = mainWindow.document.createElement('div');
			viewItem.render(container);
			const internals = viewItem as unknown as { _finishToolTransition(): void };

			viewItem.setActionContext({
				...baseContext,
				activeToolCallId: 'tool-1',
				activeToolLabel: 'Search Tools',
				activeToolIcon: Codicon.search,
			});
			internals._finishToolTransition();
			const toolState = {
				label: container.querySelector('.chat-subagent-pill-active-tool-label')?.textContent,
				ariaLabel: container.getAttribute('aria-label'),
			};
			viewItem.setActionContext(baseContext);
			internals._finishToolTransition();

			assert.deepStrictEqual({
				toolState,
				workingLabel: container.querySelector('.chat-subagent-pill-active-tool-label')?.textContent,
				workingAriaLabel: container.getAttribute('aria-label'),
			}, {
				toolState: {
					label: 'Search Tools',
					ariaLabel: 'Open Subagent. Subagent is working. Active tool Search Tools',
				},
				workingLabel: 'Working on it...',
				workingAriaLabel: 'Open Subagent. Subagent is working',
			});
		});

		test('should open the subagent chat directly in an editor', async () => {
			let openedResource: URI | undefined;
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
				openSession: async resource => {
					openedResource = resource;
					return undefined;
				},
			}));
			const action = store.add(new Action('openSubagent', 'Open Subagent'));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				{
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
					parentSessionResource: 'agent-host-copilotcli:/session',
					title: 'Review correctness risks',
				},
				action,
				{},
				true,
			));

			await viewItem.action.run({
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
				parentSessionResource: 'agent-host-copilotcli:/session',
				title: 'Review correctness risks',
			});

			assert.deepStrictEqual(openedResource && {
				scheme: openedResource.scheme,
				path: openedResource.path,
				fragment: openedResource.fragment,
			}, {
				scheme: 'agent-host-copilotcli',
				path: '/session',
				fragment: 'subagent/tool-call',
			});
		});

		test('should trigger pointer activation only from the bordered pill', () => {
			let runCount = 0;
			const action = store.add(new Action('openSubagent', 'Open Subagent', undefined, true, () => { runCount++; }));
			const viewItem = store.add(instantiationService.createInstance(
				OpenSubagentChatActionViewItem,
				{
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call',
					parentSessionResource: 'agent-host-copilotcli:/session',
				},
				action,
				{},
				false,
			));
			const container = mainWindow.document.createElement('div');
			viewItem.render(container);
			const activeTool = container.querySelector<HTMLElement>('.chat-subagent-pill-active-tool');
			const pill = container.querySelector<HTMLElement>('.chat-subagent-pill-content');
			assert.ok(activeTool);
			assert.ok(pill);

			activeTool.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
			const outsideRunCount = runCount;
			pill.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));

			assert.deepStrictEqual({
				outsideRunCount,
				pillRunCount: runCount,
			}, {
				outsideRunCount: 0,
				pillRunCount: 1,
			});
		});

		test('should use a menu snapshot without persistent menu or action-view listeners', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));

			assert.deepStrictEqual({
				hasToolbar: !!(part as unknown as { _openChatToolbar?: object })._openChatToolbar,
				createMenuCalls: menuService.createMenuCalls,
				getMenuActionsCalls: menuService.getMenuActionsCalls,
				hasActionViewListeners: actionViewItemService.hasChangeListeners,
			}, {
				hasToolbar: true,
				createMenuCalls: 0,
				getMenuActionsCalls: 1,
				hasActionViewListeners: false,
			});
		});

		test('should hide the complete collapsible surface when the open-chat action is available', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			setOpenChatOnlyMode(part, true);

			const collapseButton = getCollapseButton(part);
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			assert.ok(collapseButton);
			assert.ok(animationContainer);
			assert.deepStrictEqual({
				openChatOnlyClass: part.domNode.classList.contains('chat-subagent-open-chat-only'),
				collapseButtonDisplay: collapseButton.style.display,
				animationDisplay: animationContainer.style.display,
			}, {
				openChatOnlyClass: true,
				collapseButtonDisplay: 'none',
				animationDisplay: 'none',
			});
		});

		test('should hydrate open-chat-only mode when the action view registers after rendering', () => {
			actionViewItemService.setProviderAvailable(false);
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const listeningBeforeRegistration = actionViewItemService.hasChangeListeners;

			actionViewItemService.setProviderAvailable(true);
			actionViewItemService.fireDidChange(MenuId.ChatSubagentContent);

			const collapseButton = getCollapseButton(part);
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			assert.deepStrictEqual({
				listeningBeforeRegistration,
				listeningAfterRegistration: actionViewItemService.hasChangeListeners,
				openChatOnlyClass: part.domNode.classList.contains('chat-subagent-open-chat-only'),
				collapseButtonDisplay: collapseButton?.style.display,
				animationDisplay: animationContainer?.style.display,
			}, {
				listeningBeforeRegistration: true,
				listeningAfterRegistration: false,
				openChatOnlyClass: true,
				collapseButtonDisplay: 'none',
				animationDisplay: 'none',
			});
		});

		test('should reserve the pill presentation while an Agent Host child chat hydrates', () => {
			actionViewItemService.setProviderAvailable(false);
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
				}
			}), createMockRenderContext(false, URI.parse('agent-host-copilotcli:/session')));

			const collapseButton = getCollapseButton(part);
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			assert.deepStrictEqual({
				hasToolbar: !!part.domNode.querySelector('.chat-subagent-open-chat-toolbar'),
				collapseButtonDisplay: collapseButton?.style.display,
				animationDisplay: animationContainer?.style.display,
			}, {
				hasToolbar: false,
				collapseButtonDisplay: 'none',
				animationDisplay: 'none',
			});
		});

		test('should preserve the collapsible surface when the open-chat action is unavailable', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			setOpenChatOnlyMode(part, false);

			const collapseButton = getCollapseButton(part);
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			assert.ok(collapseButton);
			assert.ok(animationContainer);
			assert.deepStrictEqual({
				openChatOnlyClass: part.domNode.classList.contains('chat-subagent-open-chat-only'),
				collapseButtonDisplay: collapseButton.style.display,
				animationDisplay: animationContainer.style.display,
			}, {
				openChatOnlyClass: false,
				collapseButtonDisplay: '',
				animationDisplay: '',
			});
		});

		test('should publish the model and newest child tool intent to the open-chat pill', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Test subagent description',
					chatResource: 'ahp-chat://subagent/test/tool-call',
					modelName: 'Claude Sonnet 4',
				}
			}), createMockRenderContext(false));

			part.trackToolState(createMockToolInvocation({
				toolCallId: 'child-tool-1',
				toolId: 'search',
				invocationMessage: '  Search\n  the codebase  ',
				stateType: IChatToolInvocation.StateKind.Executing,
			}));
			const first = getOpenChatContext(part);
			part.trackToolState(createMockToolInvocation({
				toolCallId: 'child-tool-2',
				toolId: 'read_file',
				invocationMessage: 'Read package.json',
				stateType: IChatToolInvocation.StateKind.Executing,
			}));
			const second = getOpenChatContext(part);
			part.markAsInactive();

			assert.deepStrictEqual({
				firstModel: first?.modelName,
				firstToolCallId: first?.activeToolCallId,
				firstTool: first?.activeToolLabel,
				firstToolIcon: first?.activeToolIcon?.id,
				secondTool: second?.activeToolLabel,
				secondToolCallId: second?.activeToolCallId,
				secondToolIcon: second?.activeToolIcon?.id,
				completedTool: getOpenChatContext(part)?.activeToolLabel,
				completedToolIcon: getOpenChatContext(part)?.activeToolIcon,
			}, {
				firstModel: 'Claude Sonnet 4',
				firstToolCallId: 'child-tool-1',
				firstTool: 'Search the codebase',
				firstToolIcon: 'search',
				secondTool: 'Read package.json',
				secondToolCallId: 'child-tool-2',
				secondToolIcon: 'book',
				completedTool: undefined,
				completedToolIcon: undefined,
			});
		});

		test('should retain the most recent child tool after it completes', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const state = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool = {
				...createMockToolInvocation({
					toolCallId: 'child-tool',
					toolId: 'search',
					invocationMessage: 'Search the codebase',
				}),
				state,
			};

			part.trackToolState(childTool);
			const executing = getOpenChatContext(part);
			state.set(createState(IChatToolInvocation.StateKind.Completed), undefined);
			const completed = getOpenChatContext(part);

			assert.deepStrictEqual({
				executingToolCallId: executing?.activeToolCallId,
				executingToolLabel: executing?.activeToolLabel,
				completedToolCallId: completed?.activeToolCallId,
				completedToolLabel: completed?.activeToolLabel,
			}, {
				executingToolCallId: 'child-tool',
				executingToolLabel: 'Search the codebase',
				completedToolCallId: 'child-tool',
				completedToolLabel: 'Search the codebase',
			});
		});

		test('should restore an older active tool when the newest tool completes first', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const firstState = observableValue('firstState', createState(IChatToolInvocation.StateKind.Executing));
			const secondState = observableValue('secondState', createState(IChatToolInvocation.StateKind.Executing));
			part.trackToolState({
				...createMockToolInvocation({
					toolCallId: 'first-tool',
					toolId: 'search',
					invocationMessage: 'Search the codebase',
				}),
				state: firstState,
			});
			part.trackToolState({
				...createMockToolInvocation({
					toolCallId: 'second-tool',
					toolId: 'read_file',
					invocationMessage: 'Read package.json',
				}),
				state: secondState,
			});

			secondState.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			assert.deepStrictEqual(getOpenChatContext(part) && {
				activeToolCallId: getOpenChatContext(part)?.activeToolCallId,
				activeToolLabel: getOpenChatContext(part)?.activeToolLabel,
			}, {
				activeToolCallId: 'first-tool',
				activeToolLabel: 'Search the codebase',
			});
		});

		test('should show working for markdown and preserve the most recent tool for reasoning', () => {
			const parentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				chatResource: 'ahp-chat://subagent/test/tool-call',
				isActive: true,
			};
			const parentState = observableValue('parentState', createState(IChatToolInvocation.StateKind.Executing));
			const parentTool = {
				...createMockToolInvocation({ toolSpecificData: parentData }),
				state: parentState,
			};
			const part = createPart(parentTool, createMockRenderContext(false));
			const childState = observableValue('childState', createState(IChatToolInvocation.StateKind.Executing));
			part.trackToolState({
				...createMockToolInvocation({
					toolCallId: 'child-tool',
					toolId: 'search',
					invocationMessage: 'Search the codebase',
				}),
				state: childState,
			});
			childState.set(createState(IChatToolInvocation.StateKind.Completed), undefined);
			const afterTool = getOpenChatContext(part);

			parentData.activity = 'reasoning';
			parentState.set({ ...parentState.get() }, undefined);
			const duringReasoning = getOpenChatContext(part);
			parentData.activity = 'markdown';
			parentState.set({ ...parentState.get() }, undefined);
			const duringMarkdown = getOpenChatContext(part);

			assert.deepStrictEqual({
				afterTool: afterTool?.activeToolLabel,
				duringReasoning: duringReasoning?.activeToolLabel,
				duringMarkdown: duringMarkdown?.activeToolLabel,
			}, {
				afterTool: 'Search the codebase',
				duringReasoning: 'Search the codebase',
				duringMarkdown: undefined,
			});
		});

		test('should prefer terminal intention over the raw command invocation message', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));

			const terminalTool = createMockToolInvocation({
				toolCallId: 'terminal-tool',
				invocationMessage: 'Running `grep -rn activeToolLabel src/vs/sessions`',
				stateType: IChatToolInvocation.StateKind.Executing,
			});
			(terminalTool as { toolSpecificData: IChatToolInvocation['toolSpecificData'] }).toolSpecificData = {
				kind: 'terminal',
				commandLine: {
					original: 'grep -rn activeToolLabel src/vs/sessions',
					toolEdited: undefined,
					userEdited: undefined,
				},
				intention: 'Find active tool rendering',
				language: 'bash',
			};
			part.trackToolState(terminalTool);

			assert.strictEqual(getOpenChatContext(part)?.activeToolLabel, 'Find active tool rendering');
		});

		test('should wait for a provisional tool label to gain invocation detail', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const state = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool = {
				...createMockToolInvocation({
					toolCallId: 'read-tool',
					toolId: 'read_file',
					invocationMessage: 'Read',
				}),
				state,
			};

			part.trackToolState(childTool);
			const provisional = getOpenChatContext(part)?.activeToolLabel;
			childTool.invocationMessage = 'Reading package.json';
			state.set({ ...state.get() }, undefined);

			assert.deepStrictEqual({
				provisional,
				formed: getOpenChatContext(part)?.activeToolLabel,
			}, {
				provisional: undefined,
				formed: 'Reading package.json',
			});
		});

		test('should keep the previous tool visible until the streaming tool is formed', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			part.trackToolState(createMockToolInvocation({
				toolCallId: 'previous-tool',
				toolId: 'search',
				invocationMessage: 'Searching the workspace',
				stateType: IChatToolInvocation.StateKind.Executing,
			}));
			const state = observableValue('state', createState(IChatToolInvocation.StateKind.Streaming));
			const childTool = {
				...createMockToolInvocation({
					toolCallId: 'streaming-tool',
					toolId: 'read_file',
					invocationMessage: 'Reading package.json',
				}),
				state,
			};

			part.trackToolState(childTool);
			const streaming = getOpenChatContext(part);
			state.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.deepStrictEqual({
				streamingToolCallId: streaming?.activeToolCallId,
				streamingLabel: streaming?.activeToolLabel,
				formedToolCallId: getOpenChatContext(part)?.activeToolCallId,
				formedLabel: getOpenChatContext(part)?.activeToolLabel,
			}, {
				streamingToolCallId: 'previous-tool',
				streamingLabel: 'Searching the workspace',
				formedToolCallId: 'streaming-tool',
				formedLabel: 'Reading package.json',
			});
		});

		test('should keep collapsed animated content out of keyboard navigation', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			const animationContent = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation-inner');
			const chevron = part.domNode.querySelector('.chat-collapsible-hover-chevron');
			const button = getCollapseButton(part);
			assert.ok(animationContainer);
			assert.ok(animationContent);
			assert.ok(chevron);
			assert.ok(button);

			const collapsedInert = animationContent.inert;
			const collapsedChevronExpanded = chevron.classList.contains('expanded');
			button.click();
			const animationEnabledDuringToggle = part.domNode.classList.contains('chat-collapsible-content-animated');
			const transitionEnd = new mainWindow.Event('transitionend');
			Object.defineProperty(transitionEnd, 'propertyName', { value: 'grid-template-rows' });
			animationContainer.dispatchEvent(transitionEnd);
			const animationEnabledAfterToggle = part.domNode.classList.contains('chat-collapsible-content-animated');
			animationContent.dispatchEvent(new mainWindow.CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));

			assert.deepStrictEqual({
				collapsedInert,
				collapsedChevronExpanded,
				animationEnabledDuringToggle,
				animationEnabledAfterToggle,
				nestedToggleIgnored: !part.domNode.classList.contains('chat-collapsible-content-animated'),
				expandedInert: animationContent.inert,
				expandedChevronExpanded: chevron.classList.contains('expanded'),
			}, {
				collapsedInert: true,
				collapsedChevronExpanded: false,
				animationEnabledDuringToggle: true,
				animationEnabledAfterToggle: false,
				nestedToggleIgnored: true,
				expandedInert: false,
				expandedChevronExpanded: true,
			});
		});

		test('should restore the streaming preview when an animation is canceled', async () => {
			const part = createPart(createMockToolInvocation(), createMockRenderContext(false));
			const animationContainer = part.domNode.querySelector<HTMLElement>('.chat-collapsible-content-animation');
			const button = getCollapseButton(part);
			assert.ok(animationContainer);
			assert.ok(button);

			button.click();
			animationContainer.getAnimations = () => [];
			const transitionCancel = new mainWindow.Event('transitioncancel');
			Object.defineProperty(transitionCancel, 'propertyName', { value: 'grid-template-rows' });
			animationContainer.dispatchEvent(transitionCancel);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.strictEqual(part.domNode.classList.contains('chat-collapsible-content-animated'), false);
		});

		test('should shimmer for an in-progress subagent even when the response is complete', () => {
			const toolInvocation = createMockToolInvocation({ stateType: IChatToolInvocation.StateKind.Executing });
			const context = createMockRenderContext(true);

			const part = createPart(toolInvocation, context);

			assert.ok(part.domNode.querySelector('.chat-thinking-title-shimmer'));
		});

		test('should not shimmer for a completed subagent while the response is in progress', () => {
			const toolInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.deepStrictEqual({
				isActive: part.getIsActive(),
				hasShimmer: !!part.domNode.querySelector('.chat-thinking-title-shimmer'),
			}, {
				isActive: false,
				hasShimmer: false,
			});
		});

		test('should shimmer while Agent Host reports an active child chat after tool completion', () => {
			const toolInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					isActive: true,
					description: 'Running child chat',
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.deepStrictEqual({
				isActive: part.getIsActive(),
				hasShimmer: !!part.domNode.querySelector('.chat-thinking-title-shimmer'),
			}, {
				isActive: true,
				hasShimmer: true,
			});
		});

		test('should start collapsed', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed by default');
		});
	});

	suite('Title extraction', () => {
		test('should extract title with agent name from toolSpecificData', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Searching the codebase',
					agentName: 'CodeSearchAgent',
					prompt: 'Search for authentication'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			assert.ok(buttonText.includes('CodeSearchAgent'), 'Title should include agent name');
			assert.ok(buttonText.includes('Searching the codebase'), 'Title should include description');
		});

		test('should use default prefix when no agent name is provided', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task'
					// no agentName
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			assert.ok(buttonText.includes('Subagent:'), 'Title should use default Subagent prefix');
		});
	});

	suite('Late metadata updates', () => {
		// The parent subagent tool is often constructed before
		// `subagent_started` (which carries the real agentName) arrives.
		// The autorun in `watchToolCompletion` re-reads metadata when state
		// changes and updates the title if the description transitioned from
		// the default placeholder to a real value, or if the agentName
		// changed to a real value. These tests cover that branch directly.

		function getTitleText(part: ChatSubagentContentPart): string {
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			return labelElement?.textContent ?? button.textContent ?? '';
		}

		function getSettableState(toolInvocation: IChatToolInvocation): ReturnType<typeof observableValue<IChatToolInvocation.State>> {
			return toolInvocation.state as ReturnType<typeof observableValue<IChatToolInvocation.State>>;
		}

		function setToolSpecificData(toolInvocation: IChatToolInvocation, data: IChatSubagentToolInvocationData): void {
			(toolInvocation as { toolSpecificData: IChatSubagentToolInvocationData }).toolSpecificData = data;
		}

		test('should publish a provider display name that arrives after initial rendering', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
				toolSpecificData: {
					kind: 'subagent',
					description: 'Review current branch',
					agentName: 'code-reviewer',
					chatResource: 'ahp-chat://subagent/test/code-reviewer',
				}
			});
			const part = createPart(toolInvocation, createMockRenderContext(false));
			const before = getOpenChatContext(part)?.agentType;

			setToolSpecificData(toolInvocation, {
				kind: 'subagent',
				description: 'Review current branch',
				agentDisplayName: 'Code Reviewer',
				agentName: 'code-reviewer',
				chatResource: 'ahp-chat://subagent/test/code-reviewer',
			});
			getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.deepStrictEqual({
				before,
				after: getOpenChatContext(part)?.agentType,
			}, {
				before: undefined,
				after: 'Code Reviewer',
			});
		});

		test('updateTitle clears previous title file widget disposables', () => {
			const toolInvocation = createMockToolInvocation({ invocationMessage: 'first' });
			const context = createMockRenderContext(false);
			const part = createPart(toolInvocation, context);

			let disposed = false;
			(part as unknown as { _titleFileWidgetStore: DisposableStore })._titleFileWidgetStore.add({ dispose: () => { disposed = true; } });

			// Trigger a title re-render
			part.trackToolState(createMockToolInvocation({ invocationMessage: 'second', stateType: IChatToolInvocation.StateKind.Executing }));

			assert.strictEqual(disposed, true, 'Previous title file widget disposable should be cleared');
		});

		test('default description with no agentName → real description arrives later → title updates', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
				toolSpecificData: { kind: 'subagent' /* no description, no agentName */ }
			});
			const context = createMockRenderContext(false);
			const part = createPart(toolInvocation, context);

			assert.ok(getTitleText(part).includes('Subagent:'), 'Title should start with default prefix');

			// Late metadata: real description arrives via ChatToolCallContentChanged
			setToolSpecificData(toolInvocation, { kind: 'subagent', description: 'Searching the codebase' });
			getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.ok(getTitleText(part).includes('Searching the codebase'), 'Title should reflect the new description');
		});

		test('real description already set → agentName arrives later → title updates (regression)', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
				toolSpecificData: { kind: 'subagent', description: 'Searching the codebase' /* no agentName */ }
			});
			const context = createMockRenderContext(false);
			const part = createPart(toolInvocation, context);

			assert.ok(getTitleText(part).includes('Searching the codebase'), 'Title should start with the real description');
			assert.ok(!getTitleText(part).includes('CodeSearchAgent'), 'Title should not yet have agent name');

			// Late metadata: agentName arrives via subagent_started after the
			// description has already been set (the bug we fixed).
			setToolSpecificData(toolInvocation, { kind: 'subagent', description: 'Searching the codebase', agentName: 'CodeSearchAgent' });
			getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.ok(getTitleText(part).includes('CodeSearchAgent'), 'Title should reflect the new agent name');
		});

		test('agentName already set → empty agentName arrives → title NOT cleared', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
				toolSpecificData: { kind: 'subagent', description: 'Searching the codebase', agentName: 'CodeSearchAgent' }
			});
			const context = createMockRenderContext(false);
			const part = createPart(toolInvocation, context);

			assert.ok(getTitleText(part).includes('CodeSearchAgent'), 'Title should start with the agent name');

			// A subsequent update arrives with no agentName field — the part
			// must NOT clear the previously-set name.
			setToolSpecificData(toolInvocation, { kind: 'subagent', description: 'Searching the codebase' });
			getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.ok(getTitleText(part).includes('CodeSearchAgent'), 'Title should still have the agent name');
		});

		test('real description already set → no further changes → title preserved', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
				toolSpecificData: { kind: 'subagent', description: 'Searching the codebase', agentName: 'CodeSearchAgent' }
			});
			const context = createMockRenderContext(false);
			const part = createPart(toolInvocation, context);

			const before = getTitleText(part);

			// Trigger the autorun without changing toolSpecificData.
			getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.strictEqual(getTitleText(part), before, 'Title should be unchanged when no metadata changed');
		});
	});

	suite('State management', () => {
		test('should start as active', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			assert.strictEqual(part.getIsActive(), true, 'Should start as active');
		});

		test('markAsInactive should update isActive state', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			part.markAsInactive();

			assert.deepStrictEqual({
				isActive: part.getIsActive(),
				animationEnabled: part.domNode.classList.contains('chat-collapsible-content-animated'),
			}, {
				isActive: false,
				animationEnabled: true,
			});
		});

		test('forced inactive state freezes timing for a terminal parent response', () => {
			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				isActive: true,
				description: 'Working on task',
				chatResource: 'ahp-chat://subagent/test/tool-call',
				startedAt: Date.now() - 5000,
			};
			const part = createPart(createMockToolInvocation({ toolSpecificData }), createMockRenderContext(false));

			part.markAsInactive(true);

			assert.deepStrictEqual({
				isActive: toolSpecificData.isActive,
				hasDuration: typeof toolSpecificData.duration === 'number' && toolSpecificData.duration >= 5000,
				contextDuration: getOpenChatContext(part)?.duration,
			}, {
				isActive: false,
				hasDuration: true,
				contextDuration: toolSpecificData.duration,
			});
		});

		test('forced inactive state freezes serialized subagent timing', () => {
			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				isActive: true,
				description: 'Restored task',
				chatResource: 'ahp-chat://subagent/test/restored',
				startedAt: Date.now() - 5000,
			};
			const part = createPart(createMockSerializedToolInvocation({
				toolSpecificData,
				isComplete: true,
			}), createMockRenderContext(true));

			part.markAsInactive(true);

			assert.deepStrictEqual({
				isActive: toolSpecificData.isActive,
				hasDuration: typeof toolSpecificData.duration === 'number' && toolSpecificData.duration >= 5000,
				contextDuration: getOpenChatContext(part)?.duration,
			}, {
				isActive: false,
				hasDuration: true,
				contextDuration: toolSpecificData.duration,
			});
		});

		test('stops immediately when the parent response becomes terminal', () => {
			const onDidChange = disposables.add(new Emitter<ChatResponseModelChangeReason>());
			let isComplete = false;
			const baseContext = createMockRenderContext(false);
			const baseElement = baseContext.element as IChatResponseViewModel;
			const context: IChatContentPartRenderContext = {
				...baseContext,
				element: {
					...baseElement,
					model: {
						...baseElement.model,
						onDidChange: onDidChange.event,
					} as IChatResponseViewModel['model'],
					get isComplete() { return isComplete; },
					get isCanceled() { return false; },
					setVote: () => { },
				},
			};
			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				isActive: true,
				description: 'Working on task',
				chatResource: 'ahp-chat://subagent/test/tool-call',
				startedAt: Date.now() - 5000,
			};
			const part = createPart(createMockToolInvocation({ toolSpecificData }), context);

			isComplete = true;
			onDidChange.fire({ reason: 'completedRequest' });

			assert.deepStrictEqual({
				isActive: part.getIsActive(),
				toolIsActive: toolSpecificData.isActive,
				hasDuration: typeof toolSpecificData.duration === 'number' && toolSpecificData.duration >= 5000,
			}, {
				isActive: false,
				toolIsActive: false,
				hasDuration: true,
			});
		});

		test('markAsInactive should remove streaming class', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand to trigger wrapper creation
			const button = getCollapseButton(part);
			button?.click();

			part.markAsInactive();

			const wrapper = getWrapperElement(part);
			if (wrapper) {
				assert.strictEqual(wrapper.classList.contains('chat-thinking-streaming'), false,
					'Streaming class should be removed after markAsInactive');
			}
		});

		test('markAsInactive should collapse the part', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// First expand
			const button = getCollapseButton(part);
			button?.click();

			// Verify expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false);

			part.markAsInactive();

			// Should collapse when inactive
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed after markAsInactive');
		});

		test('markAsInactive should change default description to past tense', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					// no description — should use the default "Running subagent"
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Before marking inactive, title should show "Running subagent"
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelBefore = getCollapseButtonLabel(button);
			const textBefore = labelBefore?.textContent ?? button.textContent ?? '';
			assert.ok(textBefore.includes('Running subagent'), 'Title should show "Running subagent" before completion');

			part.markAsInactive();

			// After marking inactive, title should show "Ran subagent"
			const labelAfter = getCollapseButtonLabel(button);
			const textAfter = labelAfter?.textContent ?? button.textContent ?? '';
			assert.ok(textAfter.includes('Ran subagent'), 'Title should show "Ran subagent" after completion');
			assert.ok(!textAfter.includes('Running subagent'), 'Title should no longer show "Running subagent"');
		});

		test('markAsInactive should keep custom description unchanged', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Searching the codebase',
					agentName: 'Explorer',
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			part.markAsInactive();

			// After marking inactive, title should still show the custom description
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const label = getCollapseButtonLabel(button);
			const text = label?.textContent ?? button.textContent ?? '';
			assert.ok(text.includes('Searching the codebase'), 'Title should keep custom description after completion');
		});

		test('finalizeTitle should update button icon to check', () => {
			// Enable the showCheckmarks setting so the check icon is visible
			const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			configService.setUserConfiguration(AccessibilityWorkbenchSettingId.ShowChatCheckmarks, true);

			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			part.finalizeTitle();

			// The button should now show a check icon
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const iconElement = getCollapseButtonIcon(button);
			assert.ok(iconElement?.classList.contains('codicon-check-compact'), 'Should have check icon after finalization');
		});
	});

	suite('Serialized invocation', () => {
		test('should handle serialized tool invocation', () => {
			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'FinishedAgent',
					prompt: 'Original prompt',
					result: 'Task completed successfully'
				}
			});
			const context = createMockRenderContext(true); // isComplete = true

			const part = createPart(serializedInvocation, context);

			// Should already be inactive since it's serialized
			assert.strictEqual(part.getIsActive(), false, 'Serialized invocation should be inactive');
		});
	});

	suite('hasSameContent', () => {
		test('should not reuse the visual part for a child tool invocation', () => {
			const toolInvocation = createMockToolInvocation({ subAgentInvocationId: 'subagent-123' });
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const otherInvocation = createMockToolInvocation({
				toolId: 'some-tool',
				subAgentInvocationId: 'subagent-123'
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, false);
		});

		test('should return false for tool invocation with different subAgentInvocationId', () => {
			const toolInvocation = createMockToolInvocation({ subAgentInvocationId: 'subagent-123' });
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const otherInvocation = createMockToolInvocation({
				toolId: 'some-tool',
				subAgentInvocationId: 'subagent-456'
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, false, 'Should not match tool invocation with different subAgentInvocationId');
		});

		test('should return true for runSubagent tool using toolCallId as effective ID', () => {
			const sharedToolCallId = 'shared-tool-call-id';
			const toolInvocation = createMockToolInvocation({
				toolId: RunSubagentTool.Id,
				toolCallId: sharedToolCallId,
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context, toolInvocation.toolCallId);

			const otherInvocation = createMockToolInvocation({
				toolId: RunSubagentTool.Id,
				toolCallId: sharedToolCallId,
			});

			const result = part.hasSameContent(otherInvocation, [], context.element);
			assert.strictEqual(result, true, 'Should match runSubagent tool using toolCallId as effective ID');
		});

		test('should not reuse the visual part for grouped markdown', () => {
			const toolInvocation = createMockToolInvocation({ toolCallId: 'subagent-123' });
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-123">file:///test.txt</vscode_codeblock_uri>' }
			};

			const result = part.hasSameContent(markdownContent, [], context.element);
			assert.strictEqual(result, false);
		});
	});

	suite('Streaming behavior', () => {
		test('should show loading spinner while streaming', () => {
			const toolInvocation = createMockToolInvocation({
				stateType: IChatToolInvocation.StateKind.Streaming
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Should have loading spinner icon while streaming
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const loadingIcon = getCollapseButtonIcon(button);
			assert.ok(loadingIcon?.classList.contains('codicon-circle-filled-compact'), 'Should have circle-filled icon while streaming');
		});
	});

	suite('Expand/collapse', () => {
		test('should toggle expansion when button is clicked', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Initially collapsed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'));

			// Click to expand
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have expand button');
			button.click();

			// Should be expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should be expanded after clicking button');

			// Click again to collapse
			button.click();

			// Should be collapsed again
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'),
				'Should be collapsed after clicking button again');
		});

		test('should have proper aria-expanded attribute', () => {
			const toolInvocation = createMockToolInvocation();
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			assert.strictEqual(button.getAttribute('aria-expanded'), 'false', 'Should have aria-expanded="false" when collapsed');

			// Expand
			button.click();

			assert.strictEqual(button.getAttribute('aria-expanded'), 'true', 'Should have aria-expanded="true" when expanded');
		});
	});

	suite('Lazy rendering', () => {
		test('should defer prompt/result rendering until expanded when initially complete', () => {
			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'FinishedAgent',
					prompt: 'Original prompt for the task',
					result: 'Task completed successfully'
				}
			});
			const context = createMockRenderContext(true); // isComplete = true

			const part = createPart(serializedInvocation, context);

			// Content should be collapsed - no wrapper content initially visible
			// Just verify that the domNode has the collapsed class
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed initially');

			// Expand to trigger lazy rendering
			const button = getCollapseButton(part);
			assert.ok(button, 'Expand button should exist');
			button.click();

			// After expanding, the content containers should be rendered
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded');

			// Verify prompt and result sections exist in the expanded content
			const wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapperContent, 'Wrapper content should exist after expand');

			// Check that sections were inserted
			const sections = wrapperContent.querySelectorAll('.chat-subagent-section');
			assert.ok(sections.length >= 2, 'Should have prompt and result sections after expand');
		});

		test('should not render wrapper content while subagent is running (truly collapsed)', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Running task',
					agentName: 'RunningAgent',
					prompt: 'Prompt text'
				},
				stateType: IChatToolInvocation.StateKind.Streaming
			});
			const context = createMockRenderContext(false); // Not complete

			const part = createPart(toolInvocation, context);

			// Should be collapsed with just the title visible
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed while running');

			// Wrapper content should not be initialized yet (lazy)
			const wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.strictEqual(wrapperContent, null, 'Wrapper content should not be rendered while running and collapsed');
		});

		test('should show prompt on expand when no tool items yet', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Starting task',
					agentName: 'RunningAgent',
					prompt: 'This is the prompt to execute'
				},
				stateType: IChatToolInvocation.StateKind.Streaming
			});
			const context = createMockRenderContext(false); // Not complete

			const part = createPart(toolInvocation, context);

			// Initially collapsed with no content
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should be collapsed initially');
			let wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.strictEqual(wrapperContent, null, 'Wrapper should not exist initially');

			// Expand
			const button = getCollapseButton(part);
			assert.ok(button, 'Expand button should exist');
			button.click();

			// Wrapper should now exist and be visible
			wrapperContent = part.domNode.querySelector('.chat-used-context-list');
			assert.ok(wrapperContent, 'Wrapper should exist after expand');

			// Prompt section should be rendered
			const promptSection = wrapperContent.querySelector('.chat-subagent-section');
			assert.ok(promptSection, 'Prompt section should be visible after expand');
		});
	});

	suite('Current running tool in title', () => {
		test('batches presentation while reconstructing terminal tool history', () => {
			const parentTool = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const part = createPart(parentTool, createMockRenderContext(false));
			markdownRenderCount = 0;

			part.beginToolPresentationBatch();
			for (let index = 0; index < 128; index++) {
				const tool = createMockToolInvocation({
					toolId: 'readFile',
					toolCallId: `child-${index}`,
					subAgentInvocationId: parentTool.toolCallId,
					stateType: IChatToolInvocation.StateKind.Completed,
					invocationMessage: `Completed tool ${index}`
				});
				part.appendToolInvocation(tool, index);
			}

			const rendersDuringBatch = markdownRenderCount;
			part.endToolPresentationBatch();
			const rendersAfterBatch = markdownRenderCount;
			const button = getCollapseButton(part);
			assert.ok(button);
			const titleAfterBatch = getCollapseButtonLabel(button)?.textContent ?? button.textContent ?? '';
			const toolStateTracking = (part as unknown as { _toolStateTracking: { _toDispose: Set<object> } })._toolStateTracking;
			const trackedTerminalToolCount = toolStateTracking._toDispose.size;

			const liveTool = createMockToolInvocation({
				toolId: 'searchFiles',
				toolCallId: 'live-child',
				subAgentInvocationId: parentTool.toolCallId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Searching live files'
			});
			part.appendToolInvocation(liveTool, 128);
			const titleAfterLiveTool = getCollapseButtonLabel(button)?.textContent ?? button.textContent ?? '';

			assert.deepStrictEqual({
				rendersDuringBatch,
				rendersAfterBatch,
				trackedTerminalToolCount,
				rendersAfterLiveTool: markdownRenderCount,
				titleAfterBatchIncludesLatestTool: titleAfterBatch.includes('Completed tool 127'),
				titleAfterLiveToolIncludesLatestTool: titleAfterLiveTool.includes('Searching live files'),
			}, {
				rendersDuringBatch: 0,
				rendersAfterBatch: 1,
				trackedTerminalToolCount: 0,
				rendersAfterLiveTool: 2,
				titleAfterBatchIncludesLatestTool: true,
				titleAfterLiveToolIncludesLatestTool: true,
			});
		});

		test('batches grouped hook presentation updates', () => {
			const parentTool = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const part = createPart(parentTool, createMockRenderContext(false));
			const hookPart: IChatHookPart = {
				kind: 'hook',
				hookType: 'PreToolUse',
				systemMessage: 'Warning',
				toolDisplayName: 'Search',
				subAgentInvocationId: parentTool.toolCallId,
			};
			markdownRenderCount = 0;

			part.beginToolPresentationBatch();
			for (let index = 0; index < 32; index++) {
				part.appendHookItem(() => ({ domNode: mainWindow.document.createElement('div') }), hookPart);
			}
			const rendersDuringBatch = markdownRenderCount;
			part.endToolPresentationBatch();

			assert.deepStrictEqual({
				rendersDuringBatch,
				rendersAfterBatch: markdownRenderCount,
			}, {
				rendersDuringBatch: 0,
				rendersAfterBatch: 1,
			});
		});

		test('should update title with current running tool invocation message', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add a child tool invocation
			const childTool = createMockToolInvocation({
				toolId: 'readFile',
				subAgentInvocationId: toolInvocation.subAgentInvocationId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Reading config.ts'
			});

			part.appendToolInvocation(childTool, 0);

			// The title should include the current running tool message
			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			assert.ok(buttonText.includes('Reading config.ts'), 'Title should include current running tool message');
		});

		test('should show latest tool when multiple tools are added', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add first tool
			const firstTool = createMockToolInvocation({
				toolId: 'readFile',
				subAgentInvocationId: toolInvocation.subAgentInvocationId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Reading file1.ts'
			});
			part.appendToolInvocation(firstTool, 0);

			// Add second tool
			const secondTool = createMockToolInvocation({
				toolId: 'searchFiles',
				subAgentInvocationId: toolInvocation.subAgentInvocationId,
				stateType: IChatToolInvocation.StateKind.Executing,
				invocationMessage: 'Searching for patterns'
			});
			part.appendToolInvocation(secondTool, 1);

			const button = getCollapseButton(part);
			assert.ok(button, 'Should have collapse button');
			const labelElement = getCollapseButtonLabel(button);
			const buttonText = labelElement?.textContent ?? button.textContent ?? '';
			// Should show the latest tool message
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should include latest tool message');
		});

		test('should keep showing running tool when another tool completes', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add first tool (will complete)
			const firstToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const firstTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: firstToolState,
				invocationMessage: 'Reading file1.ts'
			};
			part.trackToolState(firstTool);

			// Add second tool (will keep running)
			const secondToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const secondTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'searchFiles',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: secondToolState,
				invocationMessage: 'Searching for patterns'
			};
			part.trackToolState(secondTool);

			// Verify title shows second tool
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should show second tool');

			// Complete the first tool
			firstToolState.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Title should still show the second tool (which is still running and owns the title)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should still show second tool after first completes');
		});

		test('should keep title when tool is cancelled', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Add a tool that will be cancelled
			const toolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: toolState,
				invocationMessage: 'Reading file.ts'
			};
			part.trackToolState(childTool);

			// Verify title includes tool message
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading file.ts'), 'Title should include tool message while running');

			// Cancel the tool
			toolState.set(createState(IChatToolInvocation.StateKind.Cancelled), undefined);

			// Title should still include the tool message (persists like thinking part)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading file.ts'),
				'Title should still include tool message after cancellation');
		});

		test('should keep showing last tool message when that tool completes', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// First tool starts
			const firstToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const firstTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: firstToolState,
				invocationMessage: 'Reading file1.ts'
			};
			part.trackToolState(firstTool);

			// Verify title shows first tool
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading file1.ts'), 'Title should show first tool');

			// Second tool starts and becomes the current title
			const secondToolState = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const secondTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'searchFiles',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: secondToolState,
				invocationMessage: 'Searching for patterns'
			};
			part.trackToolState(secondTool);

			// Verify title shows second tool
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'), 'Title should show second tool');

			// Second tool completes
			secondToolState.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Title should still show second tool (persists like thinking part)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Searching for patterns'),
				'Title should still show last tool message after completion');
		});
	});

	suite('appendMarkdownItem', () => {
		test('should append markdown item to expanded subagent part', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-id',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand the part first
			const button = getCollapseButton(part);
			button?.click();
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded');

			// Create a mock markdown content with edit pill
			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'Edited file.ts' }
			};

			// Create a mock DOM node for the markdown
			const markdownDomNode = mainWindow.document.createElement('div');
			markdownDomNode.className = 'chat-codeblock-button';
			markdownDomNode.textContent = 'file.ts';

			let disposeCallCount = 0;
			const mockDisposable = { dispose: () => { disposeCallCount++; } };

			// Append markdown item
			part.appendMarkdownItem(
				() => ({ domNode: markdownDomNode, disposable: mockDisposable }),
				'codeblock-123',
				markdownContent,
				undefined
			);

			// Verify the markdown was appended
			const wrapper = getWrapperElement(part);
			assert.ok(wrapper, 'Wrapper should exist');
			const appendedElement = wrapper.querySelector('.chat-codeblock-button');
			assert.ok(appendedElement, 'Appended markdown element should exist in wrapper');
			assert.strictEqual(appendedElement.textContent, 'file.ts', 'Should have correct content');
		});

		test('should not render markdown item when part is collapsed', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-defer',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Part is collapsed by default
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should start collapsed');

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'Deferred edit' }
			};

			let factoryCalled = false;
			const markdownDomNode = mainWindow.document.createElement('div');
			markdownDomNode.className = 'deferred-edit';
			markdownDomNode.textContent = 'deferred.ts';

			const mockDisposable = { dispose: () => { } };

			// Append markdown item while collapsed - factory should not be called
			part.appendMarkdownItem(
				() => {
					factoryCalled = true;
					return { domNode: markdownDomNode, disposable: mockDisposable };
				},
				'codeblock-deferred',
				markdownContent,
				undefined
			);

			// Factory should not be called when collapsed
			assert.strictEqual(factoryCalled, false, 'Factory should not be called when collapsed');
		});

		test('should append multiple markdown items with same codeblock ID', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-dedup',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand the part
			const button = getCollapseButton(part);
			button?.click();

			const markdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: { value: 'Same codeblock' }
			};

			const sharedCodeblockId = 'codeblock-same-id';

			// Append first item
			const firstNode = mainWindow.document.createElement('div');
			firstNode.className = 'first-item';
			firstNode.textContent = 'first item content';
			part.appendMarkdownItem(
				() => ({ domNode: firstNode, disposable: { dispose: () => { } } }),
				sharedCodeblockId,
				markdownContent,
				undefined
			);

			// Append second item with same codeblock ID
			const secondNode = mainWindow.document.createElement('div');
			secondNode.className = 'second-item';
			secondNode.textContent = 'second item content';
			part.appendMarkdownItem(
				() => ({ domNode: secondNode, disposable: { dispose: () => { } } }),
				sharedCodeblockId,
				markdownContent,
				undefined
			);

			// Both items are added (no built-in deduplication by codeblock ID)
			const wrapper = getWrapperElement(part);
			assert.ok(wrapper, 'Wrapper should exist');
			const firstItems = wrapper.querySelectorAll('.first-item');
			const secondItems = wrapper.querySelectorAll('.second-item');
			// Implementation does not deduplicate - both items exist
			assert.strictEqual(firstItems.length, 1, 'First item should exist');
			assert.strictEqual(secondItems.length, 1, 'Second item should exist');
		});

		test('should handle multiple different codeblock IDs', () => {
			const toolInvocation = createMockToolInvocation({
				subAgentInvocationId: 'test-subagent-multi',
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Expand the part
			const button = getCollapseButton(part);
			button?.click();

			// Append first item
			const firstNode = mainWindow.document.createElement('div');
			firstNode.className = 'item-one';
			firstNode.textContent = 'first item content';
			part.appendMarkdownItem(
				() => ({ domNode: firstNode, disposable: { dispose: () => { } } }),
				'codeblock-1',
				{ kind: 'markdownContent', content: { value: 'First' } },
				undefined
			);

			// Append second item with different ID
			const secondNode = mainWindow.document.createElement('div');
			secondNode.className = 'item-two';
			secondNode.textContent = 'second item content';
			part.appendMarkdownItem(
				() => ({ domNode: secondNode, disposable: { dispose: () => { } } }),
				'codeblock-2',
				{ kind: 'markdownContent', content: { value: 'Second' } },
				undefined
			);

			// Both should exist
			const wrapper = getWrapperElement(part);
			assert.ok(wrapper, 'Wrapper should exist');
			assert.ok(wrapper.querySelector('.item-one'), 'First item should exist');
			assert.ok(wrapper.querySelector('.item-two'), 'Second item should exist');
		});
	});

	suite('Auto-expand on confirmation', () => {
		test('should auto-expand when tool state becomes WaitingForConfirmation', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});

			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Verify initially collapsed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should start collapsed');

			// Create a tool invocation that starts in executing state, then changes to WaitingForConfirmation
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Reading file'
			};

			// Track this tool's state (this registers observers)
			part.trackToolState(childTool);

			// Should still be collapsed since tool is executing, not waiting for confirmation
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should still be collapsed when tool is executing');

			// Now change state to WaitingForConfirmation
			stateObservable.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), undefined);

			// Should auto-expand when tool needs confirmation
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand when tool needs confirmation');
		});

		test('should publish the pending confirmation count to the open-chat pill', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const state = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool = { ...createMockToolInvocation({ toolId: 'first' }), state };
			part.enableCarouselMode(() => { }, () => { }, (_tool, currentState) => currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation);
			part.trackToolState(childTool);

			state.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), undefined);
			const pending = getOpenChatContext(part)?.confirmationCount;
			state.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			assert.deepStrictEqual({
				pending,
				afterConfirmation: getOpenChatContext(part)?.confirmationCount,
			}, {
				pending: 1,
				afterConfirmation: 0,
			});
		});

		test('should stay collapsed when the carousel owns a rich subagent confirmation', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Install npm dependencies',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));
			const state = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool = { ...createMockToolInvocation({ toolId: 'terminal' }), state };
			part.enableCarouselMode(() => { }, () => { }, (_tool, currentState) => currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation);
			part.trackToolState(childTool);

			state.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), undefined);

			assert.deepStrictEqual({
				collapsed: part.domNode.classList.contains('chat-used-context-collapsed'),
				confirmationCount: getOpenChatContext(part)?.confirmationCount,
			}, {
				collapsed: true,
				confirmationCount: 1,
			});
		});

		test('should distinguish the active confirmation from pending confirmations', () => {
			const part = createPart(createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					chatResource: 'ahp-chat://subagent/test/tool-call',
				}
			}), createMockRenderContext(false));

			part.setConfirmationActive(true);
			const active = getOpenChatContext(part)?.confirmationActive;
			part.setConfirmationActive(false);

			assert.deepStrictEqual({
				active,
				inactive: getOpenChatContext(part)?.confirmationActive,
			}, {
				active: true,
				inactive: false,
			});
		});

		test('should refresh the open-chat timing when the subagent stops', () => {
			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				description: 'Working on task',
				chatResource: 'ahp-chat://subagent/test/tool-call',
				isActive: true,
				startedAt: 1000,
			};
			const toolInvocation = createMockToolInvocation({
				toolSpecificData,
				stateType: IChatToolInvocation.StateKind.Executing,
			});
			const state = observableValue('state', toolInvocation.state.get());
			(toolInvocation as unknown as { state: typeof state }).state = state;
			const part = createPart(toolInvocation, createMockRenderContext(false));

			toolSpecificData.isActive = false;
			toolSpecificData.duration = 5000;
			state.set({ ...state.get() }, undefined);

			assert.deepStrictEqual(getOpenChatContext(part), {
				chatResource: 'ahp-chat://subagent/test/tool-call',
				parentSessionResource: 'chat-session://test/session1',
				title: 'Working on task',
				confirmationCount: 0,
				confirmationActive: false,
				startedAt: 1000,
				duration: 5000,
				isActive: false,
			});
		});

		test('should stop tracking a tool invocation once it reaches a terminal state', async () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Reading file'
			};

			part.trackToolState(childTool);
			const observerCount = () => (stateObservable as unknown as BaseObservable<IChatToolInvocation.State>).debugGetObservers().size;
			assert.strictEqual(observerCount(), 1, 'Tracking autorun should observe the tool state');

			// Complete the tool; disposal of the tracking autorun is deferred via a microtask.
			stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), undefined);
			await Promise.resolve();

			assert.strictEqual(observerCount(), 0, 'Tracking autorun should be disposed once the tool reaches a terminal state');
		});

		test('should auto-collapse when confirmation is addressed', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Create a tool invocation that is waiting for confirmation
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Run npm install'
			};

			// Track this tool's state
			part.trackToolState(childTool);

			// Should be expanded now
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should be expanded when waiting for confirmation');

			// Now simulate confirmation being addressed (tool moves to executing)
			stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			// Should auto-collapse after confirmation is addressed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'),
				'Should auto-collapse after confirmation is addressed');
		});

		test('should not auto-collapse if user manually expanded', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// User manually expands
			const button = getCollapseButton(part);
			button?.click();

			// Should be expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false, 'Should be expanded after user click');

			// Create a tool that goes through confirmation cycle
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Run npm install'
			};

			// Track this tool's state
			part.trackToolState(childTool);

			// Confirm the tool (move to executing)
			stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			// Since user manually expanded, it should stay expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should stay expanded when user manually expanded');
		});

		test('should respect manual expansion after auto-expand', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Verify initially collapsed
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should start collapsed');

			// Create a tool that needs confirmation
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Run npm install'
			};

			part.trackToolState(childTool);

			// Should auto-expand
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand for confirmation');

			// User manually collapses
			const button = getCollapseButton(part);
			button?.click();
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user click');

			// User manually expands again
			button?.click();
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should expand after second user click');

			// Confirm the tool (move to executing)
			stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			// Since user manually re-expanded after auto-expand, should stay expanded
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should stay expanded when user manually re-expanded after auto-expand');
		});

		test('should resume auto-collapse after user manually expands then collapses', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// First confirmation cycle - user manually expands
			const stateObservable1 = observableValue('state1', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool1: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					toolCallId: 'tool1',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable1,
				invocationMessage: 'First tool'
			};

			part.trackToolState(childTool1);

			// Should auto-expand for first confirmation
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand for first confirmation');

			// User manually collapses
			const button = getCollapseButton(part);
			button?.click();
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user click');

			// User manually expands (this sets userManuallyExpanded = true)
			button?.click();
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should expand after user re-expands');

			// Complete first tool (should not auto-collapse since user manually expanded)
			stateObservable1.set(createState(IChatToolInvocation.StateKind.Completed), undefined);
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should stay expanded after first tool completes (user manually expanded)');

			// User manually collapses again (this resets userManuallyExpanded)
			button?.click();
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'), 'Should collapse after user manually collapses');

			// Second confirmation cycle - should auto-collapse now since userManuallyExpanded was reset
			const stateObservable2 = observableValue('state2', createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
			const childTool2: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'runInTerminal',
					toolCallId: 'tool2',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable2,
				invocationMessage: 'Second tool'
			};

			part.trackToolState(childTool2);

			// Should auto-expand for second confirmation
			assert.strictEqual(part.domNode.classList.contains('chat-used-context-collapsed'), false,
				'Should auto-expand for second confirmation');

			// Complete second tool - should auto-collapse since userManuallyExpanded was reset by the earlier collapse
			stateObservable2.set(createState(IChatToolInvocation.StateKind.Executing), undefined);
			assert.ok(part.domNode.classList.contains('chat-used-context-collapsed'),
				'Should auto-collapse after second confirmation is addressed (userManuallyExpanded was reset)');
		});

		test('should clear current running tool message when tool completes', () => {
			const toolInvocation = createMockToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Working on task',
					agentName: 'TestAgent'
				}
			});
			const context = createMockRenderContext(false);

			const part = createPart(toolInvocation, context);

			// Create a tool that will complete
			const stateObservable = observableValue('state', createState(IChatToolInvocation.StateKind.Executing));
			const childTool: IChatToolInvocation = {
				...createMockToolInvocation({
					toolId: 'readFile',
					subAgentInvocationId: toolInvocation.subAgentInvocationId
				}),
				state: stateObservable,
				invocationMessage: 'Reading config.ts'
			};

			part.trackToolState(childTool);

			// Verify title includes tool message
			const button = getCollapseButton(part);
			assert.ok(button, 'Button should exist');
			const labelElement = getCollapseButtonLabel(button);
			let buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading config.ts'), 'Title should include tool message while running');

			// Complete the tool
			stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Title should still include the tool message (persists like thinking part)
			buttonText = labelElement?.textContent ?? button?.textContent ?? '';
			assert.ok(buttonText.includes('Reading config.ts'),
				'Title should still include tool message after completion');
		});
	});

	suite('Model name tooltip', () => {
		// Hover content may be a plain string or an IMarkdownString; normalize to text for assertions.
		const hoverText = (content: unknown): string => {
			if (typeof content === 'string') {
				return content;
			}
			if (isMarkdownString(content)) {
				return content.value;
			}
			return '';
		};

		test('should set up hover with model name from serialized toolSpecificData', () => {
			const setupDelayedHoverCalls: { element: HTMLElement; content: string }[] = [];
			mockHoverService.setupDelayedHover = (element: HTMLElement, options: { content: string }) => {
				setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
				return { dispose: () => { } };
			};

			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'TestAgent',
					prompt: 'Do the thing',
					result: 'Done',
					modelName: 'GPT-4o'
				}
			});
			const context = createMockRenderContext(true);

			createPart(serializedInvocation, context);

			// Should have set up a hover with the model name
			const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('GPT-4o'));
			assert.ok(modelHover, 'Should set up hover with model name');
		});

		test('should not set up hover when no model name is available', () => {
			const setupDelayedHoverCalls: { element: HTMLElement; content: string }[] = [];
			mockHoverService.setupDelayedHover = (element: HTMLElement, options: { content: string }) => {
				setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
				return { dispose: () => { } };
			};

			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'TestAgent',
					prompt: 'Do the thing',
					result: 'Done',
					// no modelName
				}
			});
			const context = createMockRenderContext(true);

			createPart(serializedInvocation, context);

			// Should not have set up any hover with model info
			const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('Model:'));
			assert.strictEqual(modelHover, undefined, 'Should not set up model hover when no model name');
		});

		test('should set up hover when tool completes and toolSpecificData has modelName', () => {
			const setupDelayedHoverCalls: { element: HTMLElement; content: string }[] = [];
			mockHoverService.setupDelayedHover = (element: HTMLElement, options: { content: string }) => {
				setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
				return { dispose: () => { } };
			};

			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				description: 'Working on task',
				agentName: 'TestAgent',
				prompt: 'Do stuff',
			};

			const toolInvocation = createMockToolInvocation({
				toolSpecificData,
				stateType: IChatToolInvocation.StateKind.Executing,
			});
			const context = createMockRenderContext(false);

			createPart(toolInvocation, context);

			// No model hover initially (no modelName yet)
			const initialHover = setupDelayedHoverCalls.find(c => c.content.includes('Model:'));
			assert.strictEqual(initialHover, undefined, 'Should not have model hover initially');

			// Simulate invoke() setting modelName on toolSpecificData
			toolSpecificData.modelName = 'Claude Sonnet 4';

			// Simulate tool completion
			const state = toolInvocation.state as ReturnType<typeof observableValue<IChatToolInvocation.State>>;
			state.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			// Should now have a hover with the model name
			const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('Claude Sonnet 4'));
			assert.ok(modelHover, 'Should set up hover with model name after completion');
		});

		test('should set up hover with credits from serialized toolSpecificData', () => {
			const setupDelayedHoverCalls: { element: HTMLElement; content: string }[] = [];
			mockHoverService.setupDelayedHover = (element: HTMLElement, options: { content: string }) => {
				setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
				return { dispose: () => { } };
			};

			const serializedInvocation = createMockSerializedToolInvocation({
				toolSpecificData: {
					kind: 'subagent',
					description: 'Completed task',
					agentName: 'TestAgent',
					prompt: 'Do the thing',
					result: 'Done',
					modelName: 'GPT-4o',
					credits: 1.5,
				}
			});
			const context = createMockRenderContext(true);

			createPart(serializedInvocation, context);

			// Hover should mention both the model and the credit cost
			const hover = setupDelayedHoverCalls.find(c => c.content.includes('1.5') && c.content.includes('credits'));
			assert.ok(hover, 'Should set up hover with credits');
			assert.ok(hover!.content.includes('GPT-4o'), 'Hover should still include model name');
		});

		test('should update hover with credits when they arrive after completion', () => {
			const setupDelayedHoverCalls: { element: HTMLElement; content: string }[] = [];
			mockHoverService.setupDelayedHover = (element: HTMLElement, options: { content: string }) => {
				setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
				return { dispose: () => { } };
			};

			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				description: 'Working on task',
				agentName: 'TestAgent',
				prompt: 'Do stuff',
				modelName: 'GPT-4o',
			};

			const toolInvocation = createMockToolInvocation({
				toolSpecificData,
				stateType: IChatToolInvocation.StateKind.Executing,
			});
			const context = createMockRenderContext(false);

			createPart(toolInvocation, context);

			// No credits in the hover yet
			assert.strictEqual(setupDelayedHoverCalls.find(c => c.content.includes('credit')), undefined, 'Should not show credits before they are reported');

			// Credits accumulate and the subagent completes
			toolSpecificData.credits = 2;
			const state = toolInvocation.state as ReturnType<typeof observableValue<IChatToolInvocation.State>>;
			state.set(createState(IChatToolInvocation.StateKind.Completed), undefined);

			const creditHover = setupDelayedHoverCalls.find(c => c.content.includes('2') && c.content.includes('credits'));
			assert.ok(creditHover, 'Should set up hover with credits after completion');
		});

		test('should update hover with model name when it arrives after initial render', () => {
			const setupDelayedHoverCalls: { element: HTMLElement; content: string }[] = [];
			mockHoverService.setupDelayedHover = (element: HTMLElement, options: { content: string }) => {
				setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
				return { dispose: () => { } };
			};

			// Agent host subagents start without a model name; it is reported
			// later via the child turns' usage events.
			const toolSpecificData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				description: 'Working on task',
				agentName: 'TestAgent',
			};

			const toolInvocation = createMockToolInvocation({
				toolSpecificData,
				stateType: IChatToolInvocation.StateKind.Executing,
			});
			const context = createMockRenderContext(false);

			createPart(toolInvocation, context);

			// No model in the hover yet
			assert.strictEqual(setupDelayedHoverCalls.find(c => c.content.includes('Model')), undefined, 'Should not show a model before one is reported');

			// Model name arrives while the subagent is still running
			toolSpecificData.modelName = 'Claude Sonnet 4';
			const state = toolInvocation.state as ReturnType<typeof observableValue<IChatToolInvocation.State>>;
			state.set(createState(IChatToolInvocation.StateKind.Executing), undefined);

			const modelHover = setupDelayedHoverCalls.find(c => c.content.includes('Claude Sonnet 4'));
			assert.ok(modelHover, 'Should set up hover with model name after it arrives');
		});
	});
});
