/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const VIEWLET_ID = 'workbench.view.search';

export const FindInFilesActionId = 'workbench.action.findInFiles';
export const FocusActiveEditorActionId = 'search.action.focusActiveEditor';

export const FocusSearchFromResults = 'search.action.focusSearchFromResults';
export const OpenMatchToSide = 'search.action.openResultToSide';
export const CancelActionId = 'search.action.cancel';
export const RemoveActionId = 'search.action.remove';
export const ReplaceActionId = 'search.action.replace';
export const ReplaceAllInFileActionId = 'search.action.replaceAllInFile';
export const ToggleCaseSensitiveActionId = 'toggleSearchCaseSensitive';
export const ToggleWholeWordActionId = 'toggleSearchWholeWord';
export const ToggleRegexActionId = 'toggleSearchRegex';
export const CloseReplaceWidgetActionId = 'closeReplaceInFilesWidget';

export const SearchViewletVisibleKey = new RawContextKey<boolean>('searchViewletVisible', true);
export const InputBoxFocusedKey = new RawContextKey<boolean>('inputBoxFocus', false);
export const SearchInputBoxFocusedKey = new RawContextKey<boolean>('searchInputBoxFocus', false);
export const ReplaceInputBoxFocusedKey = new RawContextKey<boolean>('replaceInputBoxFocus', false);
export const PatternIncludesFocusedKey = new RawContextKey<boolean>('patternIncludesInputBoxFocus', false);
export const PatternExcludesFocusedKey = new RawContextKey<boolean>('patternExcludesInputBoxFocus', false);
export const ReplaceActiveKey = new RawContextKey<boolean>('replaceActive', false);

export const FirstMatchFocusKey = new RawContextKey<boolean>('firstMatchFocus', false);
export const FileMatchOrMatchFocusKey = new RawContextKey<boolean>('fileMatchOrMatchFocus', false);
export const FileFocusKey = new RawContextKey<boolean>('fileMatchFocus', false);
export const MatchFocusKey = new RawContextKey<boolean>('matchFocus', false);