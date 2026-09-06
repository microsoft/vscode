/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { Extensions as ThemeServiceExtensions, IThemingRegistry } from '../../../../../platform/theme/common/themeService.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { TAB_ACTIVE_BACKGROUND } from '../../../../../workbench/common/theme.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { generateColorThemeCSS } from '../../../../../workbench/services/themes/browser/colorThemeCss.js';
import { ColorThemeData } from '../../../../../workbench/services/themes/common/colorThemeData.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { TERMINAL_VIEW_ID } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { openNewSearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from '../../browser/addTabActions.js';
import { EmptyFileEditorInput, EmptyFileEditorSerializer } from '../../browser/emptyFileEditorInput.js';
import { EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../../workbench/common/contextkeys.js';
import { TestEnvironmentService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IsQuickChatSessionContext, SinglePaneChangesTabAvailableContext, SinglePaneChangesTabMissingContext, SinglePaneFilesTabAvailableContext, SinglePaneFilesTabMissingContext } from '../../../../common/contextkeys.js';

// Import editor contribution to trigger action registration.
import '../../browser/editor.contribution.js';
import '../../../../browser/media/workbench.css';
import '../../../../browser/parts/media/chatCompositeBar.css';
import '../../../../browser/parts/media/editorPart.css';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

suite('Sessions - Editor Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers legacy Modern UI tab color customizations', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#000000' });
		theme.setCustomColors({ [TAB_ACTIVE_BACKGROUND]: '#123456' });
		const themingRegistry = Registry.as<IThemingRegistry>(ThemeServiceExtensions.ThemingContribution);
		const css = generateColorThemeCSS(theme, '.sessions-tab-customization-theme', themingRegistry.getThemingParticipants(), TestEnvironmentService).code;

		assert.strictEqual(css.includes('--modern-ui-editor-tab-active-background: #123456;'), true);
	});

	test('matches the chat separator with and without the theme border class', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench modern-ui-tabs agent-sessions-workbench dock-detail-panel');
		workbench.style.setProperty('--vscode-activeSessionView-foreground', 'rgb(100, 100, 100)');
		workbench.style.setProperty('--vscode-agentsPanel-foreground', 'rgb(200, 0, 0)');
		workbench.style.setProperty('--vscode-contrastBorder', 'rgb(255, 255, 255)');
		workbench.style.setProperty('--vscode-spacing-size20', '2px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');

		const editorPart = appendElement(workbench, 'part editor');
		const editorContent = appendElement(editorPart, 'content');
		const editorGroupContainer = appendElement(editorContent, 'editor-group-container');
		const title = appendElement(editorGroupContainer, 'title tabs');
		const tabsAndActionsContainer = appendElement(title, 'tabs-and-actions-container');

		const modalEditorPart = appendElement(workbench, 'part editor modal-editor-part');
		const modalEditorContent = appendElement(modalEditorPart, 'content');
		const modalEditorGroupContainer = appendElement(modalEditorContent, 'editor-group-container');
		const modalTitle = appendElement(modalEditorGroupContainer, 'title tabs');
		const modalTabsAndActionsContainer = appendElement(modalTitle, 'tabs-and-actions-container');

		const sessionView = appendElement(workbench, 'session-view tabs-replace-header');
		sessionView.style.setProperty('--session-view-foreground', 'rgb(100, 100, 100)');
		const chatGroupsView = appendElement(sessionView, 'chat-groups-view single-group');
		const chatBar = appendElement(chatGroupsView, 'chat-composite-bar session-chat-tabs-bar');
		const chatTabsRow = appendElement(chatBar, 'chat-composite-bar-tabs-row');

		const expectedColorReference = appendElement(workbench, 'expected-color-reference');
		expectedColorReference.style.color = 'color-mix(in srgb, rgb(100, 100, 100) 12%, transparent)';

		try {
			const getSidePanelSeparatorStyles = () => {
				const style = mainWindow.getComputedStyle(tabsAndActionsContainer, '::after');
				return {
					color: style.backgroundColor,
					leftInset: style.left,
					rightInset: style.right,
					width: style.height,
				};
			};
			const chatBarStyle = mainWindow.getComputedStyle(chatBar);
			const chatTabsRowStyle = mainWindow.getComputedStyle(chatTabsRow);
			const chatSeparatorStyles = {
				color: chatTabsRowStyle.borderBottomColor,
				leftInset: chatBarStyle.paddingLeft,
				rightInset: chatBarStyle.paddingRight,
				width: chatTabsRowStyle.borderBottomWidth,
			};
			const expectedColor = mainWindow.getComputedStyle(expectedColorReference).color;
			const withoutThemeBorderClass = getSidePanelSeparatorStyles();

			tabsAndActionsContainer.classList.add('tabs-border-bottom');
			tabsAndActionsContainer.style.setProperty('--tabs-border-bottom-color', 'rgb(200, 0, 0)');
			const withThemeBorderClass = getSidePanelSeparatorStyles();

			workbench.classList.add('hc-black');
			const highContrast = getSidePanelSeparatorStyles();
			const highContrastChatColor = mainWindow.getComputedStyle(chatTabsRow).borderBottomColor;
			const modalTitleStyle = mainWindow.getComputedStyle(modalTitle);
			const modalSeparatorStyle = mainWindow.getComputedStyle(modalTabsAndActionsContainer, '::after');

			assert.deepStrictEqual({
				expectedColorIsTransparent: expectedColor === 'rgba(0, 0, 0, 0)',
				withoutThemeBorderClass,
				withThemeBorderClass,
				chatSeparatorStyles,
				highContrast,
				highContrastChatColor,
				hasDuplicateTitleSeparator: mainWindow.getComputedStyle(title, '::after').content !== 'none',
				modal: {
					borderColor: modalTitleStyle.getPropertyValue('--modern-ui-editor-tabs-border'),
					leftInset: modalSeparatorStyle.left,
					rightInset: modalSeparatorStyle.right,
				},
			}, {
				expectedColorIsTransparent: false,
				withoutThemeBorderClass: {
					color: expectedColor,
					leftInset: '2px',
					rightInset: '2px',
					width: '1px',
				},
				withThemeBorderClass: {
					color: expectedColor,
					leftInset: '2px',
					rightInset: '2px',
					width: '1px',
				},
				chatSeparatorStyles: {
					color: expectedColor,
					leftInset: '2px',
					rightInset: '2px',
					width: '1px',
				},
				highContrast: {
					color: 'rgb(255, 255, 255)',
					leftInset: '2px',
					rightInset: '2px',
					width: '1px',
				},
				highContrastChatColor: 'rgb(255, 255, 255)',
				hasDuplicateTitleSeparator: false,
				modal: {
					borderColor: 'transparent',
					leftInset: '0px',
					rightInset: '0px',
				},
			});
		} finally {
			workbench.remove();
		}
	});

	function stubEditorGroupCount(instantiationService: TestInstantiationService, count: number): void {
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get mainPart(): IEditorGroupsService['mainPart'] {
				return { activeGroup: { count } as IEditorGroup } as IEditorGroupsService['mainPart'];
			}
		});
	}

	function stubEditorVisibility(instantiationService: TestInstantiationService, visible: boolean): IWorkbenchLayoutService {
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && visible;
			}
		};
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		return layoutService;
	}

	function createWorkspace(...workingDirectories: URI[]): ISessionWorkspace {
		return {
			uri: URI.file('/repo/workspace.code-workspace'),
			label: 'workspace',
			icon: Codicon.rootFolder,
			folders: workingDirectories.map(workingDirectory => ({
				root: workingDirectory,
				workingDirectory,
				name: workingDirectory.path,
				description: undefined,
			})),
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
	}

	test('new file tab action opens pinned empty file editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const opened: { editor: EditorInput; options: IEditorOptions | undefined }[] = [];
		const workspaceFolder = URI.file('/repo/worktree');
		const workspace = createWorkspace(workspaceFolder);
		stubEditorGroupCount(instantiationService, 7);
		stubEditorVisibility(instantiationService, true);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable({
				workspace: constObservable(workspace)
			} as IActiveSession);
		});

		instantiationService.set(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (editor instanceof EditorInput) {
					opened.push({ editor: store.add(editor), options: args[1] as IEditorOptions | undefined });
				}
				return undefined;
			}
		});

		await new NewFileTabAction().run(instantiationService);

		assert.deepStrictEqual(opened.map(({ editor, options }) => ({
			isEmptyFileEditor: editor instanceof EmptyFileEditorInput,
			resource: editor.resource?.toString(),
			pinned: options?.pinned,
			index: options?.index
		})), [{ isEmptyFileEditor: true, resource: workspaceFolder.toString(), pinned: true, index: 7 }]);
	});

	test('new browser tab action opens a pinned browser editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const browserInput = new class extends mock<BrowserEditorInput>() { };
		const opened: { editor: unknown; options: IEditorOptions | undefined }[] = [];
		instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
			override getOrCreateLazy(): BrowserEditorInput {
				return browserInput;
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				opened.push({ editor: args[0], options: args[1] as IEditorOptions | undefined });
				return undefined;
			}
		});

		await new NewBrowserTabAction().run(instantiationService);

		assert.deepStrictEqual(opened.map(({ editor, options }) => ({
			isBrowserEditor: editor === browserInput,
			pinned: options?.pinned,
		})), [{ isBrowserEditor: true, pinned: true }]);
	});

	test('Add Tab menu stays available in dock-only mode', () => {
		const getWhen = (action: NewFileTabAction | NewChangesTabAction | NewSearchTabAction): ContextKeyExpression => {
			const menu = action.desc.menu;
			const item = Array.isArray(menu) ? menu[0] : menu;
			assert.ok(item?.when);
			return item.when;
		};
		const evaluate = (expression: ContextKeyExpression, values: Record<string, ContextKeyValue>): boolean => expression.evaluate({
			getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined
		} satisfies IContext);
		const baseContext: Record<string, ContextKeyValue> = {
			[IsSessionsWindowContext.key]: true,
			[IsAuxiliaryWindowContext.key]: false,
			[IsTopRightEditorGroupContext.key]: true,
		};
		const scenarios = (availableKey: string, missingKey: string) => {
			const when = availableKey === SinglePaneFilesTabAvailableContext.key
				? getWhen(new NewFileTabAction())
				: getWhen(new NewChangesTabAction());
			return {
				singleTabAlreadyOpen: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: false, [availableKey]: true, [missingKey]: false }),
				multipleTabsAlreadyOpen: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: true, [availableKey]: true, [missingKey]: false }),
				multipleTabsMissing: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: true, [availableKey]: true, [missingKey]: true }),
				dockOnlyMissing: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: true, [availableKey]: true, [missingKey]: true }),
				unsupported: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: false, [availableKey]: false, [missingKey]: true }),
			};
		};

		assert.deepStrictEqual({
			files: scenarios(SinglePaneFilesTabAvailableContext.key, SinglePaneFilesTabMissingContext.key),
			changes: scenarios(SinglePaneChangesTabAvailableContext.key, SinglePaneChangesTabMissingContext.key),
			searchInDockOnly: evaluate(getWhen(new NewSearchTabAction()), baseContext),
			searchInQuickChat: evaluate(getWhen(new NewSearchTabAction()), { ...baseContext, [IsQuickChatSessionContext.key]: true }),
		}, {
			files: { singleTabAlreadyOpen: true, multipleTabsAlreadyOpen: false, multipleTabsMissing: true, dockOnlyMissing: true, unsupported: false },
			changes: { singleTabAlreadyOpen: true, multipleTabsAlreadyOpen: false, multipleTabsMissing: true, dockOnlyMissing: true, unsupported: false },
			searchInDockOnly: true,
			searchInQuickChat: false,
		});
	});

	test('new changes tab action is enabled for an uncreated workspace session with Changes available', () => {
		const action = new NewChangesTabAction();
		const precondition = action.desc.precondition?.serialize() ?? '';
		const keybinding = Array.isArray(action.desc.keybinding) ? action.desc.keybinding[0] : action.desc.keybinding;
		const when = keybinding?.when?.serialize() ?? '';
		const values: Record<string, ContextKeyValue> = {
			[IsSessionsWindowContext.key]: true,
			[IsAuxiliaryWindowContext.key]: false,
			[SinglePaneChangesTabAvailableContext.key]: true,
		};
		const context: IContext = {
			getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined
		};

		assert.deepStrictEqual({
			preconditionHasAvailability: precondition.includes(SinglePaneChangesTabAvailableContext.key),
			keybindingHasAvailability: when.includes(SinglePaneChangesTabAvailableContext.key),
			preconditionEnabled: action.desc.precondition?.evaluate(context),
			keybindingEnabled: keybinding?.when?.evaluate(context),
		}, {
			preconditionHasAvailability: true,
			keybindingHasAvailability: true,
			preconditionEnabled: true,
			keybindingEnabled: true,
		});
	});

	test('new search tab action is unavailable for Quick Chats', () => {
		const action = new NewSearchTabAction();
		const keybinding = Array.isArray(action.desc.keybinding) ? action.desc.keybinding[0] : action.desc.keybinding;
		const evaluate = (expression: ContextKeyExpression | null | undefined, isQuickChat: boolean): boolean => {
			const values: Record<string, ContextKeyValue> = {
				[IsSessionsWindowContext.key]: true,
				[IsAuxiliaryWindowContext.key]: false,
				[IsQuickChatSessionContext.key]: isQuickChat,
			};
			return expression?.evaluate({
				getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined
			} satisfies IContext) ?? false;
		};

		assert.deepStrictEqual({
			preconditionInQuickChat: evaluate(action.desc.precondition, true),
			keybindingInQuickChat: evaluate(keybinding?.when, true),
			preconditionInWorkspaceSession: evaluate(action.desc.precondition, false),
			keybindingInWorkspaceSession: evaluate(keybinding?.when, false),
		}, {
			preconditionInQuickChat: false,
			keybindingInQuickChat: false,
			preconditionInWorkspaceSession: true,
			keybindingInWorkspaceSession: true,
		});
	});

	test('empty file editor updates its workspace', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = stubEditorVisibility(instantiationService, true);
		const input = store.add(new EmptyFileEditorInput(createWorkspace(URI.file('/repo/first')), layoutService));
		const other = store.add(new EmptyFileEditorInput(undefined, layoutService));
		input.setWorkspace(createWorkspace(URI.file('/repo/other')));

		assert.deepStrictEqual({
			resource: input.resource?.toString(),
			matchesAnotherEmptyInput: input.matches(other)
		}, {
			resource: URI.file('/repo/other').toString(),
			matchesAnotherEmptyInput: true
		});
	});

	test('empty file editor updates managed Files capabilities with editor area visibility', () => {
		let editorVisible = false;
		const onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && editorVisible;
			}
		};
		const input = store.add(new EmptyFileEditorInput(undefined, layoutService));
		let capabilitiesChanges = 0;
		store.add(input.onDidChangeCapabilities(() => capabilitiesChanges++));

		const hiddenCapabilities = input.capabilities;
		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		assert.deepStrictEqual({
			hiddenCapabilities,
			visibleCapabilities: input.capabilities,
			capabilitiesChanges
		}, {
			hiddenCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Readonly |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.ForceReveal |
				EditorInputCapabilities.CannotClose,
			visibleCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Readonly |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.ForceReveal,
			capabilitiesChanges: 1
		});
	});

	test('empty file editor exposes its breadcrumb resource only while the editor area is visible', () => {
		let editorVisible = false;
		const onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && editorVisible;
			}
		};
		const input = store.add(new EmptyFileEditorInput(createWorkspace(URI.file('/repo/worktree')), layoutService));
		let labelChanges = 0;
		store.add(input.onDidChangeLabel(() => labelChanges++));

		const hiddenResource = input.resource;
		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		assert.deepStrictEqual({
			hiddenResource,
			visibleResource: input.resource?.toString(),
			labelChanges
		}, {
			hiddenResource: undefined,
			visibleResource: URI.file('/repo/worktree').toString(),
			labelChanges: 1
		});
	});

	test('empty file editor serializer preserves the workspace folders', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = stubEditorVisibility(instantiationService, false);
		const serializer = new EmptyFileEditorSerializer();
		const input = store.add(new EmptyFileEditorInput(createWorkspace(URI.file('/repo/first'), URI.file('/repo/second')), layoutService));
		const restored = serializer.deserialize(instantiationService, serializer.serialize(input) ?? '');
		if (restored) {
			store.add(restored);
		}

		assert.deepStrictEqual(
			(restored as EmptyFileEditorInput | undefined)?.workspace?.folders.map(folder => folder.workingDirectory.toString()),
			input.workspace?.folders.map(folder => folder.workingDirectory.toString())
		);
	});

	test('new search tab action opens a new search editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const invoked: unknown[] = [];
		instantiationService.stub(IInstantiationService, new class extends mock<IInstantiationService>() {
			override invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ..._args: TS): R {
				invoked.push(fn);
				return undefined as R;
			}
		});

		await new NewSearchTabAction().run(instantiationService);

		assert.deepStrictEqual(invoked, [openNewSearchEditor]);
	});

	test('new changes tab action opens the changes editor for the active session', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const resource = URI.parse('session:1');
		stubEditorGroupCount(instantiationService, 5);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable({ resource, isCreated: constObservable(true) } as IActiveSession);
		});
		const opened: { resource: URI; index: number | undefined }[] = [];
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(sessionResource: URI, options?: IEditorOptions): Promise<undefined> {
				opened.push({ resource: sessionResource, index: options?.index });
				return undefined;
			}
		});

		await new NewChangesTabAction().run(instantiationService);

		assert.deepStrictEqual(opened, [{ resource, index: 5 }]);
	});

	test('new changes tab action opens the changes editor for an uncreated session', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const resource = URI.parse('session:new');
		stubEditorGroupCount(instantiationService, 2);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable({ resource, isCreated: constObservable(false) } as IActiveSession);
		});
		const opened: { resource: URI; index: number | undefined }[] = [];
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(sessionResource: URI, options?: IEditorOptions): Promise<undefined> {
				opened.push({ resource: sessionResource, index: options?.index });
				return undefined;
			}
		});

		await new NewChangesTabAction().run(instantiationService);

		assert.deepStrictEqual(opened, [{ resource, index: 2 }]);
	});

	test('new changes tab action is a no-op when there is no active session', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		stubEditorGroupCount(instantiationService, 0);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});
		let opened = false;
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override async openChangesEditor(): Promise<undefined> {
				opened = true;
				return undefined;
			}
		});

		await new NewChangesTabAction().run(instantiationService);

		assert.strictEqual(opened, false);
	});

	test('maximize editor hides the terminal panel before maximizing', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly calls: string[] = [];
			readonly hiddenParts: Parts[] = [];
			editorMaximized = false;
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
				}

				if (hidden && part === Parts.PANEL_PART) {
					this.calls.push('hidePanel');
					this.hiddenParts.push(part);
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.calls.push(maximized ? 'maximizeEditor' : 'restoreEditor');
				this.editorMaximized = maximized;
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(id: string): boolean {
				return id === TERMINAL_VIEW_ID;
			}
		});

		const handler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		assert.ok(handler, 'Command handler should be registered');

		await handler(instantiationService);

		assert.deepStrictEqual(layoutService.calls, ['hidePanel', 'maximizeEditor']);
		assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
		assert.strictEqual(layoutService.editorMaximized, true);
	});

	test('maximize editor keeps non-terminal panels visible', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly hiddenParts: Parts[] = [];
			editorMaximized = false;
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
				}

				if (hidden && part === Parts.PANEL_PART) {
					this.hiddenParts.push(part);
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.editorMaximized = maximized;
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(_id: string): boolean {
				return false;
			}
		});

		const handler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		assert.ok(handler, 'Command handler should be registered');

		await handler(instantiationService);

		assert.deepStrictEqual(layoutService.hiddenParts, []);
		assert.strictEqual(layoutService.editorMaximized, true);
	});

	test('restore editor reopens the terminal panel when maximize hid it', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly hiddenParts: Parts[] = [];
			readonly shownParts: Parts[] = [];
			readonly maximizedStates: boolean[] = [];
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
					if (hidden) {
						this.hiddenParts.push(part);
					} else {
						this.shownParts.push(part);
					}
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.maximizedStates.push(maximized);
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(id: string): boolean {
				return id === TERMINAL_VIEW_ID;
			}
		});

		const maximizeHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		const restoreHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.restoreMainEditorPart')?.handler;
		assert.ok(maximizeHandler, 'Maximize command handler should be registered');
		assert.ok(restoreHandler, 'Restore command handler should be registered');

		await maximizeHandler(instantiationService);
		await restoreHandler(instantiationService);

		assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
		assert.deepStrictEqual(layoutService.shownParts, [Parts.PANEL_PART]);
		assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
		assert.strictEqual(layoutService.panelVisible, true);
	});

	test('restore editor does not reopen the panel when maximize left it visible', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			readonly shownParts: Parts[] = [];
			readonly maximizedStates: boolean[] = [];
			panelVisible = true;

			override isVisible(part: Parts): boolean {
				return part === Parts.PANEL_PART ? this.panelVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.PANEL_PART) {
					this.panelVisible = !hidden;
					if (!hidden) {
						this.shownParts.push(part);
					}
				}
			}

			override setEditorMaximized(maximized: boolean): void {
				this.maximizedStates.push(maximized);
			}
		};
		instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.set(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(_id: string): boolean {
				return false;
			}
		});

		const maximizeHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.maximizeMainEditorPart')?.handler;
		const restoreHandler = CommandsRegistry.getCommand('workbench.action.agentSessions.restoreMainEditorPart')?.handler;
		assert.ok(maximizeHandler, 'Maximize command handler should be registered');
		assert.ok(restoreHandler, 'Restore command handler should be registered');

		await maximizeHandler(instantiationService);
		await restoreHandler(instantiationService);

		assert.deepStrictEqual(layoutService.shownParts, []);
		assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
		assert.strictEqual(layoutService.panelVisible, true);
	});
});
