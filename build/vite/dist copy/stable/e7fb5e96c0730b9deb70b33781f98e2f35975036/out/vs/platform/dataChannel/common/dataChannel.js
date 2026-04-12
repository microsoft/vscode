/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IDataChannelService = createDecorator('dataChannelService');
export class NullDataChannelService {
    get onDidSendData() {
        return Event.None;
    }
    getDataChannel(_channelId) {
        return {
            sendData: () => { },
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YUNoYW5uZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9kYXRhQ2hhbm5lbC9jb21tb24vZGF0YUNoYW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLG9CQUFvQixDQUFDLENBQUM7QUFtQjlGLE1BQU0sT0FBTyxzQkFBc0I7SUFFbEMsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQztJQUNuQixDQUFDO0lBQ0QsY0FBYyxDQUFJLFVBQWtCO1FBQ25DLE9BQU87WUFDTixRQUFRLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNuQixDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=