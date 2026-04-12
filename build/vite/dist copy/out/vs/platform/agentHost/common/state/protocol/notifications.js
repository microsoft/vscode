/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Reason why authentication is required.
 *
 * @category Protocol Notifications
 */
export var AuthRequiredReason;
(function (AuthRequiredReason) {
    /** The client has not yet authenticated for the resource */
    AuthRequiredReason["Required"] = "required";
    /** A previously valid token has expired or been revoked */
    AuthRequiredReason["Expired"] = "expired";
})(AuthRequiredReason || (AuthRequiredReason = {}));
// ─── Protocol Notifications ──────────────────────────────────────────────────
/**
 * Discriminant values for all protocol notifications.
 *
 * @category Protocol Notifications
 */
export var NotificationType;
(function (NotificationType) {
    NotificationType["SessionAdded"] = "notify/sessionAdded";
    NotificationType["SessionRemoved"] = "notify/sessionRemoved";
    NotificationType["AuthRequired"] = "notify/authRequired";
})(NotificationType || (NotificationType = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvbm90aWZpY2F0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU9oRzs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGtCQUtqQjtBQUxELFdBQWtCLGtCQUFrQjtJQUNuQyw0REFBNEQ7SUFDNUQsMkNBQXFCLENBQUE7SUFDckIsMkRBQTJEO0lBQzNELHlDQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFMaUIsa0JBQWtCLEtBQWxCLGtCQUFrQixRQUtuQztBQUVELGdGQUFnRjtBQUVoRjs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGdCQUlqQjtBQUpELFdBQWtCLGdCQUFnQjtJQUNqQyx3REFBb0MsQ0FBQTtJQUNwQyw0REFBd0MsQ0FBQTtJQUN4Qyx3REFBb0MsQ0FBQTtBQUNyQyxDQUFDLEVBSmlCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFJakMifQ==