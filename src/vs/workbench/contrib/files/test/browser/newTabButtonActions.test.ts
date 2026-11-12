/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NEW_TAB_BUTTON_SETTING } from '../../../../browser/parts/editor/newTabButton.js';
import { IEditorCommandsContext } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorInfo } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INewUntitledTextEditorOptions, IUntitledTextEditorService } from '../../../../services/untitled/common/untitledTextEditorService.js';
import { IUntitledTextEditorModel } from '../../../../services/untitled/common/untitledTextEditorModel.js';
import { NewMarkdownDocumentFromNewTabButtonAction, NewUntitledFileFromNewTabButtonAction } from '../../browser/newTabButtonActions.js';

suite('New tab button entries', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const untitledResource = URI.from({ scheme: 'untitled', path: 'Untitled-1' });

	/** Runs an entry as the new tab button of the second group does. */
	async function run(action: Action2, markdownEditorAvailable = false) {
		const groups = [{ id: 1 }, { id: 2 }] as IEditorGroup[];
		let activeGroup = groups[0];
		const opened: { editor: unknown; group: number | undefined }[] = [];
		const created: INewUntitledTextEditorOptions[] = [];

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IEditorGroupsService, {
			getGroup: (id: number) => groups.find(group => group.id === id),
			get activeGroup() { return activeGroup; },
			activateGroup: (group: IEditorGroup | number) => activeGroup = group as IEditorGroup,
		});
		instantiationService.stub(IEditorService, {
			openEditor: async (editor: unknown, group?: unknown) => {
				opened.push({ editor, group: (group as IEditorGroup | undefined)?.id });
				return undefined;
			}
		});
		instantiationService.stub(IUntitledTextEditorService, {
			create: (options?: INewUntitledTextEditorOptions) => {
				created.push(options ?? {});
				return { resource: untitledResource, resolve: async () => { } } as IUntitledTextEditorModel;
			}
		});
		instantiationService.stub(IEditorResolverService, {
			getEditors: () => (markdownEditorAvailable ? [{ id: 'vscode.markdown.editor' }] : []) as RegisteredEditorInfo[]
		});

		await instantiationService.invokeFunction(accessor => action.run(accessor, { groupId: 2 } satisfies IEditorCommandsContext));

		return { opened, created, activeGroup: activeGroup.id };
	}

	test('are shown only while the setting is on', () => {
		const shown = (on: boolean) => [new NewUntitledFileFromNewTabButtonAction(), new NewMarkdownDocumentFromNewTabButtonAction()]
			.filter(action => (action.desc.menu as { readonly when?: ContextKeyExpression }).when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => (key === `config.${NEW_TAB_BUTTON_SETTING}` ? on : undefined) as T | undefined } satisfies IContext))
			.map(action => action.desc.id);

		assert.deepStrictEqual({ off: shown(false), on: shown(true) }, {
			off: [],
			on: ['workbench.action.files.newUntitledFileFromNewTabButton', 'workbench.action.files.newMarkdownDocumentFromNewTabButton'],
		});
	});

	test('New Untitled Text File opens in the group of the button, with its origin', async () => {
		assert.deepStrictEqual(await run(new NewUntitledFileFromNewTabButtonAction()), {
			opened: [{ editor: { resource: undefined, untitledOrigin: 'newTabButton', options: { pinned: true, override: 'default' } }, group: 2 }],
			created: [],
			activeGroup: 2,
		});
	});

	test('New Markdown Document opens in the Markdown Editor when available, otherwise in the text editor', async () => {
		const expected = (override: string) => ({
			opened: [{ editor: { resource: untitledResource, options: { pinned: true, override } }, group: 2 }],
			created: [{ languageId: 'markdown', origin: 'newTabButton' }],
			activeGroup: 2,
		});

		assert.deepStrictEqual(await run(new NewMarkdownDocumentFromNewTabButtonAction(), true), expected('vscode.markdown.editor'));
		assert.deepStrictEqual(await run(new NewMarkdownDocumentFromNewTabButtonAction(), false), expected('default'));
	});
});
