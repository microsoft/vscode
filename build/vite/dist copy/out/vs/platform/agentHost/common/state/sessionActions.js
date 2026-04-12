/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Action and notification types for the sessions process protocol.
// Re-exports from the auto-generated protocol layer with local aliases.
//
// VS Code-specific additions:
//   - IToolCallStartAction extends protocol with `toolKind` and `language`
//   - isRootAction / isSessionAction type guards
//   - INotification alias for IProtocolNotification
// ---- Re-exports from protocol -----------------------------------------------
export { ActionType, } from './protocol/actions.js';
export { NotificationType, AuthRequiredReason, } from './protocol/notifications.js';
// ---- Type guards ------------------------------------------------------------
export function isRootAction(action) {
    return action.type.startsWith('root/');
}
export function isSessionAction(action) {
    return action.type.startsWith('session/');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLG1FQUFtRTtBQUNuRSx3RUFBd0U7QUFDeEUsRUFBRTtBQUNGLDhCQUE4QjtBQUM5QiwyRUFBMkU7QUFDM0UsaURBQWlEO0FBQ2pELG9EQUFvRDtBQUVwRCxnRkFBZ0Y7QUFFaEYsT0FBTyxFQUNOLFVBQVUsR0FrQ1YsTUFBTSx1QkFBdUIsQ0FBQztBQUUvQixPQUFPLEVBQ04sZ0JBQWdCLEVBQ2hCLGtCQUFrQixHQUlsQixNQUFNLDZCQUE2QixDQUFDO0FBdUVyQyxnRkFBZ0Y7QUFFaEYsTUFBTSxVQUFVLFlBQVksQ0FBQyxNQUFvQjtJQUNoRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3hDLENBQUM7QUFFRCxNQUFNLFVBQVUsZUFBZSxDQUFDLE1BQW9CO0lBQ25ELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDM0MsQ0FBQyJ9