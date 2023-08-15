/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMatch } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IPickerQuickAccessItem, PickerQuickAccessProvider } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { searchRemoveIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { Match, MatchInNotebook, SearchModel, SearchResult } from 'vs/workbench/contrib/search/browser/searchModel';
import { getEditorSelectionFromMatch } from 'vs/workbench/contrib/search/browser/searchView';
import { ACTIVE_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { IPatternInfo, ITextQuery } from 'vs/workbench/services/search/common/search';

export const TEXT_RESULT_QUICK_ACCESS_PREFIX = '%';
export class TextResultQuickAccess extends PickerQuickAccessProvider<IPickerQuickAccessItem> {
	private queryBuilder: QueryBuilder;
	private searchModel: SearchModel;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILabelService private readonly _labelService: ILabelService
	) {
		super(TEXT_RESULT_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });

		this.queryBuilder = this._instantiationService.createInstance(QueryBuilder);
		this.searchModel = this._instantiationService.createInstance(SearchModel);
	}


	private async doSearch(contentPattern: string): Promise<SearchResult | undefined> {

		if (contentPattern === '') {
			return undefined;
		}

		const folderResources: IWorkspaceFolder[] = this._contextService.getWorkspace().folders;
		const content: IPatternInfo = {
			pattern: contentPattern,
		};

		const query: ITextQuery = this.queryBuilder.text(content, folderResources.map(folder => folder.uri));

		await this.searchModel.search(query, undefined);
		return this.searchModel.searchResult;
	}

	protected async _getPicks(contentPattern: string, disposables: DisposableStore, token: CancellationToken): Promise<(IQuickPickSeparator | IPickerQuickAccessItem)[]> {

		const searchResult = await this.doSearch(contentPattern);

		if (!searchResult) {
			return [];
		}

		const picks: (IQuickPickSeparator | IPickerQuickAccessItem)[] = [];

		let files = searchResult.matches();
		files = files.length > 30 ? files.splice(0, 30) : files;

		for (let i = 0; i < files.length; i++) {
			const fileMatch = files[i];

			const label = basenameOrAuthority(fileMatch.resource);
			const description = this._labelService.getUriLabel(dirname(fileMatch.resource), { relative: true });


			picks.push({
				label,
				type: 'separator',
				ariaLabel: label,
				tooltip: description,
				buttons: [{
					iconClass: ThemeIcon.asClassName(searchRemoveIcon),
					tooltip: localize('QuickSearchClose', "Close")
				}],
			});

			const results: Match[] = fileMatch.matches() ?? [];
			results.forEach(element => {
				const options = {
					selection: getEditorSelectionFromMatch(element, this.searchModel),
					revealIfVisible: true,
					indexedCellOptions: element instanceof MatchInNotebook ? { cellIndex: element.cellIndex, selection: element.range } : undefined,
				};
				const preview = element.preview();
				const previewText = (preview.before + preview.inside + preview.after).trim().substring(0, 999);
				const match: IMatch[] = [{
					start: preview.before.length,
					end: preview.before.length + preview.inside.length
				}];
				picks.push({
					label: `${previewText}`,
					highlights: {
						label: match
					},
					description: `${element.range().startLineNumber}:${element.range().startColumn}`,
					ariaLabel: `Match at location ${element.range().startLineNumber}:${element.range().startColumn} - ${previewText}`,
					accept: async () => {
						await this._editorService.openEditor({
							resource: fileMatch.resource,
							options
						}, ACTIVE_GROUP);
					}
				});
			});
		}

		return picks;

	}
}
