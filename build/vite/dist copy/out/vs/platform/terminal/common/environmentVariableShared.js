/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// This file is shared between the renderer and extension host
export function serializeEnvironmentVariableCollection(collection) {
    return [...collection.entries()];
}
export function serializeEnvironmentDescriptionMap(descriptionMap) {
    return descriptionMap ? [...descriptionMap.entries()] : [];
}
export function deserializeEnvironmentVariableCollection(serializedCollection) {
    return new Map(serializedCollection);
}
export function deserializeEnvironmentDescriptionMap(serializableEnvironmentDescription) {
    return new Map(serializableEnvironmentDescription ?? []);
}
export function serializeEnvironmentVariableCollections(collections) {
    return Array.from(collections.entries()).map(e => {
        return [e[0], serializeEnvironmentVariableCollection(e[1].map), serializeEnvironmentDescriptionMap(e[1].descriptionMap)];
    });
}
export function deserializeEnvironmentVariableCollections(serializedCollection) {
    return new Map(serializedCollection.map(e => {
        return [e[0], { map: deserializeEnvironmentVariableCollection(e[1]), descriptionMap: deserializeEnvironmentDescriptionMap(e[2]) }];
    }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2hhcmVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLDhEQUE4RDtBQUU5RCxNQUFNLFVBQVUsc0NBQXNDLENBQUMsVUFBNEQ7SUFDbEgsT0FBTyxDQUFDLEdBQUcsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDbEMsQ0FBQztBQUVELE1BQU0sVUFBVSxrQ0FBa0MsQ0FBQyxjQUEwRjtJQUM1SSxPQUFPLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDNUQsQ0FBQztBQUVELE1BQU0sVUFBVSx3Q0FBd0MsQ0FDdkQsb0JBQWdFO0lBRWhFLE9BQU8sSUFBSSxHQUFHLENBQXNDLG9CQUFvQixDQUFDLENBQUM7QUFDM0UsQ0FBQztBQUVELE1BQU0sVUFBVSxvQ0FBb0MsQ0FDbkQsa0NBQXNGO0lBRXRGLE9BQU8sSUFBSSxHQUFHLENBQW9ELGtDQUFrQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzdHLENBQUM7QUFFRCxNQUFNLFVBQVUsdUNBQXVDLENBQUMsV0FBZ0U7SUFDdkgsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNoRCxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLHNDQUFzQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUMxSCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLFVBQVUseUNBQXlDLENBQ3hELG9CQUFpRTtJQUVqRSxPQUFPLElBQUksR0FBRyxDQUF5QyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDbkYsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxjQUFjLEVBQUUsb0NBQW9DLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3BJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIn0=