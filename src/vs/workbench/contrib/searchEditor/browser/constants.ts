/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const OpenInEditorCommandId = 'search.action.openInEditor';
export const OpenNewEditorCommandId = 'search.action.openNewEditor';

export const ToggleSearchEditorCaseSensitiveCommandId = 'toggleSearchEditorCaseSensitive';
export const ToggleSearchEditorWholeWordCommandId = 'toggleSearchEditorWholeWord';
export const ToggleSearchEditorRegexCommandId = 'toggleSearchEditorRegex';
export const ToggleSearchEditorContextLinesCommandId = 'toggleSearchEditorContextLines';

export const EnableSearchEditorPreview = new RawContextKey<boolean>('previewSearchEditor', false);
export const InSearchEditor = new RawContextKey<boolean>('inSearchEditor', false);

export const SearchEditorScheme = 'search-editor';
