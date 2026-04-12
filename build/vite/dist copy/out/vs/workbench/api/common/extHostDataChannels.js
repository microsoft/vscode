/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export const IExtHostDataChannels = createDecorator('IExtHostDataChannels');
export class ExtHostDataChannels {
    constructor() {
        this._channels = new Map();
    }
    createDataChannel(extension, channelId) {
        checkProposedApiEnabled(extension, 'dataChannels');
        let channel = this._channels.get(channelId);
        if (!channel) {
            channel = new DataChannelImpl(channelId);
            this._channels.set(channelId, channel);
        }
        return channel;
    }
    $onDidReceiveData(channelId, data) {
        const channel = this._channels.get(channelId);
        if (channel) {
            channel._fireDidReceiveData(data);
        }
    }
}
class DataChannelImpl extends Disposable {
    constructor(channelId) {
        super();
        this.channelId = channelId;
        this._onDidReceiveData = new Emitter();
        this.onDidReceiveData = this._onDidReceiveData.event;
        this._register(this._onDidReceiveData);
    }
    _fireDidReceiveData(data) {
        this._onDidReceiveData.fire({ data });
    }
    toString() {
        return `DataChannel(${this.channelId})`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERhdGFDaGFubmVscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REYXRhQ2hhbm5lbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUV6RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFPMUYsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsZUFBZSxDQUF1QixzQkFBc0IsQ0FBQyxDQUFDO0FBRWxHLE1BQU0sT0FBTyxtQkFBbUI7SUFLL0I7UUFGaUIsY0FBUyxHQUFHLElBQUksR0FBRyxFQUFnQyxDQUFDO0lBR3JFLENBQUM7SUFFRCxpQkFBaUIsQ0FBSSxTQUFnQyxFQUFFLFNBQWlCO1FBQ3ZFLHVCQUF1QixDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUVuRCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxPQUFPLEdBQUcsSUFBSSxlQUFlLENBQUksU0FBUyxDQUFDLENBQUM7WUFDNUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRUQsaUJBQWlCLENBQUMsU0FBaUIsRUFBRSxJQUFTO1FBQzdDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sZUFBbUIsU0FBUSxVQUFVO0lBSTFDLFlBQTZCLFNBQWlCO1FBQzdDLEtBQUssRUFBRSxDQUFDO1FBRG9CLGNBQVMsR0FBVCxTQUFTLENBQVE7UUFIN0Isc0JBQWlCLEdBQUcsSUFBSSxPQUFPLEVBQThCLENBQUM7UUFDL0QscUJBQWdCLEdBQXNDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFJbEcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsSUFBTztRQUMxQixJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRVEsUUFBUTtRQUNoQixPQUFPLGVBQWUsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDO0lBQ3pDLENBQUM7Q0FDRCJ9