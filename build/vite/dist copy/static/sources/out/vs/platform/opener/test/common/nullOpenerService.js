/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
export const NullOpenerService = Object.freeze({
    _serviceBrand: undefined,
    registerOpener() { return Disposable.None; },
    registerValidator() { return Disposable.None; },
    registerExternalUriResolver() { return Disposable.None; },
    setDefaultExternalOpener() { },
    registerExternalOpener() { return Disposable.None; },
    async open() { return false; },
    async resolveExternalUri(uri) { return { resolved: uri, dispose() { } }; },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnVsbE9wZW5lclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9vcGVuZXIvdGVzdC9jb21tb24vbnVsbE9wZW5lclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBSWxFLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQWlCO0lBQzlELGFBQWEsRUFBRSxTQUFTO0lBQ3hCLGNBQWMsS0FBSyxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzVDLGlCQUFpQixLQUFLLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0MsMkJBQTJCLEtBQUssT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN6RCx3QkFBd0IsS0FBSyxDQUFDO0lBQzlCLHNCQUFzQixLQUFLLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDcEQsS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDOUIsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEdBQVEsSUFBSSxPQUFPLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxPQUFPLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0NBQy9FLENBQUMsQ0FBQyJ9