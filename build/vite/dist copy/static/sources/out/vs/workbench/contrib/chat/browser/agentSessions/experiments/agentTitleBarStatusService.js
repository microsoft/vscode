/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
//#region Agent Status Mode
export var AgentStatusMode;
(function (AgentStatusMode) {
    /** Default mode showing workspace name + session stats */
    AgentStatusMode["Default"] = "default";
    /** Session ready mode showing session title + Enter button (before entering projection) */
    AgentStatusMode["SessionReady"] = "sessionReady";
    /** Session mode showing session title + Esc button (inside projection) */
    AgentStatusMode["Session"] = "session";
})(AgentStatusMode || (AgentStatusMode = {}));
export const IAgentTitleBarStatusService = createDecorator('agentTitleBarStatusService');
//#endregion
//#region Agent Status Service Implementation
export class AgentTitleBarStatusService extends Disposable {
    constructor() {
        super(...arguments);
        this._mode = AgentStatusMode.Default;
        this._onDidChangeMode = this._register(new Emitter());
        this.onDidChangeMode = this._onDidChangeMode.event;
        this._onDidChangeSessionInfo = this._register(new Emitter());
        this.onDidChangeSessionInfo = this._onDidChangeSessionInfo.event;
    }
    get mode() { return this._mode; }
    get sessionInfo() { return this._sessionInfo; }
    enterSessionMode(sessionResource, title) {
        const newInfo = { sessionResource, title };
        const modeChanged = this._mode !== AgentStatusMode.Session;
        this._mode = AgentStatusMode.Session;
        this._sessionInfo = newInfo;
        if (modeChanged) {
            this._onDidChangeMode.fire(this._mode);
        }
        this._onDidChangeSessionInfo.fire(this._sessionInfo);
    }
    enterSessionReadyMode(sessionResource, title) {
        const newInfo = { sessionResource, title };
        const modeChanged = this._mode !== AgentStatusMode.SessionReady;
        this._mode = AgentStatusMode.SessionReady;
        this._sessionInfo = newInfo;
        if (modeChanged) {
            this._onDidChangeMode.fire(this._mode);
        }
        this._onDidChangeSessionInfo.fire(this._sessionInfo);
    }
    exitSessionReadyMode() {
        // Only exit if we're in SessionReady mode (don't exit from Session mode)
        if (this._mode !== AgentStatusMode.SessionReady) {
            return;
        }
        this._mode = AgentStatusMode.Default;
        this._sessionInfo = undefined;
        this._onDidChangeMode.fire(this._mode);
        this._onDidChangeSessionInfo.fire(undefined);
    }
    exitSessionMode() {
        if (this._mode === AgentStatusMode.Default) {
            return;
        }
        this._mode = AgentStatusMode.Default;
        this._sessionInfo = undefined;
        this._onDidChangeMode.fire(this._mode);
        this._onDidChangeSessionInfo.fire(undefined);
    }
    updateSessionTitle(title) {
        if (this._mode !== AgentStatusMode.Session || !this._sessionInfo) {
            return;
        }
        this._sessionInfo = { ...this._sessionInfo, title };
        this._onDidChangeSessionInfo.fire(this._sessionInfo);
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9leHBlcmltZW50cy9hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUVuRywyQkFBMkI7QUFFM0IsTUFBTSxDQUFOLElBQVksZUFPWDtBQVBELFdBQVksZUFBZTtJQUMxQiwwREFBMEQ7SUFDMUQsc0NBQW1CLENBQUE7SUFDbkIsMkZBQTJGO0lBQzNGLGdEQUE2QixDQUFBO0lBQzdCLDBFQUEwRTtJQUMxRSxzQ0FBbUIsQ0FBQTtBQUNwQixDQUFDLEVBUFcsZUFBZSxLQUFmLGVBQWUsUUFPMUI7QUFnRUQsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUE4Qiw0QkFBNEIsQ0FBQyxDQUFDO0FBRXRILFlBQVk7QUFFWiw2Q0FBNkM7QUFFN0MsTUFBTSxPQUFPLDBCQUEyQixTQUFRLFVBQVU7SUFBMUQ7O1FBSVMsVUFBSyxHQUFvQixlQUFlLENBQUMsT0FBTyxDQUFDO1FBTXhDLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW1CLENBQUMsQ0FBQztRQUMxRSxvQkFBZSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7UUFFdEMsNEJBQXVCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBdUMsQ0FBQyxDQUFDO1FB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