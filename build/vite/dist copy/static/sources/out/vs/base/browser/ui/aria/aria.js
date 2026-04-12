/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../dom.js';
import './aria.css';
// Use a max length since we are inserting the whole msg in the DOM and that can cause browsers to freeze for long messages #94233
const MAX_MESSAGE_LENGTH = 20000;
let ariaContainer;
let alertContainer;
let alertContainer2;
let statusContainer;
let statusContainer2;
export function setARIAContainer(parent) {
    ariaContainer = document.createElement('div');
    ariaContainer.className = 'monaco-aria-container';
    const createAlertContainer = () => {
        const element = document.createElement('div');
        element.className = 'monaco-alert';
        element.setAttribute('role', 'alert');
        element.setAttribute('aria-atomic', 'true');
        ariaContainer.appendChild(element);
        return element;
    };
    alertContainer = createAlertContainer();
    alertContainer2 = createAlertContainer();
    const createStatusContainer = () => {
        const element = document.createElement('div');
        element.className = 'monaco-status';
        element.setAttribute('aria-live', 'polite');
        element.setAttribute('aria-atomic', 'true');
        ariaContainer.appendChild(element);
        return element;
    };
    statusContainer = createStatusContainer();
    statusContainer2 = createStatusContainer();
    parent.appendChild(ariaContainer);
}
/**
 * Given the provided message, will make sure that it is read as alert to screen readers.
 */
export function alert(msg) {
    if (!ariaContainer) {
        return;
    }
    // Use alternate containers such that duplicated messages get read out by screen readers #99466
    if (alertContainer.textContent !== msg) {
        dom.clearNode(alertContainer2);
        insertMessage(alertContainer, msg);
    }
    else {
        dom.clearNode(alertContainer);
        insertMessage(alertContainer2, msg);
    }
}
/**
 * Given the provided message, will make sure that it is read as status to screen readers.
 */
export function status(msg) {
    if (!ariaContainer) {
        return;
    }
    if (statusContainer.textContent !== msg) {
        dom.clearNode(statusContainer2);
        insertMessage(statusContainer, msg);
    }
    else {
        dom.clearNode(statusContainer);
        insertMessage(statusContainer2, msg);
    }
}
function insertMessage(target, msg) {
    dom.clearNode(target);
    if (msg.length > MAX_MESSAGE_LENGTH) {
        msg = msg.substr(0, MAX_MESSAGE_LENGTH);
    }
    target.textContent = msg;
    // See https://www.paciellogroup.com/blog/2012/06/html5-accessibility-chops-aria-rolealert-browser-support/
    target.style.visibility = 'hidden';
    target.style.visibility = 'visible';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJpYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxjQUFjLENBQUM7QUFDcEMsT0FBTyxZQUFZLENBQUM7QUFFcEIsa0lBQWtJO0FBQ2xJLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDO0FBQ2pDLElBQUksYUFBMEIsQ0FBQztBQUMvQixJQUFJLGNBQTJCLENBQUM7QUFDaEMsSUFBSSxlQUE0QixDQUFDO0FBQ2pDLElBQUksZUFBNEIsQ0FBQztBQUNqQyxJQUFJLGdCQUE2QixDQUFDO0FBQ2xDLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxNQUFtQjtJQUNuRCxhQUFhLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QyxhQUFhLENBQUMsU0FBUyxHQUFHLHVCQUF1QixDQUFDO0lBRWxELE1BQU0sb0JBQW9CLEdBQUcsR0FBRyxFQUFFO1FBQ2pDLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxjQUFjLENBQUM7UUFDbkMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdEMsT0FBTyxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDNUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuQyxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDLENBQUM7SUFDRixjQUFjLEdBQUcsb0JBQW9CLEVBQUUsQ0FBQztJQUN4QyxlQUFlLEdBQUcsb0JBQW9CLEVBQUUsQ0FBQztJQUV6QyxNQUFNLHFCQUFxQixHQUFHLEdBQUcsRUFBRTtRQUNsQyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsZUFBZSxDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLE9BQU8sQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLGFBQWEsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkMsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQyxDQUFDO0lBQ0YsZUFBZSxHQUFHLHFCQUFxQixFQUFFLENBQUM7SUFDMUMsZ0JBQWdCLEdBQUcscUJBQXFCLEVBQUUsQ0FBQztJQUUzQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFDRDs7R0FFRztBQUNILE1BQU0sVUFBVSxLQUFLLENBQUMsR0FBVztJQUNoQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDcEIsT0FBTztJQUNSLENBQUM7SUFFRCwrRkFBK0Y7SUFDL0YsSUFBSSxjQUFjLENBQUMsV0FBVyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ3hDLEdBQUcsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDL0IsYUFBYSxDQUFDLGNBQWMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNwQyxDQUFDO1NBQU0sQ0FBQztRQUNQLEdBQUcsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDOUIsYUFBYSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNyQyxDQUFDO0FBQ0YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLE1BQU0sQ0FBQyxHQUFXO0lBQ2pDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNwQixPQUFPO0lBQ1IsQ0FBQztJQUVELElBQUksZUFBZSxDQUFDLFdBQVcsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUN6QyxHQUFHLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDaEMsYUFBYSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNyQyxDQUFDO1NBQU0sQ0FBQztRQUNQLEdBQUcsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDL0IsYUFBYSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsTUFBbUIsRUFBRSxHQUFXO0lBQ3RELEdBQUcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdEIsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLGtCQUFrQixFQUFFLENBQUM7UUFDckMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDekMsQ0FBQztJQUNELE1BQU0sQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDO0lBRXpCLDJHQUEyRztJQUMzRyxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxRQUFRLENBQUM7SUFDbkMsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO0FBQ3JDLENBQUMifQ==