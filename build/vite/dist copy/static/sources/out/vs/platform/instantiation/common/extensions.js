/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SyncDescriptor } from './descriptors.js';
const _registry = [];
export var InstantiationType;
(function (InstantiationType) {
    /**
     * Instantiate this service as soon as a consumer depends on it. _Note_ that this
     * is more costly as some upfront work is done that is likely not needed
     */
    InstantiationType[InstantiationType["Eager"] = 0] = "Eager";
    /**
     * Instantiate this service as soon as a consumer uses it. This is the _better_
     * way of registering a service.
     */
    InstantiationType[InstantiationType["Delayed"] = 1] = "Delayed";
})(InstantiationType || (InstantiationType = {}));
export function registerSingleton(id, ctorOrDescriptor, supportsDelayedInstantiation) {
    if (!(ctorOrDescriptor instanceof SyncDescriptor)) {
        ctorOrDescriptor = new SyncDescriptor(ctorOrDescriptor, [], Boolean(supportsDelayedInstantiation));
    }
    _registry.push([id, ctorOrDescriptor]);
}
export function getSingletonServiceDescriptors() {
    return _registry;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBR2xELE1BQU0sU0FBUyxHQUFvRCxFQUFFLENBQUM7QUFFdEUsTUFBTSxDQUFOLElBQWtCLGlCQVlqQjtBQVpELFdBQWtCLGlCQUFpQjtJQUNsQzs7O09BR0c7SUFDSCwyREFBUyxDQUFBO0lBRVQ7OztPQUdHO0lBQ0gsK0RBQVcsQ0FBQTtBQUNaLENBQUMsRUFaaUIsaUJBQWlCLEtBQWpCLGlCQUFpQixRQVlsQztBQUlELE1BQU0sVUFBVSxpQkFBaUIsQ0FBdUMsRUFBd0IsRUFBRSxnQkFBeUUsRUFBRSw0QkFBMEQ7SUFDdE8sSUFBSSxDQUFDLENBQUMsZ0JBQWdCLFlBQVksY0FBYyxDQUFDLEVBQUUsQ0FBQztRQUNuRCxnQkFBZ0IsR0FBRyxJQUFJLGNBQWMsQ0FBSSxnQkFBaUQsRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFDLDRCQUE0QixDQUFDLENBQUMsQ0FBQztJQUN4SSxDQUFDO0lBRUQsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFDeEMsQ0FBQztBQUVELE1BQU0sVUFBVSw4QkFBOEI7SUFDN0MsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQyJ9