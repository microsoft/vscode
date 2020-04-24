/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const OpenInEditorCommandId = 'search.action.openInEditor';
export const OpenNewEditorCommandId = 'search.action.openNewEditor';
export const OpenNewEditorToSideCommandId = 'search.action.openNewEditorToSide';
export const FocusQueryEditorWidgetCommandId = 'search.action.focusQueryEditorWidget';

export const ToggleSearchEditorCaseSensitiveCommandId = 'toggleSearchEditorCaseSensitive';
export const ToggleSearchEditorWholeWordCommandId = 'toggleSearchEditorWholeWord';
export const ToggleSearchEditorRegexCommandId = 'toggleSearchEditorRegex';
export const ToggleSearchEditorContextLinesCommandId = 'toggleSearchEditorContextLines';
export const IncreaseSearchEditorContextLinesCommandId = 'increaseSearchEditorContextLines';
export const DecreaseSearchEditorContextLinesCommandId = 'decreaseSearchEditorContextLines';

export const RerunSearchEditorSearchCommandId = 'rerunSearchEditorSearch';
export const CleanSearchEditorStateCommandId = 'cleanSearchEditorState';
export const SelectAllSearchEditorMatchesCommandId = 'selectAllSearchEditorMatches';

export const InSearchEditor = new RawContextKey<boolean>('inSearchEditor', false);

export const SearchEditorScheme = 'search-editor';
export const SearchEditorBodyScheme = 'search-editor-body';

export const SearchEditorFindMatchClass = 'seaarchEditorFindMatch';

export const SearchEditorID = 'workbench.editor.searchEditor';
