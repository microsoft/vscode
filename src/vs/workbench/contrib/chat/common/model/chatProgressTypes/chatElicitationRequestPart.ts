/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ElicitationState, IChatElicitationRequest, IChatElicitationRequestSerialized } from '../../chatService/chatService.js';
import { ToolDataSource } from '../../tools/languageModelToolsService.js';

export class ChatElicitationRequestPart implements IChatElicitationRequest {
	public readonly kind = 'elicitation2';
	public state = observableValue('state', ElicitationState.Pending);
	public acceptedResult?: Record<string, unknown>;

	private readonly _isHiddenValue = observableValue<boolean>('isHidden', false);
	public readonly isHidden: IObservable<boolean> = this._isHiddenValue;
	public reject?: (() => Promise<void>) | undefined;

	/**
	 * Whether something has already claimed the right to settle this request.
	 *
	 * An elicitation can be settled from several places at once -- the widget's
	 * buttons, a voice command, and `hide()` -- and settling is asynchronous,
	 * so without this the last handler to *finish* would win rather than the
	 * first one to *start*. That is how a request the user declined by mouse
	 * could still end up reported as accepted, and how the accept handler could
	 * run (opening a URL, granting an authorization) after a decline.
	 *
	 * Claiming is synchronous and JavaScript is single-threaded, so first-wins
	 * here is genuine rather than merely likely. This matches the confirmation
	 * and question-carousel parts, which are already first-wins.
	 */
	private _settled = false;

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
		public readonly riskAssessment?: { toolId: string; parameters: unknown },
	) {
		if (reject) {
			this.reject = async () => {
				if (!this._claimSettlement()) {
					return;
				}
				const state = await reject!();
				this.state.set(state, undefined);
			};
		}
	}

	/** Take ownership of settling this request, or report that someone else already has. */
	private _claimSettlement(): boolean {
		if (this._settled) {
			return false;
		}
		this._settled = true;
		return true;
	}

	async accept(value: IAction | true): Promise<void> {
		if (!this._claimSettlement()) {
			return;
		}
		this.state.set(await this._accept(value), undefined);
	}

	hide(): void {
		if (this._isHiddenValue.get()) {
			return;
		}
		this._isHiddenValue.set(true, undefined, undefined);
		this.onHide?.();
		// Only stand in for a settlement nobody else has recorded or started: a
		// resolved state is authoritative, and an accept or reject still
		// awaiting its handler is the real outcome.
		if (this.state.get() === ElicitationState.Pending && this._claimSettlement()) {
			this.state.set(ElicitationState.Rejected, undefined);
		}
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
