/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as extHostProtocol from './extHost.protocol.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
export class ExtHostChatStatus {
    constructor(mainContext) {
        this._items = new Map();
        this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadChatStatus);
    }
    createChatStatusItem(extension, id) {
        const internalId = asChatItemIdentifier(extension.identifier, id);
        if (this._items.has(internalId)) {
            throw new Error(`Chat status item '${id}' already exists`);
        }
        const state = {
            id: internalId,
            title: '',
            description: '',
            detail: '',
        };
        let disposed = false;
        let visible = false;
        const syncState = () => {
            if (disposed) {
                throw new Error('Chat status item is disposed');
            }
            if (!visible) {
                return;
            }
            this._proxy.$setEntry(id, state);
        };
        const item = Object.freeze({
            id: id,
            get title() {
                return state.title;
            },
            set title(value) {
                state.title = value;
                syncState();
            },
            get description() {
                return state.description;
            },
            set description(value) {
                state.description = value;
                syncState();
            },
            get detail() {
                return state.detail;
            },
            set detail(value) {
                state.detail = value;
                syncState();
            },
            show: () => {
                visible = true;
                syncState();
            },
            hide: () => {
                visible = false;
                this._proxy.$disposeEntry(id);
            },
            dispose: () => {
                disposed = true;
                this._proxy.$disposeEntry(id);
                this._items.delete(internalId);
            },
        });
        this._items.set(internalId, item);
        return item;
    }
}
function asChatItemIdentifier(extension, id) {
    return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENoYXRTdGF0dXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Q2hhdFN0YXR1cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEtBQUssZUFBZSxNQUFNLHVCQUF1QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSxtREFBbUQsQ0FBQztBQUUvRyxNQUFNLE9BQU8saUJBQWlCO0lBTTdCLFlBQ0MsV0FBeUM7UUFIekIsV0FBTSxHQUFHLElBQUksR0FBRyxFQUFpQyxDQUFDO1FBS2xFLElBQUksQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVELG9CQUFvQixDQUFDLFNBQWdDLEVBQUUsRUFBVTtRQUNoRSxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNqQyxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFzQztZQUNoRCxFQUFFLEVBQUUsVUFBVTtZQUNkLEtBQUssRUFBRSxFQUFFO1lBQ1QsV0FBVyxFQUFFLEVBQUU7WUFDZixNQUFNLEVBQUUsRUFBRTtTQUNWLENBQUM7UUFFRixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDckIsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLE1BQU0sU0FBUyxHQUFHLEdBQUcsRUFBRTtZQUN0QixJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztZQUNqRCxDQUFDO1lBRUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNkLE9BQU87WUFDUixDQUFDO1lBRUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQztRQUVGLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQXdCO1lBQ2pELEVBQUUsRUFBRSxFQUFFO1lBRU4sSUFBSSxLQUFLO2dCQUNSLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQztZQUNwQixDQUFDO1lBQ0QsSUFBSSxLQUFLLENBQUMsS0FBK0M7Z0JBQ3hELEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUNwQixTQUFTLEVBQUUsQ0FBQztZQUNiLENBQUM7WUFFRCxJQUFJLFdBQVc7Z0JBQ2QsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDO1lBQzFCLENBQUM7WUFDRCxJQUFJLFdBQVcsQ0FBQyxLQUFhO2dCQUM1QixLQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztnQkFDMUIsU0FBUyxFQUFFLENBQUM7WUFDYixDQUFDO1lBRUQsSUFBSSxNQUFNO2dCQUNULE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQztZQUNyQixDQUFDO1lBQ0QsSUFBSSxNQUFNLENBQUMsS0FBeUI7Z0JBQ25DLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO2dCQUNyQixTQUFTLEVBQUUsQ0FBQztZQUNiLENBQUM7WUFFRCxJQUFJLEVBQUUsR0FBRyxFQUFFO2dCQUNWLE9BQU8sR0FBRyxJQUFJLENBQUM7Z0JBQ2YsU0FBUyxFQUFFLENBQUM7WUFDYixDQUFDO1lBQ0QsSUFBSSxFQUFFLEdBQUcsRUFBRTtnQkFDVixPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUNoQixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvQixDQUFDO1lBQ0QsT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixRQUFRLEdBQUcsSUFBSSxDQUFDO2dCQUNoQixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDaEMsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsQyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRDtBQUVELFNBQVMsb0JBQW9CLENBQUMsU0FBOEIsRUFBRSxFQUFVO0lBQ3ZFLE9BQU8sR0FBRyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7QUFDeEQsQ0FBQyJ9