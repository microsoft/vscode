/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/searchEditorEmptyState.css';
import { $ } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { localize } from '../../../../nls.js';
import { SearchEditorScheme } from '../../../../workbench/contrib/searchEditor/browser/constants.js';
import { renderSessionsEmptyState } from '../../../browser/parts/sessionsEmptyState.js';

export class SearchEditorEmptyStateContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'sessions.searchEditor.emptyState';

	constructor(editor: ICodeEditor) {
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
			renderSessionsEmptyState(
				container,
				localize('searchEditor.emptyTitle', "Search"),
				localize('searchEditor.emptyDescription', "Search for text in your files"),
			);
			reader.store.add(editorObservable.createOverlayWidget({
				domNode: container,
				position: constObservable(null),
				minContentWidthInPx: constObservable(0),
				allowEditorOverflow: false,
			}));
			reader.store.add(autorun(reader => {
				const { width, height } = editorObservable.layoutInfo.read(reader);
				container.style.width = `${width}px`;
				container.style.height = `${height}px`;
			}));
		}));
	}
}

registerEditorContribution(SearchEditorEmptyStateContribution.ID, SearchEditorEmptyStateContribution, EditorContributionInstantiation.AfterFirstRender);
