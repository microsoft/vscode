/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class TextAreaEditContextRegistryImpl {
    constructor() {
        this._textAreaEditContextMapping = new Map();
    }
    register(ownerID, textAreaEditContext) {
        this._textAreaEditContextMapping.set(ownerID, textAreaEditContext);
        return {
            dispose: () => {
                this._textAreaEditContextMapping.delete(ownerID);
            }
        };
    }
    get(ownerID) {
        return this._textAreaEditContextMapping.get(ownerID);
    }
}
export const TextAreaEditContextRegistry = new TextAreaEditContextRegistryImpl();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEFyZWFFZGl0Q29udGV4dFJlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC90ZXh0QXJlYS90ZXh0QXJlYUVkaXRDb250ZXh0UmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsTUFBTSwrQkFBK0I7SUFBckM7UUFFUyxnQ0FBMkIsR0FBcUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQWNuRixDQUFDO0lBWkEsUUFBUSxDQUFDLE9BQWUsRUFBRSxtQkFBd0M7UUFDakUsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUNuRSxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixJQUFJLENBQUMsMkJBQTJCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xELENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUVELEdBQUcsQ0FBQyxPQUFlO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLCtCQUErQixFQUFFLENBQUMifQ==