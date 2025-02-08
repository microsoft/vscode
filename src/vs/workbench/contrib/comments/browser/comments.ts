/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IView } from '../../../common/views.js';
import { CommentsFilters } from './commentsViewActions.js';

export const CommentsViewFilterFocusContextKey = new RawContextKey<boolean>('commentsFilterFocus', false);

export interface ICommentsView extends IView {

	readonly filters: CommentsFilters;
	focusFilter(): void;
	clearFilterText(): void;
	getFilterStats(): { total: number; filtered: number };

	collapseAll(): void;
}
