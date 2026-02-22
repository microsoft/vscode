/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../chatService/chatService.js';

/**
 * Runtime representation of a question carousel with a {@link DeferredPromise}
 * that is resolved when the user submits answers. {@link toJSON} strips the
 * completion so only serialisable data is persisted.
 */
export class ChatQuestionCarouselData implements IChatQuestionCarousel {
	public readonly kind = 'questionCarousel' as const;
	public readonly completion = new DeferredPromise<{ answers: Record<string, unknown> | undefined }>();

	constructor(
		public questions: IChatQuestion[],
		public allowSkip: boolean,
		public resolveId?: string,
		public data?: Record<string, unknown>,
		public isUsed?: boolean,
	) { }

	toJSON(): IChatQuestionCarousel {
		return {
			kind: this.kind,
			questions: this.questions,
			allowSkip: this.allowSkip,
			resolveId: this.resolveId,
			data: this.data,
			isUsed: this.isUsed,
		};
	}
}
