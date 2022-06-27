/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILabelService } from 'vs/platform/label/common/label';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { AnythingQuickAccessProvider } from 'vs/workbench/contrib/search/browser/anythingQuickAccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IFileQueryBuilderOptions } from 'vs/workbench/services/search/common/queryBuilder';
import { IFileQuery, ISearchService } from 'vs/workbench/services/search/common/search';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

class GoToFileWithoutExclusionsAction extends Action2 {

	static readonly ID = 'workbench.action.quickOpenWithoutExclusions';

	constructor() {
		super({
			id: GoToFileWithoutExclusionsAction.ID,
			title: {
				value: localize('gotoFileWithoutExclusions', "Go to File (Without ignore files and search excludes)..."),
				original: 'Go to File (Without ignore files and search excludes)...'
			},
			f1: true,
			keybinding: {
				when: undefined,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP
			},
			menu: [{
				id: MenuId.MenubarGoMenu,
				group: '4_symbol_nav',
				order: 1
			}]
		});
	}

	run(accessor: ServicesAccessor) {
		accessor.get(IQuickInputService).quickAccess.show(AnythingQuickAccessWithoutExclusionsProvider.PREFIX);
	}
}

registerAction2(GoToFileWithoutExclusionsAction);

export class AnythingQuickAccessWithoutExclusionsProvider extends AnythingQuickAccessProvider {
	static override PREFIX = '!';

	protected override createFileQuery(options: IFileQueryBuilderOptions): IFileQuery {
		const query = this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, options);
		query.folderQueries.forEach(f => {
			if (f.excludePattern) {
				f.excludePattern = undefined;
			}
		});
		return query;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISearchService searchService: ISearchService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IPathService pathService: IPathService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IHistoryService historyService: IHistoryService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ITextModelService textModelService: ITextModelService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(
			instantiationService,
			searchService,
			contextService,
			pathService,
			environmentService,
			fileService,
			labelService,
			modelService,
			languageService,
			workingCopyService,
			configurationService,
			editorService,
			historyService,
			filesConfigurationService,
			textModelService,
			uriIdentityService,
			AnythingQuickAccessWithoutExclusionsProvider.PREFIX);
	}
}
