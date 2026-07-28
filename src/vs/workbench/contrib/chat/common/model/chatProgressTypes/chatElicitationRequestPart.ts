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
	 * Who, if anyone, owns settling this request.
	 *
	 * An elicitation can be settled from several places at once -- the widget's
	 * buttons, a voice command, `hide()`, and the agent host relaying an outcome
	 * the server already recorded -- and settling is asynchronous, so without an
	 * owner the last handler to *finish* would win rather than the first one to
	 * *start*. That is how a request the user declined by mouse could still end
	 * up reported as accepted, and how the accept handler could run (opening a
	 * URL, granting an authorization) after a decline.
	 *
	 * Claiming is synchronous and JavaScript is single-threaded, so first-wins
	 * here is genuine rather than merely likely. This matches the confirmation
	 * and question-carousel parts, which are already first-wins.
	 */
	private _settlement: 'open' | 'inFlight' | 'final' = 'open';

	/**
	 * Identifies the current owner so a superseded one cannot write.
	 *
	 * {@link settle} can invalidate an owner that is already awaiting its
	 * handler, which a plain flag could not express: that owner has to be told,
	 * when it comes back, that it no longer speaks for this request.
	 */
	private _settlementToken = 0;

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
				const token = this._claimSettlement();
				if (token === undefined) {
					return;
				}
				this._recordSettlement(token, await reject!());
			};
		}
	}

	/** Take ownership of settling this request, or report that someone else has it. */
	private _claimSettlement(): number | undefined {
		if (this._settlement !== 'open') {
			return undefined;
		}
		this._settlement = 'inFlight';
		return ++this._settlementToken;
	}

	/**
	 * Record what a claimed handler decided, unless it has been superseded.
	 *
	 * A handler may answer {@link ElicitationState.Pending}, which means it did
	 * something other than settle -- the sandbox prompt's "Focus Terminal" hands
	 * the user off to the terminal and deliberately leaves the request open.
	 * Ownership is released so the request can still be settled later, and a
	 * `hide()` that arrived while the handler was running is applied now, since
	 * it could not settle a request somebody else owned.
	 */
	private _recordSettlement(token: number, state: ElicitationState): void {
		if (this._settlementToken !== token) {
			return;
		}
		if (state === ElicitationState.Pending) {
			this._settlement = 'open';
			if (this._isHiddenValue.get()) {
				this.settle(ElicitationState.Rejected);
			}
			return;
		}
		this._settlement = 'final';
		this.state.set(state, undefined);
	}

	/**
	 * Record an outcome that was decided elsewhere, superseding anything this
	 * client still has in flight. Used when the server reports what it did with
	 * the request, which is authoritative over a local accept or reject that has
	 * not come back yet.
	 */
	settle(state: ElicitationState): void {
		this._settlementToken++;
		this._settlement = 'final';
		this.state.set(state, undefined);
	}

	async accept(value: IAction | true): Promise<void> {
		const token = this._claimSettlement();
		if (token === undefined) {
			return;
		}
		this._recordSettlement(token, await this._accept(value));
	}

	hide(): void {
		if (this._isHiddenValue.get()) {
			return;
		}
		this._isHiddenValue.set(true, undefined, undefined);
		this.onHide?.();
		// Stand in for a settlement only when nobody else has recorded or started
		// one: a resolved state is authoritative, and an accept or reject still
		// awaiting its handler is the real outcome. If that handler turns out not
		// to settle, it applies this hide on its way out.
		if (this._settlement === 'open' && this.state.get() === ElicitationState.Pending) {
			this.settle(ElicitationState.Rejected);
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
