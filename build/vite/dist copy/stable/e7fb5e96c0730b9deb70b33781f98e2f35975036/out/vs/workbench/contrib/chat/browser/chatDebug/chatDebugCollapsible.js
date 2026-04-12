/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
/**
 * Wire up a collapsible toggle on a chevron+header+content triple.
 * Handles icon switching and display toggling.
 */
export function setupCollapsibleToggle(chevron, header, contentEl, disposables, initiallyCollapsed = false, scrollable) {
    let collapsed = initiallyCollapsed;
    // Accessibility: make header keyboard-focusable and expose toggle semantics
    header.tabIndex = 0;
    header.role = 'button';
    chevron.setAttribute('aria-hidden', 'true');
    const updateState = () => {
        DOM.clearNode(chevron);
        const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
        chevron.classList.add(...ThemeIcon.asClassName(icon).split(' '));
        contentEl.style.display = collapsed ? 'none' : 'block';
        header.style.borderRadius = collapsed ? '' : '3px 3px 0 0';
        header.setAttribute('aria-expanded', String(!collapsed));
    };
    updateState();
    disposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => {
        collapsed = !collapsed;
        chevron.className = 'chat-debug-message-section-chevron';
        updateState();
        scrollable?.scanDomNode();
    }));
    disposables.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            header.click();
        }
    }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnQ29sbGFwc2libGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z0NvbGxhcHNpYmxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVwRTs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsT0FBb0IsRUFBRSxNQUFtQixFQUFFLFNBQXNCLEVBQUUsV0FBNEIsRUFBRSxxQkFBOEIsS0FBSyxFQUFFLFVBQW9DO0lBQ2hOLElBQUksU0FBUyxHQUFHLGtCQUFrQixDQUFDO0lBRW5DLDRFQUE0RTtJQUM1RSxNQUFNLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUNwQixNQUFNLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztJQUN2QixPQUFPLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUU1QyxNQUFNLFdBQVcsR0FBRyxHQUFHLEVBQUU7UUFDeEIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QixNQUFNLElBQUksR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7UUFDcEUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDdkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQztRQUMzRCxNQUFNLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQztJQUVGLFdBQVcsRUFBRSxDQUFDO0lBRWQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRTtRQUMzRSxTQUFTLEdBQUcsQ0FBQyxTQUFTLENBQUM7UUFDdkIsT0FBTyxDQUFDLFNBQVMsR0FBRyxvQ0FBb0MsQ0FBQztRQUN6RCxXQUFXLEVBQUUsQ0FBQztRQUNkLFVBQVUsRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBZ0IsRUFBRSxFQUFFO1FBQzlGLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUN4QyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDbkIsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2hCLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyJ9