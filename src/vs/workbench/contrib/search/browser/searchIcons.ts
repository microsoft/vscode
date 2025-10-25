/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const searchDetailsIcon = registerIcon('search-details', Codicon.ellipsis, localize('searchDetailsIcon', 'Icon to make search details visible.'));
export const searchActivityBarIcon = registerIcon('search-see-more', Codicon.goToSearch, localize('searchSeeMoreIcon', 'Icon to view more context in the search view.'));

export const searchShowContextIcon = registerIcon('search-show-context', Codicon.listSelection, localize('searchShowContextIcon', 'Icon for toggle the context in the search editor.'));
export const searchHideReplaceIcon = registerIcon('search-hide-replace', Codicon.chevronRight, localize('searchHideReplaceIcon', 'Icon to collapse the replace section in the search view.'));
export const searchShowReplaceIcon = registerIcon('search-show-replace', Codicon.chevronDown, localize('searchShowReplaceIcon', 'Icon to expand the replace section in the search view.'));
export const searchReplaceAllIcon = registerIcon('search-replace-all', Codicon.replaceAll, localize('searchReplaceAllIcon', 'Icon for replace all in the search view.'));
export const searchReplaceIcon = registerIcon('search-replace', Codicon.replace, localize('searchReplaceIcon', 'Icon for replace in the search view.'));
export const searchRemoveIcon = registerIcon('search-remove', Codicon.close, localize('searchRemoveIcon', 'Icon to remove a search result.'));

export const searchRefreshIcon = registerIcon('search-refresh', Codicon.refresh, localize('searchRefreshIcon', 'Icon for refresh in the search view.'));
export const searchCollapseAllIcon = registerIcon('search-collapse-results', Codicon.collapseAll, localize('searchCollapseAllIcon', 'Icon for collapse results in the search view.'));
export const searchExpandAllIcon = registerIcon('search-expand-results', Codicon.expandAll, localize('searchExpandAllIcon', 'Icon for expand results in the search view.'));
export const searchShowAsTree = registerIcon('search-tree', Codicon.listTree, localize('searchShowAsTree', 'Icon for viewing results as a tree in the search view.'));
export const searchShowAsList = registerIcon('search-list', Codicon.listFlat, localize('searchShowAsList', 'Icon for viewing results as a list in the search view.'));
export const searchClearIcon = registerIcon('search-clear-results', Codicon.clearAll, localize('searchClearIcon', 'Icon for clear results in the search view.'));
export const searchStopIcon = registerIcon('search-stop', Codicon.searchStop, localize('searchStopIcon', 'Icon for stop in the search view.'));

export const searchViewIcon = registerIcon('search-view-icon', Codicon.search, localize('searchViewIcon', 'View icon of the search view.'));

export const searchNewEditorIcon = registerIcon('search-new-editor', Codicon.newFile, localize('searchNewEditorIcon', 'Icon for the action to open a new search editor.'));
export const searchOpenInFileIcon = registerIcon('search-open-in-file', Codicon.goToFile, localize('searchOpenInFile', 'Icon for the action to go to the file of the current search result.'));

export const searchSparkleFilled = registerIcon('search-sparkle-filled', Codicon.sparkleFilled, localize('searchSparkleFilled', 'Icon to show AI results in search.'));
export const searchSparkleEmpty = registerIcon('search-sparkle-empty', Codicon.sparkle, localize('searchSparkleEmpty', 'Icon to hide AI results in search.'));
