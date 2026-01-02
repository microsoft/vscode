/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ElicitationState, IChatElicitationRequest, IChatElicitationRequestSerialized } from '../../chatService/chatService.js';
import { ToolDataSource } from '../../tools/languageModelToolsService.js';

export class ChatElicitationRequestPart extends Disposable implements IChatElicitationRequest {
	public readonly kind = 'elicitation2';
	public state = observableValue('state', ElicitationState.Pending);
	public acceptedResult?: Record<string, unknown>;

	private readonly _isHiddenValue = observableValue<boolean>('isHidden', false);
	public readonly isHidden: IObservable<boolean> = this._isHiddenValue;
	public reject?: (() => Promise<void>) | undefined;

	constructor(
		public readonly title: string | IMarkdownString,
		public readonly message: string | IMarkdownString,
		public readonly subtitle: string | IMarkdownString,
		public readonly acceptButtonLabel: string,
		public readonly rejectButtonLabel: string | undefined,
		// True when the primary action is accepted, otherwise the action that was selected
		private readonly _accept: (value: IAction | true) => Promise<ElicitationState>,
		reject?: () => Promise<ElicitationState>,
		public readonly source?: ToolDataSource,
		public readonly moreActions?: IAction[],
		public readonly onHide?: () => void,
	) {
		super();

		if (reject) {
			this.reject = async () => {
				const state = await reject!();
				this.state.set(state, undefined);
			};
		}
	}

	accept(value: IAction | true): Promise<void> {
		return this._accept(value).then(state => {
			this.state.set(state, undefined);
		});
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
		const state = this.state.get();

		return {
			kind: 'elicitationSerialized',
			title: this.title,
			message: this.message,
			state: state === ElicitationState.Pending ? ElicitationState.Rejected : state,
			acceptedResult: this.acceptedResult,
			subtitle: this.subtitle,
			source: this.source,
			isHidden: this._isHiddenValue.get(),
		} satisfies IChatElicitationRequestSerialized;
	}
}
