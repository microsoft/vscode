/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const OpenMatchToSide = 'referenceSearch.action.openResultToSide';
export const CancelActionId = 'referenceSearch.action.cancel';
export const RemoveActionId = 'referenceSearch.action.remove';
export const CopyPathCommandId = 'referenceSearch.action.copyPath';
export const CopyMatchCommandId = 'referenceSearch.action.copyMatch';
export const CopyAllCommandId = 'referenceSearch.action.copyAll';
export const FocusReferenceSearchListCommandID = 'referenceSearch.action.focusReferenceSearchList';

export const ToggleReferenceSearchViewPositionCommandId = 'referenceSearch.action.toggleReferenceSearchViewPosition';

export const ReferenceSearchViewVisibleKey = new RawContextKey<boolean>('referenceSearchViewletVisible', true);
export const HasReferenceSearchResults = new RawContextKey<boolean>('hasReferenceSearchResult', false);

export const FirstMatchFocusKey = new RawContextKey<boolean>('firstMatchFocus', false);
export const FileMatchOrMatchFocusKey = new RawContextKey<boolean>('fileMatchOrMatchFocus', false); // This is actually, Match or File or Folder
export const FileMatchOrFolderMatchFocusKey = new RawContextKey<boolean>('fileMatchOrFolderMatchFocus', false);
export const FileFocusKey = new RawContextKey<boolean>('fileMatchFocus', false);
export const FolderFocusKey = new RawContextKey<boolean>('folderMatchFocus', false);
export const MatchFocusKey = new RawContextKey<boolean>('matchFocus', false);
