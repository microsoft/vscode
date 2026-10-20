/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IMenuService, isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyExpression, ContextKeyValue, IContext, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import product from '../../../../../platform/product/common/product.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickInputType } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { Extensions as ThemeServiceExtensions, IThemingRegistry } from '../../../../../platform/theme/common/themeService.js';
import { EditorInputCapabilities, EditorsOrder, ITextDiffEditorPane } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { TAB_ACTIVE_BACKGROUND } from '../../../../../workbench/common/theme.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, LayoutSettings, ModernUIEditorTabStyle, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { generateColorThemeCSS } from '../../../../../workbench/services/themes/browser/colorThemeCss.js';
import { ColorThemeData } from '../../../../../workbench/services/themes/common/colorThemeData.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../../../../workbench/contrib/files/browser/fileConstants.js';
import { TERMINAL_VIEW_ID } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { openNewSearchEditor } from '../../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IFileQuery, ISearchComplete, ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { Menus } from '../../../../browser/menus.js';
import { SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { SessionChangesEditorInput } from '../../../changes/browser/sessionChangesEditorInput.js';
import { NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction, OpenBrowserAction } from '../../browser/addTabActions.js';
import { EmptyFileEditor } from '../../browser/emptyFileEditor.js';
import { emptyFileEditorConfiguration } from '../../browser/emptyFileEditor.contribution.js';
import { EmptyFileEditorSearch, EmptyFileEditorSearchPickerFocusedContext } from '../../browser/emptyFileEditorSearch.js';
import { EmptyFileEditorInput, EmptyFileEditorSerializer } from '../../browser/emptyFileEditorInput.js';
import { EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../../workbench/common/contextkeys.js';
import { TestEnvironmentService, TestLayoutService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { createFileStat } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IsQuickChatSessionContext, DesktopChangesTabAvailableContext, DesktopChangesTabMissingContext, DesktopFilesTabAvailableContext, DesktopFilesTabMissingContext } from '../../../../common/contextkeys.js';

// Import editor contribution to trigger action registration.
import { SessionsTabStyleContribution } from '../../browser/editor.contribution.js';
import '../../../../../workbench/contrib/search/browser/searchQuickAccess.contribution.js';
import '../../../../browser/media/workbench.css';
import '../../../../browser/parts/media/chatCompositeBar.css';
import '../../../../browser/parts/media/editorPart.css';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

function registerEmptyFileEditorActions() {
	if (MenuRegistry.getMenuItems(Menus.EmptyFileEditorActions).some(item => isIMenuItem(item) && item.command.id === NEW_UNTITLED_FILE_COMMAND_ID)) {
		return Disposable.None;
	}
	return MenuRegistry.appendMenuItem(Menus.EmptyFileEditorActions, {
		command: {
			id: NEW_UNTITLED_FILE_COMMAND_ID,
			title: 'New File',
			icon: Codicon.newFile,
		},
		group: 'navigation',
		order: 1,
	});
}

/**
 * Resolves once `condition` holds. The condition is checked right away and then
 * each time `event` fires, so a change that already happened is not missed.
 */
async function waitForCondition<T>(event: Event<T>, condition: () => boolean): Promise<void> {
	if (!condition()) {
		await Event.toPromise(Event.filter(event, () => condition()));
	}
}

/**
 * Returns the open quick pick. It shows new results by applying them, which
 * activates their first item and fires `onDidChangeActive`.
 */
function getQuickPick(instantiationService: TestInstantiationService): IQuickPick<IQuickPickItem, { useSeparators: true }> {
	const quickInput = instantiationService.get(IQuickInputService).currentQuickInput;
	assert.strictEqual(quickInput?.type, QuickInputType.QuickPick);
	return quickInput as IQuickPick<IQuickPickItem, { useSeparators: true }>;
}

class TestResourceEditorInput extends EditorInput {
	override readonly typeId = 'test.sessions.resourceEditor';
	constructor(private readonly _resource: URI) { super(); }
	override get resource(): URI { return this._resource; }
}

function hasResource(value: unknown): value is { resource: URI } {
	return typeof value === 'object' && value !== null && URI.isUri(Reflect.get(value, 'resource'));
}

suite('Sessions - Editor Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares the connected tab setting across Agents windows independently of Modern UI', async () => {
		const configurationService = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: false,
			[LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE]: ModernUIEditorTabStyle.Connected,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const onDidAddContainer = store.add(new Emitter<{ container: HTMLElement; disposables: DisposableStore }>());
		const layoutService = new class extends TestLayoutService {
			override mainContainer = mainWindow.document.createElement('div');
			override containers = [this.mainContainer];
			override onDidAddContainer = onDidAddContainer.event;
			layoutCount = 0;
			override layout(): void { this.layoutCount++; }
		}();
		let auxiliaryLayouts = 0;
		const auxiliaryWindowService = new class extends mock<IAuxiliaryWindowService>() {
			override getWindow(): IAuxiliaryWindow {
				return new class extends mock<IAuxiliaryWindow>() {
					override layout(): void { auxiliaryLayouts++; }
				}();
			}
		}();
		const contribution = store.add(new SessionsTabStyleContribution(configurationService, layoutService, auxiliaryWindowService));
		const state = () => ({
			connected: layoutService.containers.map(container => container.classList.contains('modern-ui-connected-editor-tabs')),
			modernUI: layoutService.containers.map(container => container.classList.contains('modern-ui')),
			layouts: [layoutService.layoutCount, auxiliaryLayouts],
		});
		const update = async (key: string, value: boolean | ModernUIEditorTabStyle) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: setting => setting === key,
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] },
			});
		};

		const startup = state();
		const auxiliaryContainer = mainWindow.document.createElement('div');
		layoutService.containers.push(auxiliaryContainer);
		onDidAddContainer.fire({ container: auxiliaryContainer, disposables: store.add(new DisposableStore()) });
		const auxiliaryStartup = state();
		await update(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE, ModernUIEditorTabStyle.Pill);
		const pill = state();
		await update(LayoutSettings.MODERN_UI, true);
		const unrelatedSetting = state();
		await update(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE, ModernUIEditorTabStyle.Connected);
		const connected = state();
		contribution.dispose();

		assert.deepStrictEqual({ startup, auxiliaryStartup, pill, unrelatedSetting, connected, disposed: state() }, {
			startup: { connected: [true], modernUI: [false], layouts: [0, 0] },
			auxiliaryStartup: { connected: [true, true], modernUI: [false, false], layouts: [0, 0] },
			pill: { connected: [false, false], modernUI: [false, false], layouts: [1, 1] },
			unrelatedSetting: { connected: [false, false], modernUI: [false, false], layouts: [1, 1] },
			connected: { connected: [true, true], modernUI: [false, false], layouts: [2, 2] },
			disposed: { connected: [false, false], modernUI: [false, false], layouts: [2, 2] },
		});
	});

	test('registers legacy Modern UI tab color customizations', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#000000' });
		theme.setCustomColors({ [TAB_ACTIVE_BACKGROUND]: '#123456' });
		const themingRegistry = Registry.as<IThemingRegistry>(ThemeServiceExtensions.ThemingContribution);
		const css = generateColorThemeCSS(theme, '.sessions-tab-customization-theme', themingRegistry.getThemingParticipants(), TestEnvironmentService).code;

		assert.strictEqual(css.includes('--modern-ui-editor-tab-active-background: #123456;'), true);
	});

	test('centers both side-panel action bars within the tab row at either height', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench modern-ui-tabs agent-sessions-workbench dock-detail-panel');
		store.add({ dispose: () => workbench.remove() });
		workbench.style.cssText = 'width: 600px; --vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-strokeThickness: 1px;';
		const editor = appendElement(workbench, 'part editor');
		const group = appendElement(appendElement(editor, 'content'), 'editor-group-container active');
		const title = appendElement(group, 'title tabs');
		const row = appendElement(title, 'tabs-and-actions-container');
		const tabs = appendElement(appendElement(row, 'monaco-scrollable-element'), 'tabs-container');
		appendElement(tabs, 'tab');
		const toolbars = appendElement(row, 'editor-toolbars');
		const buttons = ['editor-actions', 'editor-layout-actions'].map(className => {
			const container = appendElement(toolbars, className);
			container.style.display = 'block';
			const toolbar = appendElement(container, 'monaco-toolbar');
			const actions = appendElement(appendElement(toolbar, 'monaco-action-bar'), 'actions-container');
			return appendElement(appendElement(actions, 'action-item'), 'action-label codicon codicon-screen-full');
		});

		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			for (const connected of [true, false]) {
				workbench.classList.toggle('modern-ui-connected-editor-tabs', connected);
				const horizontalSpacing = () => [row, ...buttons.map(button => button.closest<HTMLElement>('.editor-actions, .editor-layout-actions')!)].map(element => {
					const style = mainWindow.getComputedStyle(element);
					return [style.paddingLeft, style.paddingRight];
				});
				const defaultHorizontalSpacing = horizontalSpacing();
				for (const compact of [true, false]) {
					title.classList.toggle('compact-height', compact);
					const rowBounds = row.getBoundingClientRect();
					const contentHeight = (compact ? 28 : 32) - (connected ? 1 : 0);
					const expectedCenter = rowBounds.top + contentHeight / 2;
					assert.deepStrictEqual({
						rowHeight: rowBounds.height,
						buttonOffsets: buttons.map(button => {
							const bounds = button.getBoundingClientRect();
							return bounds.top + bounds.height / 2 - expectedCenter;
						}),
					}, {
						rowHeight: contentHeight + (connected ? 1 : 0),
						buttonOffsets: [0, 0],
					}, `${theme}, connected: ${connected}, compact: ${compact}`);
					const densitySpacing = [false, true, false].map(compactLayout => {
						workbench.classList.toggle('modern-ui-compact', compactLayout);
						return horizontalSpacing();
					});
					assert.deepStrictEqual(densitySpacing, [defaultHorizontalSpacing, defaultHorizontalSpacing, defaultHorizontalSpacing]);
				}
			}
			workbench.classList.remove(theme);
		}
	});

	test('uses one connected group frame with or without docked details', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench modern-ui-tabs modern-ui-connected-editor-tabs agent-sessions-workbench dock-detail-panel');
		workbench.style.setProperty('--vscode-agentsPanel-border', '#888888');
		workbench.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#445566');
		workbench.style.setProperty('--vscode-cornerRadius-large', '8px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		workbench.style.setProperty('--vscode-focusBorder', '#00ff00');
		workbench.style.setProperty('--vscode-contrastBorder', '#888888');
		const editor = appendElement(appendElement(workbench, 'monaco-grid-view'), 'part editor editor-tabs-multiple');
		const group = appendElement(appendElement(editor, 'content'), 'editor-group-container active');
		try {
			const getBorders = () => {
				const frame = mainWindow.getComputedStyle(group, '::after');
				return {
					outerBorder: mainWindow.getComputedStyle(editor).borderColor,
					frameWidth: frame.borderWidth,
					frameColor: frame.borderColor,
					frameRadius: frame.borderRadius,
				};
			};
			const borders = [];
			const themes = ['vs-dark', 'vs', 'hc-black', 'hc-light'];
			for (const theme of themes) {
				workbench.classList.add(theme);
				workbench.classList.remove('noauxiliarybar');
				const docked = getBorders();
				workbench.classList.add('noauxiliarybar');
				borders.push({ theme, docked, editorOnly: getBorders() });
				workbench.classList.remove(theme);
			}
			assert.deepStrictEqual(borders, themes.map(theme => {
				const expected = {
					outerBorder: 'rgba(0, 0, 0, 0)',
					frameWidth: '1px',
					frameColor: theme.startsWith('hc-') ? 'rgb(136, 136, 136)' : 'rgb(68, 85, 102)',
					frameRadius: '7px',
				};
				return { theme, docked: expected, editorOnly: expected };
			}));
		} finally {
			workbench.remove();
		}
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

	for (const connected of [false, true]) {
		test(`preserves ${connected ? 'connected' : 'pill'} side-panel tab outlines without a duplicate docked-details divider`, () => {
			const workbench = appendElement(mainWindow.document.body, 'monaco-workbench modern-ui-tabs agent-sessions-workbench dock-detail-panel');
			workbench.classList.toggle('modern-ui-connected-editor-tabs', connected);
			workbench.style.setProperty('--vscode-strokeThickness', '1px');
			workbench.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#808080');
			workbench.style.setProperty('--vscode-contrastBorder', '#ffffff');
			workbench.style.setProperty('--vscode-focusBorder', '#00ff00');
			const editor = appendElement(workbench, 'part editor');
			const content = appendElement(editor, 'content');
			const group = appendElement(content, 'editor-group-container active');
			const title = appendElement(group, 'title tabs');
			const row = appendElement(title, 'tabs-and-actions-container tabs-border-bottom');
			const tabs = appendElement(row, 'tabs-container');
			const activeTab = appendElement(tabs, 'tab active');
			const fill = appendElement(activeTab, 'tab-fill');
			const pinnedTitle = appendElement(group, 'title tabs two-tab-bars');
			const pinnedRow = appendElement(pinnedTitle, 'tabs-and-actions-container tabs-border-bottom');
			const unpinnedRow = appendElement(pinnedTitle, 'tabs-and-actions-container tabs-border-bottom');
			const singleTitle = appendElement(group, 'title');
			const singleRow = appendElement(singleTitle, 'single-tab-and-actions-container');
			const details = appendElement(editor, 'part auxiliarybar docked-auxiliarybar');
			const modal = appendElement(workbench, 'part editor modal-editor-part');
			const modalContent = appendElement(modal, 'content');
			const modalGroup = appendElement(modalContent, 'editor-group-container');
			const modalTitle = appendElement(modalGroup, 'title tabs');
			const modalRow = appendElement(modalTitle, 'tabs-and-actions-container');
			const hasSeparator = (element: HTMLElement) => {
				const style = mainWindow.getComputedStyle(element, '::after');
				return style.content !== 'none' && style.display !== 'none';
			};

			try {
				for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
					workbench.classList.add(theme);
					const capBorder = mainWindow.getComputedStyle(fill).borderTop;
					const states = [false, true, false].map(compact => {
						workbench.classList.toggle('modern-ui-compact', compact);
						const detailsFrame = mainWindow.getComputedStyle(details, '::after');
						return {
							separator: hasSeparator(row),
							pinnedSeparator: hasSeparator(pinnedRow),
							unpinnedSeparator: hasSeparator(unpinnedRow),
							singleSeparator: hasSeparator(singleRow),
							modalSeparator: hasSeparator(modalRow),
							capBorder: mainWindow.getComputedStyle(fill).borderTop,
							detailsTopBorder: detailsFrame.borderTopWidth,
							detailsSideBorder: detailsFrame.borderLeftWidth,
						};
					});

					assert.deepStrictEqual(states, [false, true, false].map(compact => ({
						separator: true,
						pinnedSeparator: false,
						unpinnedSeparator: true,
						singleSeparator: true,
						modalSeparator: true,
						capBorder,
						detailsTopBorder: '0px',
						detailsSideBorder: compact ? '1px' : '0px',
					})), theme);
					workbench.classList.remove(theme);
				}
			} finally {
				workbench.remove();
			}
		});
	}

	function stubEditorGroupCount(instantiationService: TestInstantiationService, count: number, editors: readonly EditorInput[] = []): void {
		const activeGroup = {
			count,
			editors,
			findEditors: (resource: URI) => editors.filter(editor => isEqual(editor.resource, resource)),
		} as Partial<IEditorGroup> as IEditorGroup;
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get mainPart(): IEditorGroupsService['mainPart'] {
				return { activeGroup } as IEditorGroupsService['mainPart'];
			}
		});
	}

	const changesEditorResource = (sessionResource: URI) => sessionResource.with({ scheme: 'session-changes' });

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
		return createWorkspaceWithFolders(workingDirectories.map(workingDirectory => ({
			root: workingDirectory,
			workingDirectory,
			name: workingDirectory.path,
			description: undefined,
		})));
	}

	function createWorkspaceWithFolders(folders: ISessionWorkspace['folders']): ISessionWorkspace {
		return {
			uri: URI.file('/repo/workspace.code-workspace'),
			label: 'workspace',
			icon: Codicon.rootFolder,
			folders,
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
	}

	test('add tab actions use the icon of the tab they open', () => {
		const instantiationService = store.add(new TestInstantiationService());
		stubEditorVisibility(instantiationService, true);
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
		});
		const changesTab = store.add(instantiationService.createInstance(SessionChangesEditorInput, URI.parse('session-changes:/1')));
		const filesTab = store.add(instantiationService.createInstance(EmptyFileEditorInput, undefined));
		const iconId = (icon: unknown) => ThemeIcon.isThemeIcon(icon) ? icon.id : undefined;

		assert.deepStrictEqual({
			changes: iconId(new NewChangesTabAction().desc.icon),
			files: iconId(new NewFileTabAction().desc.icon),
		}, {
			changes: iconId(changesTab.getIcon()),
			files: iconId(filesTab.getIcon()),
		});
	});

	test('new file tab action opens pinned empty file editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const opened: { editor: EditorInput; options: IEditorOptions | undefined }[] = [];
		const sessionWorkspace = createWorkspace(URI.file('/repo/session'));
		const chatWorkspace = createWorkspace(URI.file('/repo/chat'));
		stubEditorGroupCount(instantiationService, 7);
		stubEditorVisibility(instantiationService, true);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable({
				workspace: constObservable(sessionWorkspace),
				activeChat: constObservable({
					workspace: constObservable(chatWorkspace),
				}),
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
			index: options?.index,
			workspaceFolders: editor instanceof EmptyFileEditorInput
				? editor.workspace?.folders.map(folder => folder.workingDirectory.toString())
				: undefined,
		})), [{
			isEmptyFileEditor: true,
			resource: undefined,
			pinned: true,
			index: 7,
			workspaceFolders: [URI.file('/repo/chat').toString()],
		}]);
	});

	test('registers empty file editor actions as an Insiders-default experiment-controlled setting', () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		if (!configurationRegistry.getConfigurationProperties()[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]) {
			configurationRegistry.registerConfiguration(emptyFileEditorConfiguration);
			store.add(toDisposable(() => configurationRegistry.deregisterConfigurations([emptyFileEditorConfiguration])));
		}
		const property = configurationRegistry.getConfigurationProperties()[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING];
		assert.deepStrictEqual({
			id: SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING,
			type: property.type,
			default: property.default,
			scope: property.scope,
			tags: property.tags,
			experiment: property.experiment,
		}, {
			id: 'sessions.experimental.emptyFileEditorActions',
			type: 'boolean',
			default: product.quality === 'insider',
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('empty file editor gates experimental actions and responds to setting changes', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		store.add(registerEmptyFileEditorActions());
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean {
				return true;
			}
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const configurationService = new TestConfigurationService({
			[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]: false,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		const telemetryService = new TestExperimentTriggerTelemetryService();
		instantiationService.stub(ITelemetryService, telemetryService);
		const editor = store.add(instantiationService.createInstance(EmptyFileEditor, new class extends mock<IEditorGroup>() {
			override windowId = mainWindow.vscodeWindowId;
		}()));
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-test');
		store.add({ dispose: () => container.remove() });

		editor.create(container);
		const disabledContent = Array.from(container.querySelector('.empty-file-editor-content')?.children ?? []).map(element => element.className);
		await configurationService.setUserConfiguration(SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: setting => setting === SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]),
			change: { keys: [SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING], overrides: [] },
		});

		assert.deepStrictEqual({
			disabledContent,
			enabledContent: Array.from(container.querySelector('.empty-file-editor-content')?.children ?? []).map(element => element.className),
			description: container.querySelector('.sessions-empty-state-description')?.textContent,
			triggers: telemetryService.triggers,
		}, {
			disabledContent: ['sessions-empty-state'],
			enabledContent: ['sessions-empty-state', 'empty-file-editor-search', 'empty-file-editor-actions'],
			description: 'Select a file from the Files view',
			triggers: [`config.${SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING}`],
		});
	});

	test('empty file editor opens an untitled file on double-click in empty space', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		store.add(registerEmptyFileEditorActions());
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const configurationService = new TestConfigurationService({
			[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]: false,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		const commands: string[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<T>(id: string): Promise<T | undefined> {
				commands.push(id);
				return Promise.resolve(undefined);
			}
		});
		const editor = store.add(instantiationService.createInstance(EmptyFileEditor, new class extends mock<IEditorGroup>() {
			override windowId = mainWindow.vscodeWindowId;
		}()));
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-test');
		store.add({ dispose: () => container.remove() });
		editor.create(container);
		const doubleClick = (selector: string) => {
			container.querySelector(selector)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			return commands.splice(0);
		};

		const disabled = doubleClick('.empty-file-editor');
		await configurationService.setUserConfiguration(SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: setting => setting === SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]),
			change: { keys: [SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING], overrides: [] },
		});

		assert.deepStrictEqual({
			disabled,
			emptySpace: doubleClick('.empty-file-editor'),
			emptyStateText: doubleClick('.sessions-empty-state-description'),
			searchInput: doubleClick('.empty-file-editor-search input'),
			actions: doubleClick('.empty-file-editor-actions'),
		}, {
			disabled: [],
			emptySpace: ['workbench.action.files.newUntitledFile'],
			emptyStateText: ['workbench.action.files.newUntitledFile'],
			searchInput: [],
			actions: [],
		});
	});

	test('empty file editor shows file search and new file action', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		store.add(registerEmptyFileEditorActions());
		instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(): boolean {
				return true;
			}
		});
		const configurationService = new TestConfigurationService({
			[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]: true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		const telemetryService = new TestExperimentTriggerTelemetryService();
		instantiationService.stub(ITelemetryService, telemetryService);
		const commands: { id: string; args: unknown[] }[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id, args });
				return Promise.resolve(undefined);
			}
		});
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const editor = store.add(instantiationService.createInstance(EmptyFileEditor, new class extends mock<IEditorGroup>() {
			override windowId = mainWindow.vscodeWindowId;
		}()));
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-test');
		store.add({ dispose: () => container.remove() });

		editor.create(container);
		const buttons = Array.from(container.querySelectorAll<HTMLAnchorElement>('.empty-file-editor-actions .monaco-button'));
		buttons.forEach(button => button.click());

		assert.deepStrictEqual({
			searchPlaceholder: container.querySelector<HTMLInputElement>('.empty-file-editor-search input')?.placeholder,
			content: Array.from(container.querySelector('.empty-file-editor-content')?.children ?? []).map(element => element.className),
			description: container.querySelector('.sessions-empty-state-description')?.textContent,
			buttons: buttons.map(button => ({
				text: button.textContent,
				ariaLabel: button.getAttribute('aria-label'),
				icon: button.querySelector('.new-session-button-icon.codicon-new-file')?.getAttribute('aria-hidden'),
			})),
			commands,
			triggers: telemetryService.triggers,
		}, {
			searchPlaceholder: 'Search files by name',
			content: ['sessions-empty-state', 'empty-file-editor-search', 'empty-file-editor-actions'],
			description: 'Select a file from the Files view',
			buttons: [
				{ text: 'New File', ariaLabel: 'New File', icon: 'true' },
			],
			commands: [
				{ id: 'workbench.action.files.newUntitledFile', args: [] },
			],
			triggers: [`config.${SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING}`],
		});
	});

	test('empty file editor focuses an empty search input, otherwise its container', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		store.add(registerEmptyFileEditorActions());
		const configurationService = new TestConfigurationService({
			[SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING]: true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const editor = store.add(instantiationService.createInstance(EmptyFileEditor, new class extends mock<IEditorGroup>() {
			override windowId = mainWindow.vscodeWindowId;
		}()));
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-focus-test');
		// Focusing scrolls the document to the element; restore it so later tests measure unscrolled bounds.
		store.add({ dispose: () => mainWindow.scrollTo(0, 0) });
		store.add({ dispose: () => container.remove() });

		editor.create(container);
		const input = container.querySelector<HTMLInputElement>('.empty-file-editor-search input');
		assert.ok(input);
		// Keyboard focus must be inside the editor part so `editorAreaFocus` keeps Cmd+N on New File.
		const focusedElement = () => {
			const activeElement = mainWindow.document.activeElement;
			return activeElement === input ? 'searchInput' : activeElement === container.querySelector('.empty-file-editor') ? 'editorContainer' : 'other';
		};

		editor.focus();
		const emptySearch = focusedElement();
		// Set the text without an input event so no picker opens; focusing the input would open one.
		input.value = 'app';
		editor.focus();
		const nonEmptySearch = focusedElement();

		const editorContainer = container.querySelector('.empty-file-editor');
		assert.deepStrictEqual({
			role: editorContainer?.getAttribute('role'),
			ariaLabel: editorContainer?.getAttribute('aria-label'),
			emptySearch,
			nonEmptySearch,
			pickerOpen: !!instantiationService.get(IQuickInputService).currentQuickInput,
		}, {
			role: 'group',
			ariaLabel: 'Files editor',
			emptySearch: 'searchInput',
			nonEmptySearch: 'editorContainer',
			pickerOpen: false,
		});
	});

	test('empty file editor search picker keeps Cmd+N on New File', () => {
		const ctrlCmdN = decodeKeybinding(KeyMod.CtrlCmd | KeyCode.KeyN, OS)!.getHashCode();
		const rule = KeybindingsRegistry.getDefaultKeybindings()
			.find(item => item.command === 'workbench.action.files.newUntitledFile' && item.keybinding?.getHashCode() === ctrlCmdN && item.weight1 > KeybindingWeight.SessionsContrib);
		const evaluate = (values: Record<string, boolean>) => rule?.when?.evaluate({ getValue: <T>(key: string) => values[key] as T | undefined }) ?? true;

		assert.deepStrictEqual({
			// Outweighs the Agents Window New Session binding, which also matches outside the editor area.
			registered: !!rule,
			pickerFocused: evaluate({ [EmptyFileEditorSearchPickerFocusedContext.key]: true }),
			elsewhere: evaluate({}),
		}, {
			registered: true,
			pickerFocused: true,
			elsewhere: false,
		});
	});

	test('empty file editor search shows and opens matching files', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const queries: IFileQuery[] = [];
		const clearedCacheKeys: string[] = [];
		const opened: { resource: URI; preserveFocus: boolean | undefined; pinned: boolean | undefined }[] = [];
		const onDidClearCache = store.add(new Emitter<void>());
		const onDidOpen = store.add(new Emitter<void>());
		instantiationService.stub(ISearchService, new class extends mock<ISearchService>() {
			override async fileSearch(query: IFileQuery): Promise<ISearchComplete> {
				queries.push(query);
				return {
					results: query.filePattern?.startsWith('#') ? [
						{ resource: URI.file('/repo/.worktrees/session/src/#app.ts') },
					] : [
						{ resource: URI.file('/repo/.worktrees/session/src/app.ts') },
						{ resource: URI.file('/repo/.worktrees/session/test/app.test.ts') },
					],
					messages: [],
					limitHit: false,
				};
			}
			override clearCache(cacheKey: string): Promise<void> {
				clearedCacheKeys.push(cacheKey);
				onDidClearCache.fire();
				return Promise.resolve();
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (hasResource(editor)) {
					const options = Reflect.get(editor, 'options') as IEditorOptions | undefined;
					opened.push({ resource: editor.resource, preserveFocus: options?.preserveFocus, pinned: options?.pinned });
					onDidOpen.fire();
				}
				return undefined;
			}
		});
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-search empty-file-editor-search-test');
		container.style.width = '420px';
		store.add({ dispose: () => container.remove() });
		const search = store.add(instantiationService.createInstance(EmptyFileEditorSearch, container));
		search.setWorkspace(createWorkspaceWithFolders([{
			root: URI.file('/repo'),
			workingDirectory: URI.file('/repo/.worktrees/session'),
			name: 'session',
			description: undefined,
		}]));

		const input = container.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		const inputBox = container.querySelector<HTMLElement>('.monaco-inputbox');
		assert.ok(inputBox);
		const getInputBounds = () => {
			const { left, top, width, height } = inputBox.getBoundingClientRect();
			return { left, top, width, height };
		};
		const inputBoundsBeforeSearch = getInputBounds();
		input.value = 'a';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const onDidShowResults = getQuickPick(instantiationService).onDidChangeActive;
		const pickerTextInput = mainWindow.document.querySelector<HTMLInputElement>('.quick-input-widget.quick-input-widget-overlay .quick-input-filter input');
		assert.ok(pickerTextInput);
		pickerTextInput.setRangeText('p', pickerTextInput.selectionStart ?? 0, pickerTextInput.selectionEnd ?? 0, 'end');
		pickerTextInput.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		pickerTextInput.setRangeText('p', pickerTextInput.selectionStart ?? 0, pickerTextInput.selectionEnd ?? 0, 'end');
		pickerTextInput.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		await waitForCondition(onDidShowResults, () => queries.length >= 1
			&& mainWindow.document.querySelectorAll('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row').length === 2);
		const valueAfterPickerOpened = pickerTextInput.value;

		const picker = mainWindow.document.querySelector<HTMLElement>('.quick-input-widget.quick-input-widget-overlay');
		const pickerInput = picker?.querySelector<HTMLElement>('.quick-input-filter');
		const rows = Array.from(picker?.querySelectorAll<HTMLElement>('.quick-input-list .monaco-list-row') ?? []);
		const pickerInputBounds = pickerInput?.getBoundingClientRect();
		const pickerHelpContext = instantiationService.get(IContextKeyService).getContextKeyValue(EmptyFileEditorSearchPickerFocusedContext.key);
		const activePicker = instantiationService.get(IQuickInputService).currentQuickInput;
		assert.strictEqual(activePicker?.type, QuickInputType.QuickPick);
		(activePicker as IQuickPick<IQuickPickItem, { useSeparators: true }>).accept(true);
		await waitForCondition(onDidOpen.event, () => opened.length === 1);
		const backgroundAcceptState = {
			pickerVisible: picker?.style.display !== 'none',
			preserveFocus: opened[0].preserveFocus,
			pinned: opened[0].pinned,
		};
		(activePicker as IQuickPick<IQuickPickItem, { useSeparators: true }>).value = '#app';
		await waitForCondition(onDidShowResults, () => queries.some(query => query.filePattern === '#app')
			&& mainWindow.document.querySelectorAll('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row').length === 1);
		const prefixedRows = Array.from(
			mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row')
		).map(row => row.textContent);
		const queryCountBeforeMultiTerm = queries.length;
		(activePicker as IQuickPick<IQuickPickItem, { useSeparators: true }>).value = 'app test';
		await waitForCondition(onDidShowResults, () => queries.length > queryCountBeforeMultiTerm
			&& mainWindow.document.querySelectorAll('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row').length === 1);
		const multiTermRows = Array.from(
			mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row')
		).map(row => row.textContent);
		(activePicker as IQuickPick<IQuickPickItem, { useSeparators: true }>).accept();
		await waitForCondition(onDidOpen.event, () => opened.length === 2);
		const onDidHidePicker = (activePicker as IQuickPick<IQuickPickItem, { useSeparators: true }>).onDidHide;
		await waitForCondition(onDidHidePicker, () => picker?.style.display === 'none');
		await waitForCondition(onDidClearCache.event, () => queries.every(query => typeof query.cacheKey === 'string' && clearedCacheKeys.includes(query.cacheKey)));
		input.blur();
		await waitForCondition(onDidHidePicker, () => instantiationService.get(IContextKeyService).getContextKeyValue(EmptyFileEditorSearchPickerFocusedContext.key) === false);

		assert.deepStrictEqual({
			query: queries[0] && {
				folders: queries[0].folderQueries.map(folder => folder.folder.toString()),
				filePattern: queries[0].filePattern,
				maxResults: queries[0].maxResults,
				hasCacheKey: typeof queries[0].cacheKey === 'string',
			},
			queryPatterns: Array.from(new Set(queries.map(query => query.filePattern))),
			cacheKeyIsPickerScoped: new Set(queries.map(query => query.cacheKey)).size === 1,
			searchedCacheKeysCleared: queries.every(query => typeof query.cacheKey === 'string' && clearedCacheKeys.includes(query.cacheKey)),
			rows: rows.map(row => row.textContent),
			prefixedRows,
			multiTermRows,
			usesFileIcon: rows[0]?.querySelector('.monaco-icon-label')?.classList.contains('file-icon'),
			usesRealQuickPick: picker?.classList.contains('quick-input-widget-overlay'),
			hasItemButtons: rows.some(row => !!row.querySelector('.quick-input-list-entry.has-actions')),
			valueAfterPickerOpened,
			inputBoundsStable: pickerInputBounds?.left === inputBoundsBeforeSearch.left
				&& pickerInputBounds.top === inputBoundsBeforeSearch.top
				&& pickerInputBounds.width === inputBoundsBeforeSearch.width
				&& pickerInputBounds.height === inputBoundsBeforeSearch.height,
			pickerHelpContext,
			backgroundAcceptState,
			opened: opened.map(({ resource, preserveFocus, pinned }) => ({ resource: resource.toString(), preserveFocus, pinned })),
			pickerHelpContextAfterClose: instantiationService.get(IContextKeyService).getContextKeyValue(EmptyFileEditorSearchPickerFocusedContext.key),
		}, {
			query: {
				folders: [URI.file('/repo/.worktrees/session').toString()],
				filePattern: 'app',
				maxResults: 512,
				hasCacheKey: true,
			},
			queryPatterns: ['app', '#app'],
			cacheKeyIsPickerScoped: true,
			searchedCacheKeysCleared: true,
			rows: ['app.tssrc', 'app.test.tstest'],
			prefixedRows: ['#app.tssrc'],
			multiTermRows: ['app.test.tstest'],
			usesFileIcon: true,
			usesRealQuickPick: true,
			hasItemButtons: false,
			valueAfterPickerOpened: 'app',
			inputBoundsStable: true,
			pickerHelpContext: true,
			backgroundAcceptState: {
				pickerVisible: true,
				preserveFocus: true,
				pinned: true,
			},
			opened: [
				{ resource: URI.file('/repo/.worktrees/session/src/app.ts').toString(), preserveFocus: true, pinned: true },
				{ resource: URI.file('/repo/.worktrees/session/test/app.test.ts').toString(), preserveFocus: false, pinned: true },
			],
			pickerHelpContextAfterClose: false,
		});
	});

	test('empty file editor search combines session working directories before native ranking', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const queries: IFileQuery[] = [];
		const onDidSearch = store.add(new Emitter<void>());
		instantiationService.stub(ISearchService, new class extends mock<ISearchService>() {
			override async fileSearch(query: IFileQuery): Promise<ISearchComplete> {
				queries.push(query);
				onDidSearch.fire();
				return { results: [], messages: [], limitHit: false };
			}
			override clearCache(): Promise<void> {
				return Promise.resolve();
			}
		});
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-search');
		store.add({ dispose: () => container.remove() });
		const search = store.add(instantiationService.createInstance(EmptyFileEditorSearch, container));
		search.setWorkspace(createWorkspaceWithFolders([
			{
				root: URI.file('/repo'),
				workingDirectory: URI.file('/repo/.worktrees/session'),
				name: 'session',
				description: undefined,
			},
			{
				root: URI.file('/other'),
				workingDirectory: URI.file('/other/.worktrees/session'),
				name: 'other',
				description: undefined,
			},
		]));

		const input = container.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		input.value = 'file';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		await waitForCondition(onDidSearch.event, () => queries.length === 1);

		assert.deepStrictEqual({
			folders: queries[0].folderQueries.map(folderQuery => folderQuery.folder.toString()),
			maxResults: queries[0].maxResults,
		}, {
			folders: [
				'file:///repo/.worktrees/session',
				'file:///other/.worktrees/session',
			],
			maxResults: 512,
		});
	});

	test('empty file editor search announces its accessibility help hint once', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const announcements: string[] = [];
		let hint: string | null = null;
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override isScreenReaderOptimized(): boolean {
				return true;
			}
			override status(message: string): void {
				announcements.push(message);
			}
		});
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint(): string | null {
				return hint;
			}
		});
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-search');
		store.add({ dispose: () => container.remove() });
		store.add(instantiationService.createInstance(EmptyFileEditorSearch, container));
		const input = container.querySelector<HTMLInputElement>('input');
		assert.ok(input);

		input.focus();
		input.blur();
		hint = 'Inspect accessibility help';
		input.dispatchEvent(new mainWindow.FocusEvent('focus'));
		input.dispatchEvent(new mainWindow.FocusEvent('focus'));

		assert.deepStrictEqual(announcements, ['Inspect accessibility help']);
	});

	test('empty file editor search traverses virtual session workspaces', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const root = URI.parse('test://workspace/root');
		const source = root.with({ path: '/root/src' });
		const excluded = root.with({ path: '/root/ignored' });
		const removed = root.with({ path: '/root/removed' });
		const resource = root.with({ path: '/root/src/app.test.ts' });
		const generatedResource = root.with({ path: '/root/src/app.test.js' });
		const excludedResource = root.with({ path: '/root/ignored/secret.ts' });
		const searchQueries: IFileQuery[] = [];
		const opened: URI[] = [];
		const onDidOpen = store.add(new Emitter<void>());
		let excludedResolved = false;
		const configurationService = new TestConfigurationService({
			files: {
				exclude: {
					'**/ignored': true,
					'**/*.js': { when: '$(basename).ts' },
				},
			},
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override async resolve(candidate: URI) {
				if (candidate.toString() === root.toString()) {
					return createFileStat(root, false, false, true, false, [
						{ resource: source, isFile: false, isDirectory: true },
						{ resource: excluded, isFile: false, isDirectory: true },
						{ resource: removed, isFile: false, isDirectory: true },
					]);
				}
				if (candidate.toString() === source.toString()) {
					return createFileStat(source, false, false, true, false, [
						{ resource, isFile: true, isDirectory: false },
						{ resource: generatedResource, isFile: true, isDirectory: false },
						{ resource: root, isFile: false, isDirectory: true },
					]);
				}
				if (candidate.toString() === removed.toString()) {
					throw new FileOperationError('Removed while indexing', FileOperationResult.FILE_NOT_FOUND);
				}
				if (candidate.toString() === excluded.toString()) {
					excludedResolved = true;
					return createFileStat(excluded, false, false, true, false, [{ resource: excludedResource, isFile: true, isDirectory: false }]);
				}
				return createFileStat(candidate);
			}
		});
		instantiationService.stub(ISearchService, new class extends mock<ISearchService>() {
			override schemeHasFileSearchProvider(): boolean {
				return false;
			}
			override clearCache(): Promise<void> {
				return Promise.resolve();
			}
			override async fileSearch(query: IFileQuery): Promise<ISearchComplete> {
				searchQueries.push(query);
				return { results: [], messages: [], limitHit: false };
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (hasResource(editor)) {
					opened.push(editor.resource);
					onDidOpen.fire();
				}
				return undefined;
			}
		});
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-search');
		store.add({ dispose: () => container.remove() });
		const search = store.add(instantiationService.createInstance(EmptyFileEditorSearch, container));
		search.setWorkspace(createWorkspace(root));

		const input = container.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		input.value = 'app';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const picker = getQuickPick(instantiationService);
		await waitForCondition(picker.onDidChangeActive, () => mainWindow.document.querySelectorAll('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row').length === 1);
		const unquotedResult = picker.activeItems[0];
		picker.value = '"app*.test.ts"';
		await waitForCondition(picker.onDidChangeActive, () => picker.activeItems[0] !== unquotedResult);
		const rows = Array.from(mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row'));
		rows[0]?.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		await waitForCondition(onDidOpen.event, () => opened.length === 1);

		assert.deepStrictEqual({
			rows: rows.map(row => row.textContent),
			opened: opened.map(candidate => candidate.toString()),
			searchQueries: searchQueries.length,
			excludedResolved,
			query: picker.value,
		}, {
			rows: ['app.test.tssrc'],
			opened: [resource.toString()],
			searchQueries: 0,
			excludedResolved: false,
			query: '"app*.test.ts"',
		});
	});

	test('empty file editor search preserves provider results and retries failed virtual indexes', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const nativeRoot = URI.file('/repo');
		const virtualRoot = URI.parse('test://workspace/root');
		let virtualResolveAttempts = 0;
		const loggedErrors: unknown[] = [];
		const fileSearchPatterns: string[] = [];
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override async resolve(): Promise<never> {
				virtualResolveAttempts++;
				throw new Error('Virtual provider unavailable');
			}
		});
		instantiationService.stub(ILogService, new class extends mock<ILogService>() {
			override error(error: unknown): void {
				loggedErrors.push(error);
			}
		});
		instantiationService.stub(ISearchService, new class extends mock<ISearchService>() {
			override schemeHasFileSearchProvider(): boolean {
				return false;
			}
			override clearCache(): Promise<void> {
				return Promise.resolve();
			}
			override async fileSearch(query: IFileQuery): Promise<ISearchComplete> {
				fileSearchPatterns.push(query.filePattern ?? '');
				return {
					results: [{ resource: URI.joinPath(nativeRoot, `${query.filePattern}.ts`) }],
					messages: [],
					limitHit: false,
				};
			}
		});
		const container = appendElement(mainWindow.document.body, 'empty-file-editor-search');
		store.add({ dispose: () => container.remove() });
		const search = store.add(instantiationService.createInstance(EmptyFileEditorSearch, container));
		search.setWorkspace(createWorkspaceWithFolders([
			{ root: nativeRoot, workingDirectory: nativeRoot, name: 'native', description: undefined },
			{ root: virtualRoot, workingDirectory: virtualRoot, name: 'virtual', description: undefined },
		]));

		const input = container.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		input.value = 'app';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const picker = getQuickPick(instantiationService);
		await waitForCondition(picker.onDidChangeActive, () => virtualResolveAttempts >= 1
			&& mainWindow.document.querySelectorAll('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row').length === 1);
		const firstRows = Array.from(mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row')).map(row => row.textContent);
		picker.value = 'other';
		await waitForCondition(picker.onDidChangeActive, () => fileSearchPatterns.includes('other'));
		const secondRows = Array.from(mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget.quick-input-widget-overlay .quick-input-list .monaco-list-row')).map(row => row.textContent);

		assert.deepStrictEqual({
			firstRows,
			secondRows,
			virtualResolveAttempts,
			loggedErrors: loggedErrors.length,
			fileSearchPatterns,
		}, {
			firstRows: ['app.tsworkspace'],
			secondRows: ['other.tsworkspace'],
			virtualResolveAttempts: 2,
			loggedErrors: 2,
			fileSearchPatterns: ['app', 'other'],
		});
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

	test('session activity bar browser action activates an existing browser tab or opens a new preview tab', async () => {
		const createBrowserInput = (url: string | undefined): BrowserEditorInput => {
			const input = Object.create(BrowserEditorInput.prototype) as BrowserEditorInput;
			Object.defineProperty(input, 'url', { value: url });
			return input;
		};
		const newInput = createBrowserInput(undefined);
		const navigatedInput = createBrowserInput('https://example.com');
		const blankInput = createBrowserInput(undefined);
		const otherInput = Object.create(EditorInput.prototype) as EditorInput;
		const browserPane = new class extends mock<ITextDiffEditorPane>() { };
		const group = new class extends mock<IEditorGroup>() { };
		const names = new Map<unknown, string>([[newInput, 'new'], [navigatedInput, 'navigated'], [blankInput, 'blank'], [otherInput, 'other'], [browserPane, 'browserPane'], [group, 'group']]);
		const name = (value: unknown) => names.get(value) ?? String(value);

		const run = async (mruEditors: EditorInput[]) => {
			const calls: unknown[] = [];
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override readonly mainPart = new class extends mock<IEditorPart>() {
					override readonly activeGroup = Object.assign(group, {
						getEditors: (order: EditorsOrder) => order === EditorsOrder.MOST_RECENTLY_ACTIVE ? mruEditors : []
					});
				};
			});
			instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
				override getOrCreateLazy(): BrowserEditorInput {
					return newInput;
				}
			});
			instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
				override async openEditor(...args: unknown[]): Promise<ITextDiffEditorPane> {
					calls.push({ openEditor: name(args[0]), options: args[1], group: name(args[2]) });
					return browserPane;
				}
			});
			instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<R>(id: string, ...args: unknown[]): Promise<R> {
					calls.push({ command: id, editorPane: name(args[0]) });
					return undefined as R;
				}
			});

			await new OpenBrowserAction().run(instantiationService);
			return calls;
		};

		assert.deepStrictEqual({
			noBrowserTab: await run([otherInput]),
			existingNavigatedTab: await run([otherInput, navigatedInput, blankInput]),
			existingBlankTab: await run([blankInput, navigatedInput]),
		}, {
			noBrowserTab: [
				{ openEditor: 'new', options: undefined, group: 'group' },
				{ command: BrowserViewCommandId.FocusUrlInput, editorPane: 'browserPane' },
			],
			existingNavigatedTab: [
				{ openEditor: 'navigated', options: undefined, group: 'group' },
			],
			existingBlankTab: [
				{ openEditor: 'blank', options: undefined, group: 'group' },
				{ command: BrowserViewCommandId.FocusUrlInput, editorPane: 'browserPane' },
			],
		});
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
			const when = availableKey === DesktopFilesTabAvailableContext.key
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
			files: scenarios(DesktopFilesTabAvailableContext.key, DesktopFilesTabMissingContext.key),
			changes: scenarios(DesktopChangesTabAvailableContext.key, DesktopChangesTabMissingContext.key),
			searchInDockOnly: evaluate(getWhen(new NewSearchTabAction()), baseContext),
			searchInQuickChat: evaluate(getWhen(new NewSearchTabAction()), { ...baseContext, [IsQuickChatSessionContext.key]: true }),
		}, {
			files: { singleTabAlreadyOpen: true, multipleTabsAlreadyOpen: false, multipleTabsMissing: true, dockOnlyMissing: true, unsupported: false },
			changes: { singleTabAlreadyOpen: true, multipleTabsAlreadyOpen: false, multipleTabsMissing: true, dockOnlyMissing: true, unsupported: false },
			searchInDockOnly: true,
			searchInQuickChat: false,
		});
	});

	test('the empty editor group list offers the Add Tab entries except Search', () => {
		const actions = { changes: new NewChangesTabAction(), files: new NewFileTabAction(), browser: new NewBrowserTabAction(), search: new NewSearchTabAction() };
		const result: Record<string, { readonly listed: boolean; readonly sameWhenAsAddTab?: boolean }> = {};
		for (const [name, action] of Object.entries(actions)) {
			const items = Array.isArray(action.desc.menu) ? action.desc.menu : [action.desc.menu];
			const addTab = items.find(item => item?.id === Menus.SessionsEditorTabsBarAddTab);
			const list = items.find(item => item?.id === Menus.SessionsEmptyEditorGroupAddTab);
			result[name] = list
				? { listed: true, sameWhenAsAddTab: list.when?.serialize() === addTab?.when?.serialize() && list.order === addTab?.order }
				: { listed: false };
		}

		assert.deepStrictEqual(result, {
			changes: { listed: true, sameWhenAsAddTab: true },
			files: { listed: true, sameWhenAsAddTab: true },
			browser: { listed: true, sameWhenAsAddTab: true },
			search: { listed: false },
		});
	});

	test('the session activity bar offers each tab whenever it is available', () => {
		const actions = { changes: new NewChangesTabAction(), files: new NewFileTabAction(), browser: new OpenBrowserAction(), addBrowserTab: new NewBrowserTabAction(), search: new NewSearchTabAction() };
		// Search and the explicit new browser tab are only offered in the Add Tab dropdown.
		const evaluate = (action: NewChangesTabAction | NewFileTabAction | OpenBrowserAction | NewBrowserTabAction | NewSearchTabAction, values: Record<string, ContextKeyValue>): boolean | undefined => {
			const menu = action.desc.menu;
			const item = (Array.isArray(menu) ? menu : [menu]).find(item => item?.id === Menus.SessionActivityBar);
			return item?.when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext);
		};
		// The toolbar ignores tab state: tabs are open and the right group is not the active one.
		const baseContext: Record<string, ContextKeyValue> = {
			[IsSessionsWindowContext.key]: true,
			[IsAuxiliaryWindowContext.key]: false,
			[IsTopRightEditorGroupContext.key]: false,
			[EditorTabsVisibleContext.key]: true,
			[DesktopChangesTabMissingContext.key]: false,
			[DesktopFilesTabMissingContext.key]: false,
		};
		const contexts: Record<string, Record<string, ContextKeyValue>> = {
			workspaceChat: { ...baseContext, [DesktopChangesTabAvailableContext.key]: true, [DesktopFilesTabAvailableContext.key]: true },
			workspacelessChat: baseContext,
			quickChat: { ...baseContext, [IsQuickChatSessionContext.key]: true },
			auxiliaryWindow: { ...baseContext, [DesktopChangesTabAvailableContext.key]: true, [DesktopFilesTabAvailableContext.key]: true, [IsAuxiliaryWindowContext.key]: true },
		};

		const result: Record<string, string[]> = {};
		for (const [name, values] of Object.entries(contexts)) {
			result[name] = Object.entries(actions).filter(([, action]) => evaluate(action, values)).map(([id]) => id);
		}
		assert.deepStrictEqual(result, {
			workspaceChat: ['changes', 'files', 'browser'],
			workspacelessChat: ['browser'],
			quickChat: ['browser'],
			auxiliaryWindow: [],
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
			[DesktopChangesTabAvailableContext.key]: true,
		};
		const context: IContext = {
			getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined
		};

		assert.deepStrictEqual({
			preconditionHasAvailability: precondition.includes(DesktopChangesTabAvailableContext.key),
			keybindingHasAvailability: when.includes(DesktopChangesTabAvailableContext.key),
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
			workingDirectory: input.workspace?.folders[0]?.workingDirectory.toString(),
			matchesAnotherEmptyInput: input.matches(other)
		}, {
			workingDirectory: URI.file('/repo/other').toString(),
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

	test('empty file editor never exposes a resource for breadcrumbs', () => {
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
			visibleResource: input.resource,
			labelChanges
		}, {
			hiddenResource: undefined,
			visibleResource: undefined,
			labelChanges: 0
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
			override getChangesEditorResource(sessionResource: URI): URI {
				return changesEditorResource(sessionResource);
			}
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
			override getChangesEditorResource(sessionResource: URI): URI {
				return changesEditorResource(sessionResource);
			}
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

	test('changes and files tab actions activate an existing tab in place instead of moving it', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const resource = URI.parse('session:1');
		const workspace = createWorkspace(URI.file('/repo'));
		stubEditorVisibility(instantiationService, true);
		const existingChanges = store.add(new TestResourceEditorInput(changesEditorResource(resource)));
		const existingFiles = store.add(instantiationService.createInstance(EmptyFileEditorInput, workspace));
		stubEditorGroupCount(instantiationService, 3, [existingChanges, existingFiles]);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable({
				resource,
				isCreated: constObservable(true),
				activeChat: constObservable({ workspace: constObservable(workspace) }),
			} as unknown as IActiveSession);
		});
		const opened: { readonly kind: string; readonly index: number | undefined }[] = [];
		instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override getChangesEditorResource(sessionResource: URI): URI {
				return changesEditorResource(sessionResource);
			}
			override async openChangesEditor(_sessionResource: URI, options?: IEditorOptions): Promise<undefined> {
				opened.push({ kind: 'changes', index: options?.index });
				return undefined;
			}
		});
		instantiationService.set(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				if (args[0] instanceof EditorInput) {
					store.add(args[0]);
				}
				opened.push({ kind: 'files', index: (args[1] as IEditorOptions | undefined)?.index });
				return undefined;
			}
		});

		await new NewChangesTabAction().run(instantiationService);
		await new NewFileTabAction().run(instantiationService);

		assert.deepStrictEqual(opened, [{ kind: 'changes', index: undefined }, { kind: 'files', index: undefined }]);
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
