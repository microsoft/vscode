/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions, IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorPane, IResourceDiffEditorInput, ITextDiffEditorPane, IUntitledTextResourceEditorInput, IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { IEditorService, PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { TestEditorService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AICustomizationManagementEditor } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection, AICustomizationSources } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CUSTOMIZATION_ITEMS, CustomizationsToolbarContribution } from '../../browser/customizationsToolbar.contribution.js';

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

class TestCustomizationEditorService extends TestEditorService {

	constructor(private readonly editor: IEditorPane) {
		super();
	}

	override openEditor(editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: IResourceEditorInput | IUntitledTextResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	override openEditor(editor: IResourceDiffEditorInput, group?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
	override openEditor(_editor: EditorInput | IUntypedEditorInput, _optionsOrGroup?: IEditorOptions | PreferredGroup, _group?: PreferredGroup): Promise<IEditorPane | undefined> {
		if (_editor instanceof EditorInput) {
			this._register(_editor);
		}
		return Promise.resolve(this.editor);
	}
}

suite('Sessions Customizations Toolbar Contribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('customization category actions deep-link to the clicked section', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const sessionResource = URI.parse('test-session:///session');
		const selectedSections: AICustomizationManagementSection[] = [];
		const activeSessionResources: URI[] = [];
		const editor = Object.setPrototypeOf({
			selectSectionById: (section: AICustomizationManagementSection) => selectedSections.push(section),
		}, AICustomizationManagementEditor.prototype) as AICustomizationManagementEditor;

		const descriptor: IHarnessDescriptor = {
			id: 'test-session',
			label: 'Test Session',
			icon: ThemeIcon.fromId('testing-view-icon'),
			getStorageSourceFilter: (_type: PromptsType) => ({ sources: AICustomizationSources.all }),
		};

		instantiationService.set(IActionViewItemService, new TestActionViewItemService());
		instantiationService.set(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue('activeHarness', descriptor.id);
			override readonly availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', [descriptor]);

			override getActiveDescriptor(): IHarnessDescriptor {
				return descriptor;
			}

			override setActiveSession(resource: URI): void {
				activeSessionResources.push(resource);
			}
		});
		instantiationService.set(IContextKeyService, new MockContextKeyService());
		instantiationService.set(IEditorService, store.add(new TestCustomizationEditorService(editor)));
		instantiationService.set(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', new class extends mock<IActiveSession>() {
				override readonly resource = sessionResource;
			});
		});

		store.add(instantiationService.createInstance(CustomizationsToolbarContribution));

		const pluginsAction = CUSTOMIZATION_ITEMS.find(item => item.section === AICustomizationManagementSection.Plugins);
		assert.ok(pluginsAction);
		const handler = CommandsRegistry.getCommand(pluginsAction.id)?.handler;
		assert.ok(handler);

		await handler(instantiationService);

		assert.deepStrictEqual({
			selectedSections,
			activeSessionResources,
		}, {
			selectedSections: [AICustomizationManagementSection.Plugins],
			activeSessionResources: [sessionResource],
		});
	});
});
