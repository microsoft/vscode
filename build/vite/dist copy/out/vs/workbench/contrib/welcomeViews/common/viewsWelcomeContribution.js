/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ViewIdentifierMap } from './viewsWelcomeExtensionPoint.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
export class ViewsWelcomeContribution extends Disposable {
    constructor(extensionPoint) {
        super();
        this.viewWelcomeContents = new Map();
        extensionPoint.setHandler((_, { added, removed }) => {
            for (const contribution of removed) {
                for (const welcome of contribution.value) {
                    const disposable = this.viewWelcomeContents.get(welcome);
                    disposable?.dispose();
                }
            }
            const welcomesByViewId = new Map();
            for (const contribution of added) {
                for (const welcome of contribution.value) {
                    const { group, order } = parseGroupAndOrder(welcome, contribution);
                    const precondition = ContextKeyExpr.deserialize(welcome.enablement);
                    const id = ViewIdentifierMap[welcome.view] ?? welcome.view;
                    let viewContentMap = welcomesByViewId.get(id);
                    if (!viewContentMap) {
                        viewContentMap = new Map();
                        welcomesByViewId.set(id, viewContentMap);
                    }
                    viewContentMap.set(welcome, {
                        content: welcome.contents,
                        when: ContextKeyExpr.deserialize(welcome.when),
                        precondition,
                        group,
                        order
                    });
                }
            }
            for (const [id, viewContentMap] of welcomesByViewId) {
                const disposables = viewsRegistry.registerViewWelcomeContent2(id, viewContentMap);
                for (const [welcome, disposable] of disposables) {
                    this.viewWelcomeContents.set(welcome, disposable);
                }
            }
        });
    }
}
function parseGroupAndOrder(welcome, contribution) {
    let group;
    let order;
    if (welcome.group) {
        if (!isProposedApiEnabled(contribution.description, 'contribViewsWelcome')) {
            contribution.collector.warn(nls.localize('ViewsWelcomeExtensionPoint.proposedAPI', "The viewsWelcome contribution in '{0}' requires 'enabledApiProposals: [\"contribViewsWelcome\"]' in order to use the 'group' proposed property.", contribution.description.identifier.value));
            return { group, order };
        }
        const idx = welcome.group.lastIndexOf('@');
        if (idx > 0) {
            group = welcome.group.substr(0, idx);
            order = Number(welcome.group.substr(idx + 1)) || undefined;
        }
        else {
            group = welcome.group;
        }
    }
    return { group, order };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3NXZWxjb21lQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZVZpZXdzL2NvbW1vbi92aWV3c1dlbGNvbWVDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3RGLE9BQU8sRUFBMkMsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSx1QkFBdUIsRUFBMEMsTUFBTSwwQkFBMEIsQ0FBQztBQUN6SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV6RixNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFpQix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUV6RixNQUFNLE9BQU8sd0JBQXlCLFNBQVEsVUFBVTtJQUl2RCxZQUFZLGNBQTJEO1FBQ3RFLEtBQUssRUFBRSxDQUFDO1FBSEQsd0JBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQTRCLENBQUM7UUFLakUsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO1lBQ25ELEtBQUssTUFBTSxZQUFZLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ3BDLEtBQUssTUFBTSxPQUFPLElBQUksWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUMxQyxNQUFNLFVB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