/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IEncryptionService = createDecorator('encryptionService');
export const IEncryptionMainService = createDecorator('encryptionMainService');
// The values provided to the `password-store` command line switch.
// Notice that they are not the same as the values returned by
// `getSelectedStorageBackend` in the `safeStorage` API.
export var PasswordStoreCLIOption;
(function (PasswordStoreCLIOption) {
    PasswordStoreCLIOption["kwallet"] = "kwallet";
    PasswordStoreCLIOption["kwallet5"] = "kwallet5";
    PasswordStoreCLIOption["gnomeLibsecret"] = "gnome-libsecret";
    PasswordStoreCLIOption["basic"] = "basic";
})(PasswordStoreCLIOption || (PasswordStoreCLIOption = {}));
// The values returned by `getSelectedStorageBackend` in the `safeStorage` API.
export var KnownStorageProvider;
(function (KnownStorageProvider) {
    KnownStorageProvider["unknown"] = "unknown";
    KnownStorageProvider["basicText"] = "basic_text";
    // Linux
    KnownStorageProvider["gnomeAny"] = "gnome_any";
    KnownStorageProvider["gnomeLibsecret"] = "gnome_libsecret";
    KnownStorageProvider["gnomeKeyring"] = "gnome_keyring";
    KnownStorageProvider["kwallet"] = "kwallet";
    KnownStorageProvider["kwallet5"] = "kwallet5";
    KnownStorageProvider["kwallet6"] = "kwallet6";
    // The rest of these are not returned by `getSelectedStorageBackend`
    // but these were added for platform completeness.
    // Windows
    KnownStorageProvider["dplib"] = "dpapi";
    // macOS
    KnownStorageProvider["keychainAccess"] = "keychain_access";
})(KnownStorageProvider || (KnownStorageProvider = {}));
export function isKwallet(backend) {
    return backend === "kwallet" /* KnownStorageProvider.kwallet */
        || backend === "kwallet5" /* KnownStorageProvider.kwallet5 */
        || backend === "kwallet6" /* KnownStorageProvider.kwallet6 */;
}
export function isGnome(backend) {
    return backend === "gnome_any" /* KnownStorageProvider.gnomeAny */
        || backend === "gnome_libsecret" /* KnownStorageProvider.gnomeLibsecret */
        || backend === "gnome_keyring" /* KnownStorageProvider.gnomeKeyring */;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jcnlwdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9lbmNyeXB0aW9uL2NvbW1vbi9lbmNyeXB0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFxQixtQkFBbUIsQ0FBQyxDQUFDO0FBTTNGLE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGVBQWUsQ0FBeUIsdUJBQXVCLENBQUMsQ0FBQztBQWN2RyxtRUFBbUU7QUFDbkUsOERBQThEO0FBQzlELHdEQUF3RDtBQUN4RCxNQUFNLENBQU4sSUFBa0Isc0JBS2pCO0FBTEQsV0FBa0Isc0JBQXNCO0lBQ3ZDLDZDQUFtQixDQUFBO0lBQ25CLCtDQUFxQixDQUFBO0lBQ3JCLDREQUFrQyxDQUFBO0lBQ2xDLHlDQUFlLENBQUE7QUFDaEIsQ0FBQyxFQUxpQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBS3ZDO0FBRUQsK0VBQStFO0FBQy9FLE1BQU0sQ0FBTixJQUFrQixvQkFvQmpCO0FBcEJELFdBQWtCLG9CQUFvQjtJQUNyQywyQ0FBbUIsQ0FBQTtJQUNuQixnREFBd0IsQ0FBQTtJQUV4QixRQUFRO0lBQ1IsOENBQXNCLENBQUE7SUFDdEIsMERBQWtDLENBQUE7SUFDbEMsc0RBQThCLENBQUE7SUFDOUIsMkNBQW1CLENBQUE7SUFDbkIsNkNBQXFCLENBQUE7SUFDckIsNkNBQXFCLENBQUE7SUFFckIsb0VBQW9FO0lBQ3BFLGtEQUFrRDtJQUVsRCxVQUFVO0lBQ1YsdUNBQWUsQ0FBQTtJQUVmLFFBQVE7SUFDUiwwREFBa0MsQ0FBQTtBQUNuQyxDQUFDLEVBcEJpQixvQkFBb0IsS0FBcEIsb0JBQW9CLFFBb0JyQztBQUVELE1BQU0sVUFBVSxTQUFTLENBQUMsT0FBZTtJQUN4QyxPQUFPLE9BQU8saURBQWlDO1dBQzNDLE9BQU8sbURBQWtDO1dBQ3pDLE9BQU8sbURBQWtDLENBQUM7QUFDL0MsQ0FBQztBQUVELE1BQU0sVUFBVSxPQUFPLENBQUMsT0FBZTtJQUN0QyxPQUFPLE9BQU8sb0RBQWtDO1dBQzVDLE9BQU8sZ0VBQXdDO1dBQy9DLE9BQU8sNERBQXNDLENBQUM7QUFDbkQsQ0FBQyJ9