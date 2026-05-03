/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AICustomizationManagementEditor } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IAICustomizationListItem } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemSource.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IMcpServer, IMcpService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IEditorService, PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane, IResourceDiffEditorInput, ITextDiffEditorPane, ITextResourceDiffEditorInput, IUntitledTextResourceEditorInput, IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorOptions, IResourceEditorInput, ITextResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';

class TestActionViewItemService implements IActionViewItemService {
	declare _serviceBrand: undefined;

	readonly onDidChange = Event.None;

	register(_menu: MenuId, _commandId: string | MenuId, _provider: IActionViewItemFactory): { dispose(): void } {
		return { dispose: () => { } };
	}

	lookUp(_menu: MenuId, _commandId: string | MenuId): IActionViewItemFactory | undefined {
		return undefined;
	}
}

class TestMenuService implements IMenuService {
	declare readonly _serviceBrand: undefined;

	createMenu(_id: MenuId): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => [],
		};
	}

	getMenuActions(_id: MenuId, _contextKeyService: unknown, _options?: IMenuActionOptions) { return []; }
	getMenuContexts() { return new Set<string>(); }
	resetHiddenStates() { }
}

type TestWelcomeEditor = AICustomizationManagementEditor & { showWelcomePageCallCount: number };

function createTestWelcomeEditor(): TestWelcomeEditor {
	const editor = Object.create(AICustomizationManagementEditor.prototype) as TestWelcomeEditor;
	editor.showWelcomePageCallCount = 0;
	editor.showWelcomePage = () => {
		editor.showWelcomePageCallCount++;
	};
	return editor;
}

class TestEditorService extends mock<IEditorService>() {
	override readonly onDidActiveEditorChange = Event.None;
	override readonly onDidVisibleEditorsChange = Event.None;
	override readonly onDidEditorsChange = Event.None;

	openEditorCallCount = 0;
	lastInput: EditorInput | IUntypedEditorInput | undefined;
	readonly editor = createTestWelcomeEditor();

	override openEditor(editor: IResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: ITextResourceEditorInput | IUntitledTextResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: ITextResourceDiffEditorInput | IResourceDiffEditorInput, group?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
	override openEditor(editor: IUntypedEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override async openEditor(editor: EditorInput | IUntypedEditorInput, _optionsOrGroup?: IEditorOptions | PreferredGroup, _group?: PreferredGroup): Promise<IEditorPane | ITextDiffEditorPane | undefined> {
		this.openEditorCallCount++;
		this.lastInput = editor;
		return this.editor;
	}
}

function createMockItemsModel(): IAICustomizationItemsModel {
	const emptyItems = observableValue<readonly IAICustomizationListItem[]>('emptyCustomizationItems', []);
	const zeroCount = observableValue('emptyCustomizationCount', 0);

	return new class extends mock<IAICustomizationItemsModel>() {
		override getItems(_section: ItemsModelSection): IObservable<readonly IAICustomizationListItem[]> {
			return emptyItems;
		}

		override getCount(_section: ItemsModelSection): IObservable<number> {
			return zeroCount;
		}

		override getPluginCount(): IObservable<number> {
			return zeroCount;
		}
	}();
}

function createWidget(disposables: DisposableStore, storageService = disposables.add(new InMemoryStorageService())): { container: HTMLElement; editorService: TestEditorService; storageService: InMemoryStorageService } {
	const container = document.createElement('div');
	document.body.appendChild(container);
	disposables.add({ dispose: () => container.remove() });

	const editorService = new TestEditorService();
	const instantiationService = createInstantiationService(disposables, storageService, editorService);

	disposables.add(instantiationService.createInstance(AICustomizationShortcutsWidget, container, undefined));
	return { container, editorService, storageService };
}

function createInstantiationService(disposables: DisposableStore, storageService: IStorageService, editorService: IEditorService): TestInstantiationService {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IMenuService, new TestMenuService());
	instantiationService.set(IActionViewItemService, new TestActionViewItemService());
	instantiationService.set(IContextKeyService, new MockContextKeyService());
	instantiationService.set(IContextMenuService, {
		_serviceBrand: undefined,
		onDidShowContextMenu: Event.None,
		onDidHideContextMenu: Event.None,
		showContextMenu: () => { },
	});
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(ICommandService, new TestCommandService(instantiationService));
	instantiationService.set(ITelemetryService, new NullTelemetryServiceShape());
	instantiationService.set(IStorageService, storageService);
	instantiationService.set(IEditorService, editorService);
	instantiationService.set(IAICustomizationItemsModel, createMockItemsModel());
	instantiationService.set(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
		private readonly _descriptor: IHarnessDescriptor = {
			id: 'test',
			label: 'Test',
			icon: ThemeIcon.fromId('vm'),
			getStorageSourceFilter: () => ({ sources: [] }),
		};
		override readonly activeHarness = observableValue('testActiveHarness', 'test');
		override readonly availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('testAvailableHarnesses', [this._descriptor]);
		override findHarnessById(id: string) { return id === this._descriptor.id ? this._descriptor : undefined; }
		override getActiveDescriptor() { return this._descriptor; }
	}());
	instantiationService.set(IMcpService, new class extends mock<IMcpService>() {
		override readonly servers = observableValue<readonly IMcpServer[]>('emptyMcpServers', []);
	}());
	instantiationService.set(IAgentPluginService, new class extends mock<IAgentPluginService>() {
		override readonly plugins = observableValue<readonly never[]>('emptyPlugins', []);
	}());
	return instantiationService;
}

