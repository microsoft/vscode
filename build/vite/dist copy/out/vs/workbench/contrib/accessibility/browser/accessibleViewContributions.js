/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { accessibleViewIsShown } from './accessibilityConfiguration.js';
import { AccessibilityHelpAction, AccessibleViewAction } from './accessibleViewActions.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
export class AccesibleViewHelpContribution extends Disposable {
    constructor() {
        super();
        this._register(AccessibilityHelpAction.addImplementation(115, 'accessible-view-help', accessor => {
            accessor.get(IAccessibleViewService).showAccessibleViewHelp();
            return true;
        }, accessibleViewIsShown));
    }
}
export class AccesibleViewContributions extends Disposable {
    constructor() {
        super();
        AccessibleViewRegistry.getImplementations().forEach(impl => {
            const implementation = (accessor) => {
                const provider = impl.getProvider(accessor);
                if (!provider) {
                    return false;
                }
                try {
                    accessor.get(IAccessibleViewService).show(provider);
                    return true;
                }
                catch {
                    provider.dispose();
                    return false;
                }
            };
            if (impl.type === "view" /* AccessibleViewType.View */) {
                this._register(AccessibleViewAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
            }
            else {
                this._register(AccessibilityHelpAction.addImplementation(impl.priority, impl.name, implementation, impl.when));
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJsZVZpZXdDb250cmlidXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0YsT0FBTyxFQUEyRSxzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQy9LLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBRzlHLE1BQU0sT0FBTyw2QkFBOEIsU0FBUSxVQUFVO0lBRTVEO1FBQ0MsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxzQkFBc0IsRUFBRSxRQUFRLENBQUMsRUFBRTtZQUNoRyxRQUFRLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUM5RCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7SUFDNUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDBCQUEyQixTQUFRLFVBQVU7SUFFekQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQUNSLHNCQUFzQixDQUFDLGtCQUFrQixFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzFELE1BQU0sY0FBYyxHQUFHLENBQUMsUUFBMEIsRUFBRSxFQUFFO2dCQUNyRCxNQUFNLFFBQVEsR0FBcUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDOUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNmLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsSUFBSSxDQUFDO29CQUNKLFFBQVEsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3BELE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7Z0JBQUMsTUFBTSxDQUFDO29CQUNSLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDbkIsT0FBTyxLQUFLLENBQUM7Z0JBQ2QsQ0FBQztZQUNGLENBQUMsQ0FBQztZQUNGLElBQUksSUFBSSxDQUFDLElBQUkseUNBQTRCLEVBQUUsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzdHLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDaEgsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=