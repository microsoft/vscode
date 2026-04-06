/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IChatQuestion, IChatQuestionAnswers, IChatQuestionCarousel } from '../../chatService/chatService.js';
import { ToolDataSource } from '../../tools/languageModelToolsService.js';

/**
 * Runtime representation of a question carousel with a {@link DeferredPromise}
 * that is resolved when the user submits answers. {@link toJSON} strips the
 * completion so only serialisable data is persisted.
 */
export class ChatQuestionCarouselData implements IChatQuestionCarousel {
	public readonly kind = 'questionCarousel' as const;
	public readonly completion = new DeferredPromise<{ answers: IChatQuestionAnswers | undefined }>();
	public draftAnswers: IChatQuestionAnswers | undefined;
	public draftCurrentIndex: number | undefined;
	public draftCollapsed: boolean | undefined;

	constructor(
		public questions: IChatQuestion[],
		public allowSkip: boolean,
		public resolveId?: string,
		public data?: IChatQuestionAnswers,
		public isUsed?: boolean,
		public message?: string | IMarkdownString,
		public source?: ToolDataSource,
	) { }

	toJSON(): IChatQuestionCarousel {
		return {
			kind: this.kind,
			questions: this.questions,
			allowSkip: this.allowSkip,
			resolveId: this.resolveId,
			data: this.data,
			isUsed: this.isUsed,
			message: this.message,
			source: this.source,
		};
	}
}
