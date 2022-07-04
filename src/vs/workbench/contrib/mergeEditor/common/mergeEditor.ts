/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export type MergeEditorLayoutTypes = 'mixed' | 'columns';

export const ctxIsMergeEditor = new RawContextKey<boolean>('isMergeEditor', false);
export const ctxMergeEditorLayout = new RawContextKey<MergeEditorLayoutTypes>('mergeEditorLayout', 'mixed');
export const ctxBaseResourceScheme = new RawContextKey<string>('baseResourceScheme', '');
