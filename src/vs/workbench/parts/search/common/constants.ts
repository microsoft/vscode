/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const VIEWLET_ID = 'workbench.view.search';

export const FindInFilesActionId = 'workbench.action.findInFiles';
export const FocusActiveEditorActionId = 'search.action.focusActiveEditor';

export const ToggleCaseSensitiveActionId = 'toggleSearchCaseSensitive';
export const ToggleWholeWordActionId = 'toggleSearchWholeWord';
export const ToggleRegexActionId = 'toggleSearchRegex';
export const CloseReplaceWidgetActionId = 'closeReplaceInFilesWidget';


export const SearchViewletVisibleKey = new RawContextKey<boolean>('searchViewletVisible', true);
export const InputBoxFocussedKey = new RawContextKey<boolean>('inputBoxFocus', false);
export const SearchInputBoxFocussedKey = new RawContextKey<boolean>('searchInputBoxFocus', false);
export const ReplaceInputBoxFocussedKey = new RawContextKey<boolean>('replaceInputBoxFocus', false);
export const ReplaceActiveKey = new RawContextKey<boolean>('replaceActive', false);