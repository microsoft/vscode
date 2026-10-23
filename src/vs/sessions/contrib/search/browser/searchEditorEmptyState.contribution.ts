/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/searchEditorEmptyState.css';
import { $, append, isHTMLElement } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InSearchEditor, SearchEditorScheme } from '../../../../workbench/contrib/searchEditor/browser/constants.js';
import { SearchEditor } from '../../../../workbench/contrib/searchEditor/browser/searchEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { searchViewIcon } from '../../../../workbench/contrib/search/browser/searchIcons.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsEmptyStateActions } from '../../../browser/parts/sessionsEmptyStateActions.js';
import { SessionsEmptyStateLayout } from '../../../browser/parts/sessionsEmptyStateLayout.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../common/sessionCommands.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';

export const RUN_EMPTY_SEARCH_COMMAND_ID = 'sessions.searchEditor.runSearch';

export class SearchEditorEmptyStateContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'sessions.searchEditor.emptyState';

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const editorObservable = observableCodeEditor(editor);
		this._register(autorun(reader => {
			const model = editorObservable.model.read(reader);
			if (model?.uri.scheme !== SearchEditorScheme) {
				return;
			}
			editorObservable.versionId.read(reader);
			if (model.getValueLength() !== 0) {
				return;
			}

			const container = $('.sessions-search-empty-state');
			const content = append(container, $('.sessions-empty-state-content'));
			reader.store.add(instantiationService.createInstance(SessionsEmptyStateActions, content, Menus.EmptySearchEditorActions, {
				ariaLabel: localize('searchEditor.emptyActions', "Search actions"),
				telemetrySource: 'searchEditor.emptyState',
				menuOptions: { arg: editor },
			}));
			reader.store.add(editorObservable.createOverlayWidget({
				domNode: container,
				position: constObservable(null),
				minContentWidthInPx: constObservable(0),
				allowEditorOverflow: false,
			}));
			const results = editor.getContainerDomNode();
			const pane = results.parentElement;
			const query = results.previousElementSibling;
			const layout = pane?.classList.contains('search-editor') && isHTMLElement(query)
				? reader.store.add(new SessionsEmptyStateLayout(pane, [query, results], content))
				: undefined;
			reader.store.add(autorun(reader => {
				const { width, height } = editorObservable.layoutInfo.read(reader);
				container.style.width = `${width}px`;
				container.style.height = `${height}px`;
				layout?.layout();
			}));
		}));
	}
}

registerEditorContribution(SearchEditorEmptyStateContribution.ID, SearchEditorEmptyStateContribution, EditorContributionInstantiation.AfterFirstRender);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUN_EMPTY_SEARCH_COMMAND_ID,
			title: localize2('searchEditor.runSearch', "Run Search"),
			icon: searchViewIcon,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				when: InSearchEditor,
				weight: KeybindingWeight.SessionsContrib,
			},
			menu: { id: Menus.EmptySearchEditorActions, group: 'navigation', order: 1 },
		});
	}

	async run(accessor: ServicesAccessor, control?: ICodeEditor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const pane = control
			? editorService.visibleEditorPanes.find(pane => pane instanceof SearchEditor && pane.getControl() === control)
			: editorService.activeEditorPane;
		if (pane instanceof SearchEditor) {
			await pane.triggerSearch({ resetCursor: false });
		}
	}
});

MenuRegistry.appendMenuItem(Menus.EmptySearchEditorActions, {
	command: { id: NEW_FILE_TAB_COMMAND_ID, title: localize2('searchEditor.openFiles', "Open Files"), icon: EmptyFileEditorInput.ICON },
	group: 'navigation',
	order: 2,
});
