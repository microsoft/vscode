/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
export var Extensions;
(function (Extensions) {
    Extensions.ExtensionFeaturesRegistry = 'workbench.registry.extensionFeatures';
})(Extensions || (Extensions = {}));
export const IExtensionFeaturesManagementService = createDecorator('IExtensionFeaturesManagementService');
class ExtensionFeaturesRegistry {
    constructor() {
        this.extensionFeatures = new Map();
    }
    registerExtensionFeature(descriptor) {
        if (this.extensionFeatures.has(descriptor.id)) {
            throw new Error(`Extension feature with id '${descriptor.id}' already exists`);
        }
        this.extensionFeatures.set(descriptor.id, descriptor);
        return {
            dispose: () => this.extensionFeatures.delete(descriptor.id)
        };
    }
    getExtensionFeature(id) {
        return this.extensionFeatures.get(id);
    }
    getExtensionFeatures() {
        return Array.from(this.extensionFeatures.values());
    }
}
Registry.add(Extensions.ExtensionFeaturesRegistry, new ExtensionFeaturesRegistry());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRmVhdHVyZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQVM1RSxNQUFNLEtBQVcsVUFBVSxDQUUxQjtBQUZELFdBQWlCLFVBQVU7SUFDYixvQ0FBeUIsR0FBRyxzQ0FBc0MsQ0FBQztBQUNqRixDQUFDLEVBRmdCLFVBQVUsS0FBVixVQUFVLFFBRTFCO0FBb0VELE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLGVBQWUsQ0FBc0MscUNBQXFDLENBQUMsQ0FBQztBQWlCL0ksTUFBTSx5QkFBeUI7SUFBL0I7UUFFa0Isc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQXVDLENBQUM7SUFtQnJGLENBQUM7SUFqQkEsd0JBQXdCLENBQUMsVUFBdUM7UUFDL0QsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQy9DLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLFVBQVUsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDaEYsQ0FBQztRQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN0RCxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztTQUMzRCxDQUFDO0lBQ0gsQ0FBQztJQUVELG1CQUFtQixDQUFDLEVBQVU7UUFDN0IsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxvQkFBb0I7UUFDbkIsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7Q0FDRDtBQUVELFFBQVEsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLHlCQUF5QixFQUFFLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDIn0=