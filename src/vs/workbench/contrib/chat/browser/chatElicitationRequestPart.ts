/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IChatElicitationRequest } from '../common/chatService.js';

export class ChatElicitationRequestPart implements IChatElicitationRequest {
	public readonly kind = 'elicitation';
	public state: 'pending' | 'accepted' | 'rejected' = 'pending';
	public acceptedResult?: Record<string, unknown>;

	constructor(
		public readonly title: string | IMarkdownString,
		public readonly message: string | IMarkdownString,
		public readonly originMessage: string | IMarkdownString,
		public readonly acceptButtonLabel: string,
		public readonly rejectButtonLabel: string,
		public readonly accept: () => Promise<void>,
		public readonly reject: () => Promise<void>,
	) { }

	public toJSON() {
		return {
			kind: 'elicitation',
			title: this.title,
			message: this.message,
			state: this.state === 'pending' ? 'rejected' : this.state,
			acceptedResult: this.acceptedResult,
		} satisfies Partial<IChatElicitationRequest>;
	}
}
