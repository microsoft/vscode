/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export type MergeEditorLayoutKind = 'mixed' | 'columns';

export const ctxIsMergeEditor = new RawContextKey<boolean>('isMergeEditor', false, { type: 'boolean', description: localize('is', 'The editor is a merge editor') });
export const ctxIsMergeResultEditor = new RawContextKey<boolean>('isMergeResultEditor', false, { type: 'boolean', description: localize('isr', 'The editor is a the result editor of a merge editor.') });
export const ctxMergeEditorLayout = new RawContextKey<MergeEditorLayoutKind>('mergeEditorLayout', 'mixed', { type: 'string', description: localize('editorLayout', 'The layout mode of a merge editor') });
export const ctxMergeEditorShowBase = new RawContextKey<boolean>('mergeEditorShowBase', false, { type: 'boolean', description: localize('showBase', 'If the merge editor shows the base version') });
export const ctxMergeEditorShowBaseAtTop = new RawContextKey<boolean>('mergeEditorShowBaseAtTop', false, { type: 'boolean', description: localize('showBaseAtTop', 'If base should be shown at the top') });
export const ctxMergeEditorShowNonConflictingChanges = new RawContextKey<boolean>('mergeEditorShowNonConflictingChanges', false, { type: 'boolean', description: localize('showNonConflictingChanges', 'If the merge editor shows non-conflicting changes') });

export const ctxMergeBaseUri = new RawContextKey<string>('mergeEditorBaseUri', '', { type: 'string', description: localize('baseUri', 'The uri of the baser of a merge editor') });
export const ctxMergeResultUri = new RawContextKey<string>('mergeEditorResultUri', '', { type: 'string', description: localize('resultUri', 'The uri of the result of a merge editor') });

export interface MergeEditorContents {
	languageId: string;
	base: string;
	input1: string;
	input2: string;
	result: string;
	initialResult?: string;
}

export const StorageCloseWithConflicts = 'mergeEditorCloseWithConflicts';
