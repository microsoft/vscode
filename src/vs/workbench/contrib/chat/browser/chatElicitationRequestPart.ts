/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { IChatElicitationRequest } from '../common/chatService.js';
import { ToolDataSource } from '../common/languageModelToolsService.js';

export class ChatElicitationRequestPart extends Disposable implements IChatElicitationRequest {
	public readonly kind = 'elicitation';
	public state: 'pending' | 'accepted' | 'rejected' = 'pending';
	public acceptedResult?: Record<string, unknown>;

	private readonly _isHiddenValue = observableValue<boolean>('isHidden', false);
	public readonly isHidden: IObservable<boolean> = this._isHiddenValue;

	constructor(
		public readonly title: string | IMarkdownString,
		public readonly message: string | IMarkdownString,
		public readonly subtitle: string | IMarkdownString,
		public readonly acceptButtonLabel: string,
		public readonly rejectButtonLabel: string | undefined,
		// True when the primary action is accepted, otherwise the action that was selected
		public readonly accept: (value: IAction | true) => Promise<void>,
		public readonly reject?: () => Promise<void>,
		public readonly source?: ToolDataSource,
		public readonly moreActions?: IAction[],
		public readonly onHide?: () => void,
	) {
		super();
	}

	hide(): void {
		if (this._isHiddenValue.get()) {
			return;
		}
		this._isHiddenValue.set(true, undefined, undefined);
		this.onHide?.();
		this.dispose();
	}

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
