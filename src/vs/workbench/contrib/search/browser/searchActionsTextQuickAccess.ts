/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import { RenderableMatch } from 'vs/workbench/contrib/search/browser/searchModel';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { category } from 'vs/workbench/contrib/search/browser/searchActionsBase';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX } from 'vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess';

registerAction2(class TextSearchQuickAccessAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.QuickTextSearchActionId,
			title: {
				value: nls.localize('quickTextSearch', "Quick Text Search (Experimental)"),
				original: 'Quick Text Search (Experimental)'
			},
			category,
			menu: [{
				id: MenuId.SearchContext,
				group: 'search_2',
				order: 1
			}],
			f1: true
		});

	}

	override async run(accessor: ServicesAccessor, match: RenderableMatch | undefined): Promise<any> {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.quickAccess.show(TEXT_SEARCH_QUICK_ACCESS_PREFIX);
	}
});
