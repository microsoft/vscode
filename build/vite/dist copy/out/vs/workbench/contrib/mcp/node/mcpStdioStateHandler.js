/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TimeoutTimer } from '../../../../base/common/async.js';
import { killTree } from '../../../../base/node/processes.js';
import { isWindows } from '../../../../base/common/platform.js';
var McpProcessState;
(function (McpProcessState) {
    McpProcessState[McpProcessState["Running"] = 0] = "Running";
    McpProcessState[McpProcessState["StdinEnded"] = 1] = "StdinEnded";
    McpProcessState[McpProcessState["KilledPolite"] = 2] = "KilledPolite";
    McpProcessState[McpProcessState["KilledForceful"] = 3] = "KilledForceful";
})(McpProcessState || (McpProcessState = {}));
/**
 * Manages graceful shutdown of MCP stdio connections following the MCP specification.
 *
 * Per spec, shutdown should:
 * 1. Close the input stream to the child process
 * 2. Wait for the server to exit, or send SIGTERM if it doesn't exit within 10 seconds
 * 3. Send SIGKILL if the server doesn't exit within 10 seconds after SIGTERM
 * 4. Allow forceful killing if called twice
 */
export class McpStdioStateHandler {
    static { this.GRACE_TIME_MS = 10_000; }
    get stopped() {
        return this._procState !== 0 /* McpProcessState.Running */;
    }
    constructor(_child, _graceTimeMs = McpStdioStateHandler.GRACE_TIME_MS) {
        this._child = _child;
        this._graceTimeMs = _graceTimeMs;
        this._procState = 0 /* McpProcessState.Running */;
    }
    /**
     * Initiates graceful shutdown. If called while shutdown is already in progress,
     * forces immediate termination.
     */
    stop() {
        if (this._procState === 0 /* McpProcessState.Running */) {
            let graceTime = this._graceTimeMs;
            try {
                this._child.stdin.end();
            }
            catch (error) {
                // If stdin.end() fails, continue with termination sequence
                // This can happen if the stream is already in an error state
                graceTime = 1;
            }
            this._procState = 1 /* McpProcessState.StdinEnded */;
            this._nextTimeout = new TimeoutTimer(() => this.killPolite(), graceTime);
        }
        else {
            this._nextTimeout?.dispose();
            this.killForceful();
        }
    }
    async killPolite() {
        this._procState = 2 /* McpProcessState.KilledPolite */;
        this._nextTimeout = new TimeoutTimer(() => this.killForceful(), this._graceTimeMs);
        if (this._child.pid) {
            if (!isWindows) {
                await killTree(this._child.pid, false).catch(() => {
                    this._child.kill('SIGTERM');
                });
            }
        }
        else {
            this._child.kill('SIGTERM');
        }
    }
    async killForceful() {
        this._procState = 3 /* McpProcessState.KilledForceful */;
        if (this._child.pid) {
            await killTree(this._child.pid, true).catch(() => {
                this._child.kill('SIGKILL');
            });
        }
        else {
            this._child.kill();
        }
    }
    write(message) {
        if (!this.stopped) {
            this._child.stdin.write(message + '\n');
        }
    }
    dispose() {
        this._nextTimeout?.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU3RkaW9TdGF0ZUhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3Avbm9kZS9tY3BTdGRpb1N0YXRlSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVoRSxJQUFXLGVBS1Y7QUFMRCxXQUFXLGVBQWU7SUFDekIsMkRBQU8sQ0FBQTtJQUNQLGlFQUFVLENBQUE7SUFDVixxRUFBWSxDQUFBO0lBQ1oseUVBQWMsQ0FBQTtBQUNmLENBQUMsRUFMVSxlQUFlLEtBQWYsZUFBZSxRQUt6QjtBQUVEOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxPQUFPLG9CQUFvQjthQUNSLGtCQUFhLEdBQUcsTUFBTSxBQUFULENBQVU7SUFLL0MsSUFBVyxPQUFPO1FBQ2pCLE9BQU8sSUFBSSxDQUFDLFVBQVUsb0NBQTRCLENBQUM7SUFDcEQsQ0FBQztJQUVELFlBQ2tCLE1BQXNDLEVBQ3RDLGVBQXVCLG9CQUFvQixDQUFDLGFBQWE7UUFEekQsV0FBTSxHQUFOLE1BQU0sQ0FBZ0M7UUFDdEMsaUJBQVksR0FBWixZQUFZLENBQTZDO1FBVG5FLGVBQVUsbUNBQTJCO0lBVXpDLENBQUM7SUFFTDs7O09BR0c7SUFDSSxJQUFJO1FBQ1YsSUFBSSxJQUFJLENBQUMsVUFBVSxvQ0FBNEIsRUFBRSxDQUFDO1lBQ2pELElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7WUFDbEMsSUFBSSxDQUFDO2dCQUNKLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3pCLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQiwyREFBMkQ7Z0JBQzNELDZEQUE2RDtnQkFDN0QsU0FBUyxHQUFHLENBQUMsQ0FBQztZQUNmLENBQUM7WUFDRCxJQUFJLENBQUMsVUFBVSxxQ0FBNkIsQ0FBQztZQUM3QyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxRSxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLFVBQVU7UUFDdkIsSUFBSSxDQUFDLFVBQVUsdUNBQStCLENBQUM7UUFDL0MsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRW5GLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7b0JBQ2pELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUM3QixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVk7UUFDekIsSUFBSSxDQUFDLFVBQVUseUNBQWlDLENBQUM7UUFFakQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ2hELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzdCLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BCLENBQUM7SUFDRixDQUFDO0lBRU0sS0FBSyxDQUFDLE9BQWU7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNuQixJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ3pDLENBQUM7SUFDRixDQUFDO0lBRU0sT0FBTztRQUNiLElBQUksQ0FBQyxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUM7SUFDOUIsQ0FBQyJ9