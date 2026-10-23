/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import * as resourceUtils from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IMenuService, isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { QuickInputService } from '../../../../../platform/quickinput/browser/quickInputService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { BrowserEditor } from '../../../../../workbench/contrib/browserView/electron-browser/browserEditor.js';
import '../../../../../workbench/contrib/browserView/electron-browser/features/browserNavigationFeatures.js';
import '../../../../../workbench/contrib/browserView/electron-browser/features/browserWelcomeFeature.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IChatWidgetService, IQuickChatService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IExternalUriOpenerService } from '../../../../../workbench/contrib/externalUriOpener/common/externalUriOpenerService.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../../../../workbench/contrib/files/browser/fileConstants.js';
import '../../../../../workbench/contrib/search/browser/searchQuickAccess.contribution.js';
import { IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { ICustomEditorLabelService } from '../../../../../workbench/services/editor/common/customEditorLabelService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { IFilesConfigurationService } from '../../../../../workbench/services/filesConfiguration/common/filesConfigurationService.js';
import { IHistoryService } from '../../../../../workbench/services/history/common/history.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { IOutlineService } from '../../../../../workbench/services/outline/browser/outline.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { IFileQuery, ISearchComplete, ISearchService } from '../../../../../workbench/services/search/common/search.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IWorkingCopyService } from '../../../../../workbench/services/workingCopy/common/workingCopyService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

import { Menus } from '../../../../../sessions/browser/menus.js';
import { EmptyFileEditor } from '../../../../../sessions/contrib/editor/browser/emptyFileEditor.js';
import '../../../../../sessions/contrib/editor/browser/emptyFileEditor.contribution.js';
import { EmptyFileEditorInput } from '../../../../../sessions/contrib/editor/browser/emptyFileEditorInput.js';
import { ChangesEmptyState } from '../../../../../sessions/contrib/changes/browser/changesEmptyState.js';
import '../../../../../sessions/contrib/editor/electron-browser/browserEmptyState.contribution.js';
import { FixtureKeybindingService } from '../../../../../sessions/test/browser/addTabFixtureUtils.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../../sessions/common/sessionCommands.js';
import { OpenEditorCommandId } from '../../../../../workbench/contrib/searchEditor/browser/constants.js';
import '../../../../../sessions/browser/parts/media/editorPart.css';

const FIXTURE_WIDTH = 600;
const FIXTURE_HEIGHT = 360;

class FixtureQuickInputService extends QuickInputService {
	activePick: IQuickPick<IQuickPickItem> | undefined;

	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: boolean } = { useSeparators: false }): IQuickPick<T, { useSeparators: boolean }> {
		const quickPick = super.createQuickPick<T>(options);
		this.activePick = quickPick;
		return quickPick;
	}

	override dispose(): void {
		this.activePick?.hide();
		this.activePick = undefined;
		super.dispose();
	}
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

function prepareContainer(container: HTMLElement, width = FIXTURE_WIDTH): HTMLElement {
	container.style.width = `${width}px`;
	container.style.height = `${FIXTURE_HEIGHT}px`;
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	const editorPart = dom.append(container, dom.$('.part.editor'));
	editorPart.style.width = '100%';
	editorPart.style.height = '100%';
	editorPart.style.backgroundColor = 'var(--vscode-editor-background)';
	return editorPart;
}

function ensureEmptyFileEditorActionRegistration(): void {
	if (MenuRegistry.getMenuItems(Menus.EmptyFileEditorActions).some(item => isIMenuItem(item) && item.command.id === NEW_UNTITLED_FILE_COMMAND_ID)) {
		return;
	}
	MenuRegistry.appendMenuItem(Menus.EmptyFileEditorActions, {
		command: {
			id: NEW_UNTITLED_FILE_COMMAND_ID,
			title: 'New File',
			icon: Codicon.newFile,
		},
		group: 'navigation',
		order: 1,
	});
}

