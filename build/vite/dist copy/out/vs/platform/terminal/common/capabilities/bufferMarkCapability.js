/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
/**
 * Manages "marks" in the buffer which are lines that are tracked when lines are added to or removed
 * from the buffer.
 */
export class BufferMarkCapability extends Disposable {
    constructor(_terminal) {
        super();
        this._terminal = _terminal;
        this.type = 4 /* TerminalCapability.BufferMarkDetection */;
        this._idToMarkerMap = new Map();
        this._anonymousMarkers = new Map();
        this._onMarkAdded = this._register(new Emitter());
        this.onMarkAdded = this._onMarkAdded.event;
    }
    *markers() {
        for (const m of this._idToMarkerMap.values()) {
            yield m;
        }
        for (const m of this._anonymousMarkers.values()) {
            yield m;
        }
    }
    addMark(properties) {
        const marker = properties?.marker || this._terminal.registerMarker();
        const id = properties?.id;
        if (!marker) {
            return;
        }
        if (id) {
            this._idToMarkerMap.set(id, marker);
            marker.onDispose(() => this._idToMarkerMap.delete(id));
        }
        else {
            this._anonymousMarkers.set(marker.id, marker);
            marker.onDispose(() => this._anonymousMarkers.delete(marker.id));
        }
        this._onMarkAdded.fire({ marker, id, hidden: properties?.hidden, hoverMessage: properties?.hoverMessage });
    }
    getMark(id) {
        return this._idToMarkerMap.get(id);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyTWFya0NhcGFiaWxpdHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2J1ZmZlck1hcmtDYXBhYmlsaXR5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJbEU7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLG9CQUFxQixTQUFRLFVBQVU7SUFVbkQsWUFDa0IsU0FBbUI7UUFFcEMsS0FBSyxFQUFFLENBQUM7UUFGUyxjQUFTLEdBQVQsU0FBUyxDQUFVO1FBVDVCLFNBQUksa0RBQTBDO1FBRS9DLG1CQUFjLEdBQXlCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDakQsc0JBQWlCLEdBQXlCLElBQUksR0FBRyxFQUFFLENBQUM7UUFFM0MsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFtQixDQUFDLENBQUM7UUFDdEUsZ0JBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQU0vQyxDQUFDO0lBRUQsQ0FBQyxPQUFPO1FBQ1AsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDOUMsTUFBTSxDQUFDLENBQUM7UUFDVCxDQUFDO1FBQ0QsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUNqRCxNQUFNLENBQUMsQ0FBQztRQUNULENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxDQUFDLFVBQTRCO1FBQ25DLE1BQU0sTUFBTSxHQUFHLFVBQVUsRUFBRSxNQUFNLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNyRSxNQUFNLEVBQUUsR0FBRyxVQUFVLEVBQUUsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNSLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEQsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDOUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7UUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDO0lBQzVHLENBQUM7SUFFRCxPQUFPLENBQUMsRUFBVTtRQUNqQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7Q0FDRCJ9