suite('AICustomizationShortcutsWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('overview button opens the welcome page without collapsing the section', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const { container, editorService, storageService } = createWidget(testDisposables);
		const toolbar = container.querySelector<HTMLElement>('.ai-customization-toolbar');
		const overviewButton = container.querySelector<HTMLElement>('.ai-customization-overview-button');

		assert.ok(toolbar);
		assert.ok(overviewButton);
		assert.strictEqual(toolbar.classList.contains('collapsed'), false);
		assert.strictEqual(storageService.getBoolean('agentSessions.customizationsCollapsed', StorageScope.PROFILE, false), false);

		overviewButton.click();
		await new Promise(resolve => setTimeout(resolve, 0));
		if (editorService.lastInput instanceof EditorInput) {
			testDisposables.add(editorService.lastInput);
		}

		assert.deepStrictEqual({
			openEditorCallCount: editorService.openEditorCallCount,
			openedInputIsManagementEditor: editorService.lastInput instanceof AICustomizationManagementEditorInput,
			showWelcomePageCallCount: editorService.editor.showWelcomePageCallCount,
			collapsed: toolbar.classList.contains('collapsed'),
			storedCollapsed: storageService.getBoolean('agentSessions.customizationsCollapsed', StorageScope.PROFILE, false),
			ariaLabel: overviewButton.getAttribute('aria-label'),
		}, {
			openEditorCallCount: 1,
			openedInputIsManagementEditor: true,
			showWelcomePageCallCount: 1,
			collapsed: false,
			storedCollapsed: false,
			ariaLabel: 'Open Customizations Overview',
		});
	});

	test('overview button remains available when the section is collapsed', () => {
		const testDisposables = disposables.add(new DisposableStore());
		const storageService = testDisposables.add(new InMemoryStorageService());
		storageService.store('agentSessions.customizationsCollapsed', true, StorageScope.PROFILE, StorageTarget.USER);
		const { container } = createWidget(testDisposables, storageService);

		assert.deepStrictEqual({
			collapsed: container.querySelector<HTMLElement>('.ai-customization-toolbar')?.classList.contains('collapsed'),
			overviewButtonVisible: !!container.querySelector<HTMLElement>('.ai-customization-overview-button'),
		}, {
			collapsed: true,
			overviewButtonVisible: true,
		});
	});
});
