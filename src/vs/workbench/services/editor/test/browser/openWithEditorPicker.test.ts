/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { DEFAULT_EDITOR_ASSOCIATION, IUntypedEditorInput } from '../../../../common/editor.js';
import { createEditorPart, ITestInstantiationService, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { EditorResolverService } from '../../browser/editorResolverService.js';
import { CONFIGURE_DEFAULT_EDITOR_COMMAND_ID, OpenWithEditorPicker } from '../../browser/openWithEditorPicker.js';
import { IEditorGroupsService } from '../../common/editorGroupsService.js';
import { diffEditorsAssociationsSettingId, EditorInputFactoryObject, editorsAssociationsSettingId, IEditorResolverService, RegisteredEditorPriority } from '../../common/editorResolverService.js';

/**
 * A quick pick that hands itself to the test when shown so that the test can accept or hide it.
 */
class TestQuickPick extends mock<IQuickPick<IQuickPickItem, { useSeparators: true }>>() {

	private readonly _onDidAccept = new Emitter<IQuickPickDidAcceptEvent>();
	override readonly onDidAccept = this._onDidAccept.event;

	private readonly _onDidHide = new Emitter<IQuickInputHideEvent>();
	override readonly onDidHide = this._onDidHide.event;

	override readonly onDidTriggerItemButton: Event<IQuickPickItemButtonEvent<IQuickPickItem>> = Event.None;

	override placeholder: string | undefined;
	override canAcceptInBackground = false;
	override items: ReadonlyArray<IQuickPickItem | IQuickPickSeparator> = [];
	override selectedItems: ReadonlyArray<IQuickPickItem> = [];

	private disposed = false;

	constructor(private readonly onShow: (quickPick: TestQuickPick) => void) {
		super();
	}

	override show(): void {
		this.onShow(this);
	}

	acceptItem(id: string, inBackground = false): void {
		this.selectedItems = this.items.filter((item): item is IQuickPickItem => item.type !== 'separator' && item.id === id);
		this._onDidAccept.fire({ inBackground });
	}

	override hide(): void {
		this._onDidHide.fire({ reason: QuickInputHideReason.Gesture });
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.hide();
			this._onDidAccept.dispose();
			this._onDidHide.dispose();
		}
	}
}

