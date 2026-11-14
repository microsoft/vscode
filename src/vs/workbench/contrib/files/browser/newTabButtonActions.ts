/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { NewTabButtonEntryAction } from '../../../browser/parts/editor/newTabButton.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';

const MARKDOWN_EDITOR_ID = 'vscode.markdown.editor';

export class NewUntitledFileFromNewTabButtonAction extends NewTabButtonEntryAction {

	constructor() {
		super({
			id: 'workbench.action.files.newUntitledFileFromNewTabButton',
			title: localize2('newTabButton.untitledFile', "New Untitled Text File"),
			icon: Codicon.newFile,
			order: 1,
		});
	}

	protected override openTab(accessor: ServicesAccessor, group: IEditorGroup): Promise<unknown> {
		return accessor.get(IEditorService).openEditor({
			resource: undefined,
			untitledOrigin: 'newTabButton',
			options: { pinned: true, override: DEFAULT_EDITOR_ASSOCIATION.id }
		}, group);
	}
}

export class NewMarkdownDocumentFromNewTabButtonAction extends NewTabButtonEntryAction {

	constructor() {
		super({
			id: 'workbench.action.files.newMarkdownDocumentFromNewTabButton',
			title: localize2('newTabButton.markdown', "New Markdown Document"),
			icon: Codicon.markdown,
			order: 2,
		});
	}

	protected override async openTab(accessor: ServicesAccessor, group: IEditorGroup): Promise<unknown> {
		const editorService = accessor.get(IEditorService);
		const editorResolverService = accessor.get(IEditorResolverService);
		const untitled = accessor.get(IUntitledTextEditorService).create({ languageId: 'markdown', origin: 'newTabButton' });

		// Once resolved, its text model has the Markdown language, so that it matches the editors of `*.md` files.
		await untitled.resolve();
		const markdownEditorAvailable = editorResolverService.getEditors(untitled.resource).some(editor => editor.id === MARKDOWN_EDITOR_ID);

		return editorService.openEditor({
			resource: untitled.resource,
			options: { pinned: true, override: markdownEditorAvailable ? MARKDOWN_EDITOR_ID : DEFAULT_EDITOR_ASSOCIATION.id }
		}, group);
	}
}
