/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeFilter, TreeFilterResult } from '../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { isRequestVM, isResponseVM } from '../common/chatViewModel.js';
import { ChatTreeItem } from './chat.js';

export interface IChatWidgetFilterDelegate {
	getPrevElement(element: ChatTreeItem): ChatTreeItem | null;
}

export class ChatWidgetFilter implements ITreeFilter<ChatTreeItem, FuzzyScore> {
	constructor(
		private readonly delegate: IChatWidgetFilterDelegate,
		private readonly inherited: undefined | ((item: ChatTreeItem) => boolean),
	) { }

	filter(element: ChatTreeItem): TreeFilterResult<FuzzyScore> {
		if (isRequestVM(element)) {
			const isChoiceFromResponseId = element.madeChoice?.responseId;
			const previous = this.delegate.getPrevElement(element);
			if (isResponseVM(previous) && previous.id === isChoiceFromResponseId) {
				return false;
			}
		}

		return this.inherited?.(element) ?? true;
	}
}
