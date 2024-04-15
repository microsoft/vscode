/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import 'vs/workbench/contrib/notebook/browser/controller/chat/cellChatActions';

class NotebookCellChatbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookCellChatbenchContribution';

	constructor(
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(this._languageService.registerLanguage({
			id: 'prompt-cell',
			extensions: ['.prompt-cell'],
			aliases: ['Prompt'],
			mimetypes: ['text/prompt-cell']
		}));
	}
}

registerWorkbenchContribution2(
	NotebookCellChatbenchContribution.ID,
	NotebookCellChatbenchContribution,
	WorkbenchPhase.AfterRestored
);