async function renderFilesEmptyState(context: ComponentFixtureContext, searchValue?: string): Promise<void> {
	const { container, disposableStore, theme } = context;
	ensureEmptyFileEditorActionRegistration();
	const editorPart = prepareContainer(container);
	const layoutService = new class extends mock<ILayoutService>() {
		override activeContainer = container;
		override get activeContainerDimension() { return { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT }; }
		override activeContainerOffset = { top: 0, quickPickTop: 0 };
		override mainContainer = container;
		override get mainContainerDimension() { return { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT }; }
		override mainContainerOffset = { top: 0, quickPickTop: 0 };
		override containers = [container];
		override onDidLayoutMainContainer = Event.None;
		override onDidLayoutContainer = Event.None;
		override onDidLayoutActiveContainer = Event.None;
		override onDidAddContainer = Event.None;
		override onDidChangeActiveContainer = Event.None;
		override getContainer(): HTMLElement { return container; }
		override whenContainerStylesLoaded(): Promise<void> | undefined { return undefined; }
		override focus(): void { }
	};
	const contextMenuService = new class extends mock<IContextMenuService>() {
		override onDidShowContextMenu = Event.None;
		override onDidHideContextMenu = Event.None;
		override showContextMenu(): void { }
	};
	const contextViewService = new class extends mock<IContextViewService>() {
		override anchorAlignment = 0;
		override showContextView() { return { close: () => { } }; }
		override hideContextView(): void { }
		override getContextViewElement(): HTMLElement { return container; }
		override layout(): void { }
	};
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.define(IContextKeyService, ContextKeyService);
			registration.define(IMenuService, MenuService);
			registration.defineInstance(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
				override getOpenAriaHint(): null { return null; }
			}());
			registration.defineInstance(ILayoutService, layoutService);
			registration.defineInstance(IContextMenuService, contextMenuService);
			registration.defineInstance(IContextViewService, contextViewService);
			registration.define(IListService, ListService);
			registration.define(IQuickInputService, FixtureQuickInputService);
			registration.defineInstance(IFileService, new class extends mock<IFileService>() { }());
			registration.defineInstance(IPathService, new class extends mock<IPathService>() { }());
			registration.defineInstance(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() { }());
			registration.defineInstance(IWorkingCopyService, new class extends mock<IWorkingCopyService>() {
				override isDirty(): boolean { return false; }
			}());
			registration.defineInstance(IHistoryService, new class extends mock<IHistoryService>() { }());
			registration.defineInstance(IFilesConfigurationService, new class extends mock<IFilesConfigurationService>() {
				override hasShortAutoSaveDelay(): boolean { return false; }
			}());
			registration.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = resourceUtils.extUri;
			}());
			registration.defineInstance(IQuickChatService, new class extends mock<IQuickChatService>() { }());
			registration.defineInstance(ICustomEditorLabelService, new class extends mock<ICustomEditorLabelService>() {
				override getName(): undefined { return undefined; }
			}());
			registration.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() { }());
			registration.defineInstance(IOutlineService, new class extends mock<IOutlineService>() { }());
			registration.defineInstance(IOutlineModelService, new class extends mock<IOutlineModelService>() { }());
			registration.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override readonly onDidChangeDecorations = Event.None; }());
			registration.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { override getNotebook() { return undefined; } }());
			registration.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			registration.defineInstance(ISearchService, new class extends mock<ISearchService>() {
				override async fileSearch(_query: IFileQuery): Promise<ISearchComplete> {
					return {
						results: [
							{ resource: URI.file('/repo/src/app.ts') },
							{ resource: URI.file('/repo/test/app.test.ts') },
							{ resource: URI.file('/repo/src/app.config.ts') },
							{ resource: URI.file('/repo/src/app.service.ts') },
							{ resource: URI.file('/repo/src/app.model.ts') },
							{ resource: URI.file('/repo/test/app.fixture.ts') },
							{ resource: URI.file('/repo/src/app.css') },
							{ resource: URI.file('/repo/docs/app.md') },
						],
						messages: [],
						limitHit: false,
					};
				}
				override clearCache(): Promise<void> {
					return Promise.resolve();
				}
			}());
			registration.defineInstance(IEditorService, new class extends mock<IEditorService>() { }());
			registration.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
			registration.defineInstance(IExternalUriOpenerService, new class extends mock<IExternalUriOpenerService>() { }());
		},
	});
	const editor = disposableStore.add(instantiationService.createInstance(EmptyFileEditor, createMockEditorGroup()));
	editor.create(editorPart);
	editor.layout(new dom.Dimension(FIXTURE_WIDTH, FIXTURE_HEIGHT));
	await waitForFixtureCondition(
		() => container.querySelectorAll('.empty-file-editor-actions .sessions-add-tab-watermark-entry').length === 2,
		'Files empty-state fixture did not render its action rows',
	);

	if (searchValue) {
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean { return true; }
		}();
		const input = disposableStore.add(new EmptyFileEditorInput({
			uri: URI.file('/repo/workspace.code-workspace'),
			label: 'workspace',
			icon: Codicon.repo,
			folders: [{
				root: URI.file('/repo'),
				workingDirectory: URI.file('/repo'),
				name: 'repo',
				description: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}, layoutService));
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		const searchInput = container.querySelector<HTMLInputElement>('.empty-file-editor-search input');
		if (!searchInput) {
			throw new Error('Files empty-state fixture did not render the search input.');
		}
		searchInput.value = searchValue;
		searchInput.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		await waitForFixtureCondition(
			() => {
				const widget = container.querySelector<HTMLElement>('.quick-input-widget.quick-input-widget-overlay');
				const pickerFilter = widget?.querySelector<HTMLElement>('.quick-input-filter');
				const anchor = container.querySelector<HTMLElement>('.empty-file-editor-search .monaco-inputbox');
				if (!widget || !pickerFilter || !anchor
					|| container.querySelectorAll('.quick-input-list .monaco-list-row').length < 4
					|| container.querySelector('.quick-input-list .monaco-list-row')?.classList.contains('focused') !== true) {
					return false;
				}

				const widgetBounds = widget.getBoundingClientRect();
				const pickerBounds = pickerFilter.getBoundingClientRect();
				const anchorBounds = anchor.getBoundingClientRect();
				return widgetBounds.height > 100
					&& Math.abs(pickerBounds.left - anchorBounds.left) < 1
					&& Math.abs(pickerBounds.top - anchorBounds.top) < 1
					&& Math.abs(pickerBounds.width - anchorBounds.width) < 1
					&& Math.abs(pickerBounds.height - anchorBounds.height) < 1;
			},
			'Files empty-state fixture did not render search results',
		);
		const pickerInput = container.querySelector<HTMLInputElement>('.quick-input-filter input');
		if (!pickerInput) {
			throw new Error('Files empty-state fixture did not render the Quick Pick input.');
		}
		pickerInput.style.caretColor = 'transparent';
		context.focus(pickerInput);
		await waitForFixtureCondition(
			() => container.querySelector('.quick-input-list .monaco-list-row')?.classList.contains('focused') === true
				&& mainWindow.document.activeElement === pickerInput,
			'Files empty-state fixture did not render the expected Quick Pick focus state',
		);
	}
}

