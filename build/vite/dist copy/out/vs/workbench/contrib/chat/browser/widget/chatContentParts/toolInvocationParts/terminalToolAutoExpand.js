/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { disposableTimeout } from '../../../../../../../base/common/async.js';
/**
 * Timeout constants for the auto-expand algorithm.
 */
export var TerminalToolAutoExpandTimeout;
(function (TerminalToolAutoExpandTimeout) {
    /**
     * Timeout in milliseconds to wait when no data events are received before checking for auto-expand.
     */
    TerminalToolAutoExpandTimeout[TerminalToolAutoExpandTimeout["NoData"] = 500] = "NoData";
    /**
     * Timeout in milliseconds to wait after first data event before checking for auto-expand.
     * This prevents flickering for fast commands like `ls` that finish quickly.
     */
    TerminalToolAutoExpandTimeout[TerminalToolAutoExpandTimeout["DataEvent"] = 50] = "DataEvent";
})(TerminalToolAutoExpandTimeout || (TerminalToolAutoExpandTimeout = {}));
export class TerminalToolAutoExpand extends Disposable {
    constructor(_options) {
        super();
        this._options = _options;
        this._commandFinished = false;
        this._receivedData = false;
        this._onDidRequestExpand = this._register(new Emitter());
        this.onDidRequestExpand = this._onDidRequestExpand.event;
        this._setupListeners();
    }
    _setupListeners() {
        const store = this._register(new DisposableStore());
        const commandDetection = this._options.commandDetection;
        store.add(commandDetection.onCommandExecuted(() => {
            // Auto-expand for long-running commands:
            if (this._options.shouldAutoExpand() && !this._noDataTimeout) {
                this._noDataTimeout = disposableTimeout(() => {
                    this._noDataTimeout = undefined;
                    const shouldExpand = this._options.shouldAutoExpand();
                    const hasOutput = this._options.hasRealOutput();
                    // Don't check receivedData here - data events can fire before onCommandExecuted
                    // (shell integration sequences), and the DataEvent path may not have expanded
                    // if hasRealOutput was false at that time
                    if (shouldExpand && hasOutput) {
                        // Cancel the DataEvent timeout since we're expanding via the NoData path
                        this._dataEventTimeout?.dispose();
                        this._dataEventTimeout = undefined;
                        this._onDidRequestExpand.fire();
                    }
                }, 500 /* TerminalToolAutoExpandTimeout.NoData */, store);
            }
        }));
        // 2. Wait for first data event - when hit, wait 50ms and expand if command not yet finished
        // Also checks for real output since shell integration sequences trigger onWillData
        // Important: We don't cancel _noDataTimeout here because early data might just be shell
        // integration sequences. The NoData path should still run if the DataEvent path doesn't
        // find real output.
        store.add(this._options.onWillData(() => {
            if (this._receivedData) {
                return;
            }
            this._receivedData = true;
            // Wait 50ms and expand if command hasn't finished yet and has real output
            if (this._options.shouldAutoExpand() && !this._dataEventTimeout) {
                this._dataEventTimeout = disposableTimeout(() => {
                    this._dataEventTimeout = undefined;
                    const shouldExpand = this._options.shouldAutoExpand();
                    const hasOutput = this._options.hasRealOutput();
                    if (!this._commandFinished && shouldExpand && hasOutput) {
                        // Cancel the NoData timeout since we're expanding via the DataEvent path
                        this._noDataTimeout?.dispose();
                        this._noDataTimeout = undefined;
                        this._onDidRequestExpand.fire();
                    }
                }, 50 /* TerminalToolAutoExpandTimeout.DataEvent */, store);
            }
        }));
        store.add(commandDetection.onCommandFinished(() => {
            this._commandFinished = true;
            this._clearAutoExpandTimeouts();
        }));
    }
    _clearAutoExpandTimeouts() {
        this._dataEventTimeout?.dispose();
        this._dataEventTimeout = undefined;
        this._noDataTimeout?.dispose();
        this._noDataTimeout = undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUb29sQXV0b0V4cGFuZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL3Rlcm1pbmFsVG9vbEF1dG9FeHBhbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFrQzlFOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLDZCQVVqQjtBQVZELFdBQWtCLDZCQUE2QjtJQUM5Qzs7T0FFRztJQUNILHVGQUFZLENBQUE7SUFDWjs7O09BR0c7SUFDSCw0RkFBYyxDQUFBO0FBQ2YsQ0FBQyxFQVZpQiw2QkFBNkIsS0FBN0IsNkJBQTZCLFFBVTlDO0FBRUQsTUFBTSxPQUFPLHNCQUF1QixTQUFRLFVBQVU7SUFTckQsWUFDa0IsUUFBd0M7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFGUyxhQUFRLEdBQVIsUUFBUSxDQUFnQztRQVRsRCxxQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFDekIsa0JBQWEsR0FBRyxLQUFLLENBQUM7UUFJYix3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNsRSx1QkFBa0IsR0FBZ0IsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztRQU16RSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDeEIsQ0FBQztJQUVPLGVBQWU7UUFDdEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxD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