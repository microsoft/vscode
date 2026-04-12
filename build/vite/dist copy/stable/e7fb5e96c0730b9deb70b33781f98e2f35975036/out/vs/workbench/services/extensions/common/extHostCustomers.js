/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function extHostNamedCustomer(id) {
    return function (ctor) {
        ExtHostCustomersRegistryImpl.INSTANCE.registerNamedCustomer(id, ctor);
    };
}
export function extHostCustomer(ctor) {
    ExtHostCustomersRegistryImpl.INSTANCE.registerCustomer(ctor);
}
export var ExtHostCustomersRegistry;
(function (ExtHostCustomersRegistry) {
    function getNamedCustomers() {
        return ExtHostCustomersRegistryImpl.INSTANCE.getNamedCustomers();
    }
    ExtHostCustomersRegistry.getNamedCustomers = getNamedCustomers;
    function getCustomers() {
        return ExtHostCustomersRegistryImpl.INSTANCE.getCustomers();
    }
    ExtHostCustomersRegistry.getCustomers = getCustomers;
})(ExtHostCustomersRegistry || (ExtHostCustomersRegistry = {}));
class ExtHostCustomersRegistryImpl {
    static { this.INSTANCE = new ExtHostCustomersRegistryImpl(); }
    constructor() {
        this._namedCustomers = [];
        this._customers = [];
    }
    registerNamedCustomer(id, ctor) {
        const entry = [id, ctor];
        this._namedCustomers.push(entry);
    }
    getNamedCustomers() {
        return this._namedCustomers;
    }
    registerCustomer(ctor) {
        this._customers.push(ctor);
    }
    getCustomers() {
        return this._customers;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEN1c3RvbWVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBd0JoRyxNQUFNLFVBQVUsb0JBQW9CLENBQXdCLEVBQXNCO0lBQ2pGLE9BQU8sVUFBNkMsSUFBaUU7UUFDcEgsNEJBQTRCLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLEVBQUUsRUFBRSxJQUErQixDQUFDLENBQUM7SUFDbEcsQ0FBQyxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxlQUFlLENBQTJELElBQWlFO0lBQzFKLDRCQUE0QixDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUErQixDQUFDLENBQUM7QUFDekYsQ0FBQztBQUVELE1BQU0sS0FBVyx3QkFBd0IsQ0FTeEM7QUFURCxXQUFpQix3QkFBd0I7SUFFeEMsU0FBZ0IsaUJBQWlCO1FBQ2hDLE9BQU8sNEJBQTRCLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDbEUsQ0FBQztJQUZlLDBDQUFpQixvQkFFaEMsQ0FBQTtJQUVELFNBQWdCLFlBQVk7UUFDM0IsT0FBTyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDN0QsQ0FBQztJQUZlLHFDQUFZLGVBRTNCLENBQUE7QUFDRixDQUFDLEVBVGdCLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFTeEM7QUFFRCxNQUFNLDRCQUE0QjthQUVWLGFBQVEsR0FBRyxJQUFJLDRCQUE0QixFQUFFLENBQUM7SUFLckU7UUFDQyxJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRU0scUJBQXFCLENBQXdCLEVBQXNCLEVBQUUsSUFBNkI7UUFDeEcsTUFBTSxLQUFLLEdBQTZCLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFDTSxpQkFBaUI7UUFDdkIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0lBQzdCLENBQUM7SUFFTSxnQkFBZ0IsQ0FBd0IsSUFBNkI7UUFDM0UsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUNNLFlBQVk7UUFDbEIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3hCLENBQUMifQ==