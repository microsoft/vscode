/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
export const METERED_CONNECTION_CHANNEL = 'meteredConnection';
/**
 * Commands supported by the metered connection IPC channel.
 */
export var MeteredConnectionCommand;
(function (MeteredConnectionCommand) {
    MeteredConnectionCommand["OnDidChangeIsConnectionMetered"] = "OnDidChangeIsConnectionMetered";
    MeteredConnectionCommand["IsConnectionMetered"] = "IsConnectionMetered";
    MeteredConnectionCommand["SetIsBrowserConnectionMetered"] = "SetIsBrowserConnectionMetered";
})(MeteredConnectionCommand || (MeteredConnectionCommand = {}));
/**
 * IPC channel client for the metered connection service.
 */
export class MeteredConnectionChannelClient extends Disposable {
    get isConnectionMetered() {
        return this._isConnectionMetered;
    }
    constructor(channel) {
        super();
        this._onDidChangeIsConnectionMetered = this._register(new Emitter());
        this.onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;
        this._isConnectionMetered = false;
        channel.call(MeteredConnectionCommand.IsConnectionMetered).then(value => {
            this._isConnectionMetered = value;
            if (value) {
                this._onDidChangeIsConnectionMetered.fire(value);
            }
        });
        this._register(channel.listen(MeteredConnectionCommand.OnDidChangeIsConnectionMetered)(value => {
            if (this._isConnectionMetered !== value) {
                this._isConnectionMetered = value;
                this._onDidChangeIsConnectionMetered.fire(value);
            }
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb25JcGMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb25JcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUkvRCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxtQkFBbUIsQ0FBQztBQUU5RDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLHdCQUlYO0FBSkQsV0FBWSx3QkFBd0I7SUFDbkMsNkZBQWlFLENBQUE7SUFDakUsdUVBQTJDLENBQUE7SUFDM0MsMkZBQStELENBQUE7QUFDaEUsQ0FBQyxFQUpXLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFJbkM7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyw4QkFBK0IsU0FBUSxVQUFVO0lBTzdELElBQVcsbUJBQW1CO1FBQzdCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDO0lBQ2xDLENBQUM7SUFFRCxZQUFZLE9BQWlCO1FBQzVCLEtBQUssRUFBRSxDQUFDO1FBVFEsb0NBQStCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBVyxDQUFDLENBQUM7UUFDMUUsbUNBQThCLEdBQUcsSUFBSSxDQUFDLCtCQUErQixDQUFDLEtBQUssQ0FBQztRQUVwRix5QkFBb0IsR0FBRyxLQUFLLENBQUM7UUFRcEMsT0FBTyxDQUFDLElBQUksQ0FBVSx3QkFBd0IsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNoRixJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsSUFBSSxDQUFDLCtCQUErQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQVUsd0JBQXdCLENBQUMsOEJBQThCLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN2RyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDekMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztnQkFDbEMsSUFBSSxDQUFDLCtCQUErQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRCJ9