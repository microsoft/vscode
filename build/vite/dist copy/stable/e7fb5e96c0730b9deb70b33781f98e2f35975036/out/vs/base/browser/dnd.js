/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener } from './dom.js';
import { Disposable } from '../common/lifecycle.js';
import { Mimes } from '../common/mime.js';
/**
 * A helper that will execute a provided function when the provided HTMLElement receives
 *  dragover event for 800ms. If the drag is aborted before, the callback will not be triggered.
 */
export class DelayedDragHandler extends Disposable {
    constructor(container, callback) {
        super();
        this.timeout = undefined;
        this._register(addDisposableListener(container, 'dragover', e => {
            e.preventDefault(); // needed so that the drop event fires (https://stackoverflow.com/questions/21339924/drop-event-not-firing-in-chrome)
            if (!this.timeout) {
                this.timeout = setTimeout(() => {
                    callback();
                    this.timeout = undefined;
                }, 800);
            }
        }));
        ['dragleave', 'drop', 'dragend'].forEach(type => {
            this._register(addDisposableListener(container, type, () => {
                this.clearDragTimeout();
            }));
        });
    }
    clearDragTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }
    dispose() {
        super.dispose();
        this.clearDragTimeout();
    }
}
// Common data transfers
export const DataTransfers = {
    /**
     * Application specific resource transfer type
     */
    RESOURCES: 'ResourceURLs',
    /**
     * Browser specific transfer type to download
     */
    DOWNLOAD_URL: 'DownloadURL',
    /**
     * Browser specific transfer type for files
     */
    FILES: 'Files',
    /**
     * Typically transfer type for copy/paste transfers.
     */
    TEXT: Mimes.text,
    /**
     * Internal type used to pass around text/uri-list data.
     *
     * This is needed to work around https://bugs.chromium.org/p/chromium/issues/detail?id=239745.
     */
    INTERNAL_URI_LIST: 'application/vnd.code.uri-list',
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL2RuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDakQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUUxQzs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsVUFBVTtJQUdqRCxZQUFZLFNBQXNCLEVBQUUsUUFBb0I7UUFDdkQsS0FBSyxFQUFFLENBQUM7UUFIRCxZQUFPLEdBQXdCLFNBQVMsQ0FBQztRQUtoRCxJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDL0QsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMscUhBQXFIO1lBRXpJLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ25CLElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtvQkFDOUIsUUFBUSxFQUFFLENBQUM7b0JBRVgsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7Z0JBQzFCLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNULENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosQ0FBQyxXQUFXLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMvQyxJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO2dCQUMxRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN6QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sZ0JBQWdCO1FBQ3ZCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7SUFFUSxPQUFPO1FBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRWhCLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ3pCLENBQUM7Q0FDRDtBQUVELHdCQUF3QjtBQUN4QixNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUc7SUFFNUI7O09BRUc7SUFDSCxTQUFTLEVBQUUsY0FBYztJQUV6Qjs7T0FFRztJQUNILFlBQVksRUFBRSxhQUFhO0lBRTNCOztPQUVHO0lBQ0gsS0FBSyxFQUFFLE9BQU87SUFFZDs7T0FFRztJQUNILElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtJQUVoQjs7OztPQUlHO0lBQ0gsaUJBQWlCLEVBQUUsK0JBQStCO0NBQ2xELENBQUMifQ==