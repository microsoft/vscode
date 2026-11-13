/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ISelection } from '../../../../../editor/common/core/selection.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { IGotoSymbolQuickAccessProviderOptions } from '../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { IQuickAccessTextEditorContext } from '../../../../../editor/contrib/quickAccess/browser/editorNavigationQuickAccess.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeyMods } from '../../../../../platform/quickinput/common/quickInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { GotoSymbolQuickAccessProvider } from '../../browser/quickaccess/gotoSymbolQuickAccess.js';

class TestGotoSymbolQuickAccessProvider extends GotoSymbolQuickAccessProvider {

	get openSideBySideDirection(): IGotoSymbolQuickAccessProviderOptions['openSideBySideDirection'] {
		return this.options.openSideBySideDirection;
	}

	gotoSymbol(context: IQuickAccessTextEditorContext, options: { range: IRange; keyMods: IKeyMods; forceSideBySide?: boolean }): void {
		this.gotoLocation(context, options);
	}
}

suite('GotoSymbolQuickAccessProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider(supportsSplitting: boolean) {
		const openedEditorGroups: Array<PreferredGroup | undefined> = [];
		const selections: Array<IRange | ISelection> = [];

		const activeEditor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditorInput';
			override readonly resource = undefined;
		};
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = Event.None;
			override readonly activeEditor = activeEditor;
			override async openEditor(_editor: unknown, _options?: unknown, group?: PreferredGroup) {
				openedEditorGroups.push(group);
				return undefined;
			}
		};
		const editorGroupService = new class extends mock<IEditorGroupsService>() {
			override readonly supportsSplitting = supportsSplitting;
		};
		const configurationService = new TestConfigurationService({ workbench: { editor: { openSideBySideDirection: 'right' } } });

		const provider = new TestGotoSymbolQuickAccessProvider(
			editorService,
			configurationService,
			new class extends mock<ILanguageFeaturesService>() { },
			new class extends mock<IOutlineService>() { },
			new class extends mock<IOutlineModelService>() { },
			new class extends mock<IChatWidgetService>() { },
			editorGroupService,
		);

		const editor = new class extends mock<ICodeEditor>() {
			override setSelection(selection: IRange | ISelection) { selections.push(selection); }
			override revealRangeInCenter() { }
			override focus() { }
			override getModel() { return null; }
		};

		return { provider, editor, openedEditorGroups, selections };
	}

	test('offers and opens to the side when the editor part supports splitting', () => {
		const { provider, editor, openedEditorGroups, selections } = createProvider(true);
		const range = new Range(2, 1, 2, 5);

		provider.gotoSymbol({ editor }, { range, keyMods: { ctrlCmd: false, alt: false, shift: false }, forceSideBySide: true });

		assert.deepStrictEqual({
			openSideBySideDirection: provider.openSideBySideDirection?.(),
			openedEditorGroups,
			selections
		}, {
			openSideBySideDirection: 'right',
			openedEditorGroups: [SIDE_GROUP],
			selections: []
		});
	});

	test('does not offer or open to the side when the editor part does not support splitting', () => {
		const { provider, editor, openedEditorGroups, selections } = createProvider(false);
		const range = new Range(2, 1, 2, 5);

		provider.gotoSymbol({ editor }, { range, keyMods: { ctrlCmd: false, alt: true, shift: false }, forceSideBySide: true });

		assert.deepStrictEqual({
			openSideBySideDirection: provider.openSideBySideDirection?.(),
			openedEditorGroups,
			selections
		}, {
			openSideBySideDirection: undefined,
			openedEditorGroups: [],
			selections: [range]
		});
	});
});