function createEmptyStateServices({ disposableStore, theme }: ComponentFixtureContext) {
	return createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IMenuService, MenuService);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(ILayoutService, TestLayoutService);
			reg.defineInstance(IPreferencesService, new class extends mock<IPreferencesService>() { }());
			reg.defineInstance(IKeybindingService, new FixtureKeybindingService([
				{ id: BrowserViewCommandId.FocusUrlInput, title: 'Open Address...', icon: Codicon.link, keybinding: KeyMod.CtrlCmd | KeyCode.KeyL },
				{ id: BrowserViewCommandId.ShowHistory, title: 'History', icon: Codicon.history, keybinding: KeyMod.CtrlCmd | KeyCode.KeyY },
				{ id: NEW_FILE_TAB_COMMAND_ID, title: 'Open Files', icon: Codicon.files, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },
				{ id: OpenEditorCommandId, title: 'Search in Files', icon: Codicon.search, keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF },
			]));
		},
	});
}

function renderBrowserEmptyState(context: ComponentFixtureContext, width = FIXTURE_WIDTH, focusHistory = false): void {
	const editorPart = prepareContainer(context.container, width);
	const instantiationService = createEmptyStateServices(context);
	const editor = context.disposableStore.add(instantiationService.createInstance(BrowserEditor, createMockEditorGroup()));
	editor.create(editorPart);
	editor.layout(new dom.Dimension(width, FIXTURE_HEIGHT));
	if (focusHistory) {
		const rows = editorPart.querySelectorAll<HTMLElement>('.sessions-browser-empty-state .sessions-add-tab-watermark-entry');
		if (rows.length !== 2) {
			throw new Error('Expected Open Address and History action rows');
		}
		context.focus(rows[1]);
	}
}

function renderChangesEmptyState(context: ComponentFixtureContext, width = FIXTURE_WIDTH): void {
	const editorPart = prepareContainer(context.container, width);
	editorPart.style.display = 'flex';
	editorPart.style.alignItems = 'center';
	editorPart.style.justifyContent = 'center';
	context.disposableStore.add(createEmptyStateServices(context).createInstance(ChangesEmptyState, editorPart));
}

export default defineThemedFixtureGroup({ path: 'sessions/emptyStates/' }, {
	Files: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Open File aligns vertically with the main empty panel first action. The Search files by name input sits above the buttons, followed by New File, with no repeated heading or description.'],
		render: renderFilesEmptyState,
	}),
	FilesWithSearchResults: defineComponentFixture({
		labels: { kind: 'screenshot' },
		deferPaint: true,
		virtualTime: { enabled: false },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A native anchored Quick Pick overlays the centered file search field without moving it. Compact file result rows cover rather than move the Open File and New File action rows below.'],
		render: context => renderFilesEmptyState(context, 'app'),
	}),
	Browser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The address/search control remains in the normal full-width browser toolbar at the top. Open Address aligns vertically with the main empty panel first action, followed by History, without a repeated Browser heading or globe illustration.'],
		render: renderBrowserEmptyState,
	}),
	BrowserNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderBrowserEmptyState(context, 240),
	}),
	BrowserHistoryFocused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Both Browser action rows and shortcut chips are fully visible, including the entire focus outline around the bottom History row.'],
		render: context => renderBrowserEmptyState(context, FIXTURE_WIDTH, true),
	}),
	Changes: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Open Files aligns vertically with the main empty panel first action. The No changed files status sits above it and Search in Files below it, without a repeated Changes heading.'],
		render: renderChangesEmptyState,
	}),
	ChangesNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderChangesEmptyState(context, 240),
	}),
});
