/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
/**
 * Widget that displays site security information (e.g. certificate errors)
 * as an indicator button inside the URL bar, with a hover popover for details.
 */
let SiteInfoWidget = class SiteInfoWidget extends Disposable {
    constructor(parent, editor, hoverService) {
        super();
        this.editor = editor;
        this.hoverService = hoverService;
        this._container = $('.browser-site-info-container');
        this._container.style.display = 'none';
        this._indicator = $('.browser-site-info-indicator');
        this._indicator.tabIndex = 0;
        this._indicator.role = 'button';
        this._indicator.ariaLabel = localize('browser.notSecure', "Not Secure");
        this._indicator.appendChild(renderIcon(Codicon.workspaceUntrusted));
        this._container.appendChild(this._indicator);
        parent.appendChild(this._container);
        this._register(addDisposableListener(this._indicator, EventType.CLICK, () => this._showHover()));
        this._register(addDisposableListener(this._indicator, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._showHover();
            }
        }));
    }
    /**
     * Update visibility and state from a certificate error (or lack thereof).
     */
    setCertificateError(certError) {
        this._container.style.display = certError ? '' : 'none';
    }
    _showHover() {
        const certError = this.editor.getCertificateError();
        if (!certError) {
            return;
        }
        const content = document.createElement('div');
        content.classList.add('browser-site-info-hover-content');
        const heading = document.createElement('div');
        heading.classList.add('browser-site-info-hover-heading');
        heading.textContent = localize('browser.certHoverHeading', "Certificate Not Trusted");
        content.appendChild(heading);
        const detail1 = document.createElement('div');
        detail1.classList.add('browser-site-info-hover-detail');
        detail1.textContent = localize('browser.certHoverDetail1', "Your connection to this site is not secure.");
        content.appendChild(detail1);
        if (certError.hasTrustedException) {
            const detail2 = document.createElement('div');
            detail2.classList.add('browser-site-info-hover-detail');
            detail2.textContent = localize('browser.certHoverDetail2', "You previously chose to proceed to '{0}' despite a certificate error ({1}).", certError.host, certError.error);
            content.appendChild(detail2);
            const revokeLink = document.createElement('a');
            revokeLink.classList.add('browser-site-info-hover-revoke');
            revokeLink.textContent = localize('browser.certRevoke', "Revoke and Close");
            revokeLink.role = 'button';
            revokeLink.tabIndex = 0;
            revokeLink.addEventListener('click', () => {
                hover?.dispose();
                this.editor.revokeAndClose(certError);
            });
            revokeLink.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    hover?.dispose();
                    this.editor.revokeAndClose(certError);
                }
            });
            content.appendChild(revokeLink);
        }
        const hover = this.hoverService.showInstantHover({
            content,
            target: this._indicator,
            container: this._container,
            position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
            persistence: { sticky: true }
        }, true);
    }
};
SiteInfoWidget = __decorate([
    __param(2, IHoverService)
], SiteInfoWidget);
export { SiteInfoWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2l0ZUluZm9XaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9lbGVjdHJvbi1icm93c2VyL3NpdGVJbmZvV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUk1RTs7O0dBR0c7QUFDSSxJQUFNLGNBQWMsR0FBcEIsTUFBTSxjQUFlLFNBQVEsVUFBVTtJQUs3QyxZQUNDLE1BQW1CLEVBQ0YsTUFBcUIsRUFDTixZQUEyQjtRQUUzRCxLQUFLLEVBQUUsQ0FBQztRQUhTLFdBQU0sR0FBTixNQUFNLENBQWU7UUFDTixpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUkzRCxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFFdkMsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDN0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN4RSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFcEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqRyxJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQWdCLEVBQUUsRUFBRTtZQUM5RixJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQ3hDLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ25CLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsbUJBQW1CLENBQUMsU0FBbUQ7UUFDdEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDekQsQ0FBQztJQUVPLFVBQVU7UUFDakIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ3BELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUV6RCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDekQsT0FBTyxDQUFDLFdBQVcsR0FBRyxRQUFRLENBQUMsMEJBQTBCLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUN0RixPQUFPLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTdCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztRQUN4RCxPQUFPLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FDN0IsMEJBQTBCLEVBQzFCLDZDQUE2QyxDQUM3QyxDQUFDO1FBQ0YsT0FBTyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU3QixJQUFJLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ25DLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztZQUN4RCxPQUFPLENBQUMsV0FBVyxHQUFHLFFBQVEsQ0FDN0IsMEJBQTBCLEVBQzFCLDZFQUE2RSxFQUM3RSxTQUFTLENBQUMsSUFBSSxFQUNkLFNBQVMsQ0FBQyxLQUFLLENBQ2YsQ0FBQztZQUNGLE9BQU8sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFN0IsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMvQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQzNELFVBQVUsQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLG9CQUFvQixFQUFFLGtCQUFrQixDQUFDLENBQUM7WUFDNUUsVUFBVSxDQUFDLElBQUksR0FBRyxRQUFRLENBQUM7WUFDM0IsVUFBVSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDeEIsVUFBVSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ3pDLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQztnQkFDakIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkMsQ0FBQyxDQUFDLENBQUM7WUFDSCxVQUFVLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQzVDLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztvQkFDeEMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUNuQixLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUM7b0JBQ2pCLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN2QyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSCxPQUFPLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2pDLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDO1lBQ2hELE9BQU87WUFDUCxNQUFNLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDdkIsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzFCLFFBQVEsRUFBRSxFQUFFLGFBQWEsNkJBQXFCLEVBQUU7WUFDaEQsV0FBVyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTtTQUM3QixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ1YsQ0FBQztDQUNELENBQUE7QUFwR1ksY0FBYztJQVF4QixXQUFBLGFBQWEsQ0FBQTtHQVJILGNBQWMsQ0FvRzFCIn0=