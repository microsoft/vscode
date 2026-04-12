/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// ------ internal util
export var _util;
(function (_util) {
    _util.serviceIds = new Map();
    _util.DI_TARGET = '$di$target';
    _util.DI_DEPENDENCIES = '$di$dependencies';
    function getServiceDependencies(ctor) {
        return ctor[_util.DI_DEPENDENCIES] || [];
    }
    _util.getServiceDependencies = getServiceDependencies;
})(_util || (_util = {}));
export const IInstantiationService = createDecorator('instantiationService');
function storeServiceDependency(id, target, index) {
    if (target[_util.DI_TARGET] === target) {
        target[_util.DI_DEPENDENCIES].push({ id, index });
    }
    else {
        target[_util.DI_DEPENDENCIES] = [{ id, index }];
        target[_util.DI_TARGET] = target;
    }
}
/**
 * The *only* valid way to create a {{ServiceIdentifier}}.
 */
export function createDecorator(serviceId) {
    if (_util.serviceIds.has(serviceId)) {
        return _util.serviceIds.get(serviceId);
    }
    const id = function (target, key, index) {
        if (arguments.length !== 3) {
            throw new Error('@IServiceName-decorator can only be used to decorate a parameter');
        }
        storeServiceDependency(id, target, index);
    };
    id.toString = () => serviceId;
    _util.serviceIds.set(serviceId, id);
    return id;
}
export function refineServiceDecorator(serviceIdentifier) {
    return serviceIdentifier;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zdGFudGlhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsdUJBQXVCO0FBRXZCLE1BQU0sS0FBVyxLQUFLLENBZXJCO0FBZkQsV0FBaUIsS0FBSztJQUVSLGdCQUFVLEdBQUcsSUFBSSxHQUFHLEVBQWtDLENBQUM7SUFFdkQsZUFBUyxHQUFHLFlBQVksQ0FBQztJQUN6QixxQkFBZSxHQUFHLGtCQUFrQixDQUFDO0lBRWxELFNBQWdCLHNCQUFzQixDQUFDLElBQW1CO1FBQ3pELE9BQU8sSUFBSSxDQUFDLE1BQUEsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3BDLENBQUM7SUFGZSw0QkFBc0IseUJBRXJDLENBQUE7QUFNRixDQUFDLEVBZmdCLEtBQUssS0FBTCxLQUFLLFFBZXJCO0FBY0QsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsZUFBZSxDQUF3QixzQkFBc0IsQ0FBQyxDQUFDO0FBd0RwRyxTQUFTLHNCQUFzQixDQUFDLEVBQThCLEVBQUUsTUFBZ0IsRUFBRSxLQUFhO0lBQzlGLElBQUssTUFBOEIsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDaEUsTUFBOEIsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDNUUsQ0FBQztTQUFNLENBQUM7UUFDTixNQUE4QixDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDeEUsTUFBOEIsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsTUFBTSxDQUFDO0lBQzNELENBQUM7QUFDRixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsZUFBZSxDQUFJLFNBQWlCO0lBRW5ELElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUNyQyxPQUFPLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBRSxDQUFDO0lBQ3pDLENBQUM7SUFFRCxNQUFNLEVBQUUsR0FBRyxVQUFVLE1BQWdCLEVBQUUsR0FBVyxFQUFFLEtBQWE7UUFDaEUsSUFBSSxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzVCLE1BQU0sSUFBSSxLQUFLLENBQUMsa0VBQWtFLENBQUMsQ0FBQztRQUNyRixDQUFDO1FBQ0Qsc0JBQXNCLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzQyxDQUF5QixDQUFDO0lBRTFCLEVBQUUsQ0FBQyxRQUFRLEdBQUcsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDO0lBRTlCLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwQyxPQUFPLEVBQUUsQ0FBQztBQUNYLENBQUM7QUFFRCxNQUFNLFVBQVUsc0JBQXNCLENBQW1CLGlCQUF3QztJQUNoRyxPQUE2QixpQkFBaUIsQ0FBQztBQUNoRCxDQUFDIn0=