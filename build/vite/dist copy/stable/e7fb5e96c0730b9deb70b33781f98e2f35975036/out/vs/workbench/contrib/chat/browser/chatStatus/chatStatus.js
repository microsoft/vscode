/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
export function isNewUser(chatEntitlementService) {
    return !chatEntitlementService.sentiment.completed || // setup not completed
        chatEntitlementService.entitlement === ChatEntitlement.Available; // not yet signed up to chat
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN0YXR1cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL2NoYXRTdGF0dXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBMkIsTUFBTSw0REFBNEQsQ0FBQztBQUV0SCxNQUFNLFVBQVUsU0FBUyxDQUFDLHNCQUErQztJQUN4RSxPQUFPLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLFNBQVMsSUFBUSxzQkFBc0I7UUFDL0Usc0JBQXNCLENBQUMsV0FBVyxLQUFLLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyw0QkFBNEI7QUFDaEcsQ0FBQyJ9