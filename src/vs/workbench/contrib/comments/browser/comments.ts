/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IView } from 'vs/workbench/common/views';
import { CommentsFilters } from 'vs/workbench/contrib/comments/browser/commentsViewActions';

export const CommentsViewFilterFocusContextKey = new RawContextKey<boolean>('commentsFilterFocus', false);

export interface ICommentsView extends IView {

	readonly filters: CommentsFilters;
	focusFilter(): void;
	clearFilterText(): void;
	getFilterStats(): { total: number; filtered: number };

	collapseAll(): void;
}