suite('OpenWithEditorPicker', () => {

	const COMPONENT_EDITOR_ID = 'test.componentEditor';
	const resource = URI.file('/workspace/example.component.html');

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	interface IShownPicker {
		readonly placeholder: string | undefined;
		readonly items: readonly string[];
	}

	/**
	 * Sets up an editor resolver with the text editor and a component editor, and a quick input
	 * service whose quick picks are answered by `respond` in the order in which they are shown.
	 */
	async function setup(configuration: Record<string, unknown>, ...respond: ((quickPick: TestQuickPick) => void)[]): Promise<{ instantiationService: ITestInstantiationService; part: EditorPart; configurationService: TestConfigurationService; shown: IShownPicker[] }> {
		const configurationService = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				await this.setUserConfiguration(key, value);
			}
		}(configuration);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorResolverService = disposables.add(instantiationService.createInstance(EditorResolverService));
		instantiationService.stub(IEditorResolverService, editorResolverService);
		const factory = (editorId: string): EditorInputFactoryObject => ({
			createEditorInput: ({ resource }) => ({ editor: disposables.add(new TestFileEditorInput(resource, editorId)) }),
			createDiffEditorInput: ({ modified }) => ({ editor: disposables.add(new TestFileEditorInput(modified.resource!, editorId)) })
		});
		disposables.add(editorResolverService.registerEditor('*', {
			id: DEFAULT_EDITOR_ASSOCIATION.id,
			label: DEFAULT_EDITOR_ASSOCIATION.displayName,
			priority: RegisteredEditorPriority.builtin
		}, {}, factory(DEFAULT_EDITOR_ASSOCIATION.id)));
		disposables.add(editorResolverService.registerEditor('*.component.html', {
			id: COMPONENT_EDITOR_ID,
			label: 'Component Editor',
			priority: RegisteredEditorPriority.default
		}, {}, factory(COMPONENT_EDITOR_ID)));

		const shown: IShownPicker[] = [];
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			createQuickPick: (() => new TestQuickPick(quickPick => {
				shown.push({
					placeholder: quickPick.placeholder,
					items: quickPick.items.map(item => item.type === 'separator' ? '---' : `${item.id}: ${item.description ?? ''}`)
				});
				const response = respond.shift();
				if (!response) {
					throw new Error('Unexpected quick pick.');
				}
				response(quickPick);
			})) as IQuickInputService['createQuickPick']
		}));

		return { instantiationService, part, configurationService, shown };
	}

	function pick(instantiationService: ITestInstantiationService, editor: IUntypedEditorInput) {
		return instantiationService.createInstance(OpenWithEditorPicker).pick(editor);
	}

	function getAssociations(configurationService: TestConfigurationService, settingId: string): Record<string, string> {
		return { ...configurationService.getValue<Record<string, string>>(settingId) };
	}

	test('returns the options to open the picked editor with', async () => {
		const { instantiationService, shown } = await setup({}, quickPick => quickPick.acceptItem(COMPONENT_EDITOR_ID, true));

		const options = await pick(instantiationService, { resource, options: { pinned: true } });

		assert.deepStrictEqual({ shown, options }, {
			shown: [{
				placeholder: `Select editor for 'example.component.html'`,
				items: [
					`${DEFAULT_EDITOR_ASSOCIATION.id}: `,
					`${COMPONENT_EDITOR_ID}: Default`,
					'---',
					`promptOpenWith.configureDefault: `
				]
			}],
			options: { pinned: true, override: COMPONENT_EDITOR_ID, preserveFocus: true }
		});
	});

	test('returns undefined when the picker is cancelled', async () => {
		const { instantiationService } = await setup({}, quickPick => quickPick.hide());

		assert.strictEqual(await pick(instantiationService, { resource }), undefined);
	});

	test('does not show a picker for side by side editors', async () => {
		const { instantiationService, shown } = await setup({});

		const options = await pick(instantiationService, { primary: { resource }, secondary: { resource }, options: { pinned: true } });

		assert.deepStrictEqual({ shown, options }, { shown: [], options: { pinned: true } });
	});

	test('configuring the general default from a diff persists it and clears the diff-only default', async () => {
		const { instantiationService, configurationService, shown } = await setup(
			{ [diffEditorsAssociationsSettingId]: { '*.component.html': COMPONENT_EDITOR_ID } },
			quickPick => quickPick.acceptItem('promptOpenWith.configureDefault'),
			quickPick => quickPick.acceptItem(DEFAULT_EDITOR_ASSOCIATION.id)
		);

		const options = await pick(instantiationService, { original: { resource }, modified: { resource } });

		assert.deepStrictEqual({
			placeholders: shown.map(picker => picker.placeholder),
			options,
			editorAssociations: getAssociations(configurationService, editorsAssociationsSettingId),
			diffEditorAssociations: getAssociations(configurationService, diffEditorsAssociationsSettingId)
		}, {
			placeholders: [
				`Select editor for 'example.component.html'`,
				`Select new default editor for '*.component.html'`
			],
			options: { override: DEFAULT_EDITOR_ASSOCIATION.id, preserveFocus: undefined },
			editorAssociations: { '*.component.html': DEFAULT_EDITOR_ASSOCIATION.id },
			diffEditorAssociations: {}
		});
	});

	test('configure default editor command replaces the editor with the picked default', async () => {
		const { instantiationService, part, configurationService } = await setup({}, quickPick => quickPick.acceptItem(DEFAULT_EDITOR_ASSOCIATION.id));
		const currentEditor = disposables.add(new TestFileEditorInput(resource, COMPONENT_EDITOR_ID));
		await part.activeGroup.openEditor(currentEditor, { pinned: true });

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(CONFIGURE_DEFAULT_EDITOR_COMMAND_ID)!.handler(accessor, { resource }, currentEditor, part.activeGroup.id));

		assert.deepStrictEqual({
			editors: part.activeGroup.editors.map(editor => editor.editorId),
			editorAssociations: getAssociations(configurationService, editorsAssociationsSettingId)
		}, {
			editors: [DEFAULT_EDITOR_ASSOCIATION.id],
			editorAssociations: { '*.component.html': DEFAULT_EDITOR_ASSOCIATION.id }
		});
	});
});
