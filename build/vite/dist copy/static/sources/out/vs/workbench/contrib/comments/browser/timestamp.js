/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { fromNow } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { language } from '../../../../base/common/platform.js';
import { COMMENTS_SECTION } from '../common/commentsConfiguration.js';
export class TimestampWidget extends Disposable {
    constructor(configurationService, hoverService, container, timeStamp) {
        super();
        this.configurationService = configurationService;
        this._date = dom.append(container, dom.$('span.timestamp'));
        this._date.style.display = 'none';
        this._useRelativeTime = this.useRelativeTimeSetting;
        this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this._date, ''));
        this.setTimestamp(timeStamp);
    }
    get useRelativeTimeSetting() {
        return this.configurationService.getValue(COMMENTS_SECTION).useRelativeTime;
    }
    async setTimestamp(timestamp) {
        if ((timestamp !== this._timestamp) || (this.useRelativeTimeSetting !== this._useRelativeTime)) {
            this.updateDate(timestamp);
        }
        this._timestamp = timestamp;
        this._useRelativeTime = this.useRelativeTimeSetting;
    }
    updateDate(timestamp) {
        if (!timestamp) {
            this._date.textContent = '';
            this._date.style.display = 'none';
        }
        else if ((timestamp !== this._timestamp)
            || (this.useRelativeTimeSetting !== this._useRelativeTime)) {
            this._date.style.display = '';
            let textContent;
            let tooltip;
            if (this.useRelativeTimeSetting) {
                textContent = this.getRelative(timestamp);
                tooltip = this.getDateString(timestamp);
            }
            else {
                textContent = this.getDateString(timestamp);
            }
            this._date.textContent = textContent;
            this.hover.update(tooltip ?? '');
        }
    }
    getRelative(date) {
        return fromNow(date, true, true);
    }
    getDateString(date) {
        return date.toLocaleString(language);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGltZXN0YW1wLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci90aW1lc3RhbXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUV2RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUcvRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTBCLE1BQU0sb0NBQW9DLENBQUM7QUFFOUYsTUFBTSxPQUFPLGVBQWdCLFNBQVEsVUFBVTtJQU85QyxZQUNTLG9CQUEyQyxFQUNuRCxZQUEyQixFQUMzQixTQUFzQixFQUN0QixTQUFnQjtRQUVoQixLQUFLLEVBQUUsQ0FBQztRQUxBLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFNbkQsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUM7UUFDcEQsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsSUFBWSxzQkFBc0I7UUFDakMsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUF5QixnQkFBZ0IsQ0FBQyxDQUFDLGVBQWUsQ0FBQztJQUNyRyxDQUFDO0lBRU0sS0FBSyxDQUFDLFlBQVksQ0FBQyxTQUEyQjtRQUNwRCxJQUFJLENBQUMsU0FBUyxLQUFLLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsS0FBSyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQ2hHLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUNELElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1FBQzVCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUM7SUFDckQsQ0FBQztJQUVPLFVBQVUsQ0FBQyxTQUFnQjtRQUNsQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDbkMsQ0FBQzthQUFNLElBQUksQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLFVBQVUsQ0FBQztlQUN0QyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsS0FBSyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQzdELElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDOUIsSUFBSSxXQUFtQixDQUFDO1lBQ3hCLElBQUksT0FBMkIsQ0FBQztZQUNoQyxJQUFJLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO2dCQUNqQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDMUMsT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDekMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFdBQVcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzdDLENBQUM7WUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7WUFDckMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBRU8sV0FBVyxDQUFDLElBQVU7UUFDN0IsT0FBTyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU8sYUFBYSxDQUFDLElBQVU7UUFDL0IsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRCJ9