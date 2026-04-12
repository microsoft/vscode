/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { observableValue } from '../../../../../../base/common/observable.js';
export class ChatElicitationRequestPart {
    constructor(title, message, subtitle, acceptButtonLabel, rejectButtonLabel, 
    // True when the primary action is accepted, otherwise the action that was selected
    _accept, reject, source, moreActions, onHide) {
        this.title = title;
        this.message = message;
        this.subtitle = subtitle;
        this.acceptButtonLabel = acceptButtonLabel;
        this.rejectButtonLabel = rejectButtonLabel;
        this._accept = _accept;
        this.source = source;
        this.moreActions = moreActions;
        this.onHide = onHide;
        this.kind = 'elicitation2';
        this.state = observableValue('state', "pending" /* ElicitationState.Pending */);
        this._isHiddenValue = observableValue('isHidden', false);
        this.isHidden = this._isHiddenValue;
        if (reject) {
            this.reject = async () => {
                const state = await reject();
                this.state.set(state, undefined);
            };
        }
    }
    accept(value) {
        return this._accept(value).then(state => {
            this.state.set(state, undefined);
        });
    }
    hide() {
        if (this._isHiddenValue.get()) {
            return;
        }
        this._isHiddenValue.set(true, undefined, undefined);
        this.onHide?.();
        if (this.state.get() === "pending" /* ElicitationState.Pending */) {
            this.state.set("rejected" /* ElicitationState.Rejected */, undefined);
        }
    }
    toJSON() {
        const state = this.state.get();
        return {
            kind: 'elicitationSerialized',
            title: this.title,
            message: this.message,
            state: state === "pending" /* ElicitationState.Pending */ ? "rejected" /* ElicitationState.Rejected */ : state,
            acceptedResult: this.acceptedResult,
            subtitle: this.subtitle,
            source: this.source,
            isHidden: this._isHiddenValue.get(),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFJM0YsTUFBTSxPQUFPLDBCQUEwQjtJQVN0QyxZQUNpQixLQUErQixFQUMvQixPQUFpQyxFQUNqQyxRQUFrQyxFQUNsQyxpQkFBeUIsRUFDekIsaUJBQXFDO0lBQ3JELG1GQUFtRjtJQUNsRSxPQUE2RCxFQUM5RSxNQUF3QyxFQUN4QixNQUF1QixFQUN2QixXQUF1QixFQUN2QixNQUFtQjtRQVZuQixVQUFLLEdBQUwsS0FBSyxDQUEwQjtRQUMvQixZQUFPLEdBQVAsT0FBTyxDQUEwQjtRQUNqQyxhQUFRLEdBQVIsUUFBUSxDQUEwQjtRQUNsQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQVE7UUFDekIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUVwQyxZQUFPLEdBQVAsT0FBTyxDQUFzRDtRQUU5RCxXQUFNLEdBQU4sTUFBTSxDQUFpQjtRQUN2QixnQkFBVyxHQUFYLFdBQVcsQ0FBWTtRQUN2QixXQUFNLEdBQU4sTUFBTSxDQUFhO1FBbkJwQixTQUFJLEdBQUcsY0FBYyxDQUFDO1FBQy9CLFVBQUssR0FBRyxlQUFlLENBQUMsT0FBTywyQ0FBMkIsQ0FBQztRQUdqRCxtQkFBYyxHQUFHLGVBQWUsQ0FBVSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUQsYUFBUSxHQUF5QixJQUFJLENBQUMsY0FBYyxDQUFDO1FBZ0JwRSxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLElBQUksRUFBRTtnQkFDeEIsTUFBTSxLQUFLLEdBQUcsTUFBTSxNQUFPLEVBQUUsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ2xDLENBQUMsQ0FBQztRQUNILENBQUM7SUFDRixDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQXFCO1FBQzNCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDdkMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztZQUMvQixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7UUFDaEIsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSw2Q0FBNkIsRUFBRSxDQUFDO1lBQ25ELElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyw2Q0FBNEIsU0FBUyxDQUFDLENBQUM7UUFDdEQsQ0FBQztJQUNGLENBQUM7SUFFTSxNQUFNO1FBQ1osTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUUvQixPQUFPO1lBQ04sSUFBSSxFQUFFLHVCQUF1QjtZQUM3QixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLEtBQUssRUFBRSxLQUFLLDZDQUE2QixDQUFDLENBQUMsNENBQTJCLENBQUMsQ0FBQyxLQUFLO1lBQzdFLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztZQUNuQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ25CLFFBQVEsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRTtTQUNTLENBQUM7SUFDL0MsQ0FBQztDQUNEIn0=