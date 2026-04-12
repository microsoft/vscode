/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDataChannelService } from '../../../../platform/dataChannel/common/dataChannel.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
export class DataChannelService extends Disposable {
    constructor() {
        super();
        this._onDidSendData = this._register(new Emitter());
        this.onDidSendData = this._onDidSendData.event;
    }
    getDataChannel(channelId) {
        return new CoreDataChannelImpl(channelId, this._onDidSendData);
    }
}
class CoreDataChannelImpl {
    constructor(channelId, _onDidSendData) {
        this.channelId = channelId;
        this._onDidSendData = _onDidSendData;
    }
    sendData(data) {
        this._onDidSendData.fire({
            channelId: this.channelId,
            data
        });
    }
}
registerSingleton(IDataChannelService, DataChannelService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YUNoYW5uZWxTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2RhdGFDaGFubmVsL2Jyb3dzZXIvZGF0YUNoYW5uZWxTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFzQyxNQUFNLHdEQUF3RCxDQUFDO0FBQ2pJLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsVUFBVTtJQU1qRDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBSlEsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFxQixDQUFDLENBQUM7UUFDMUUsa0JBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztJQUluRCxDQUFDO0lBRUQsY0FBYyxDQUFJLFNBQWlCO1FBQ2xDLE9BQU8sSUFBSSxtQkFBbUIsQ0FBSSxTQUFTLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25FLENBQUM7Q0FDRDtBQUVELE1BQU0sbUJBQW1CO0lBQ3hCLFlBQ2tCLFNBQWlCLEVBQ2pCLGNBQTBDO1FBRDFDLGNBQVMsR0FBVCxTQUFTLENBQVE7UUFDakIsbUJBQWMsR0FBZCxjQUFjLENBQTRCO0lBQ3hELENBQUM7SUFFTCxRQUFRLENBQUMsSUFBTztRQUNmLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDO1lBQ3hCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztZQUN6QixJQUFJO1NBQ0osQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEO0FBRUQsaUJBQWlCLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLG9DQUE0QixDQUFDIn0=