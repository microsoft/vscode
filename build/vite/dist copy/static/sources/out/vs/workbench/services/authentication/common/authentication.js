import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
/**
 * Use this if you don't want the onDidChangeSessions event to fire in the extension host
 */
export const INTERNAL_AUTH_PROVIDER_PREFIX = '__';
export function isAuthenticationWwwAuthenticateRequest(obj) {
    return typeof obj === 'object'
        && obj !== null
        && 'wwwAuthenticate' in obj
        && (typeof obj.wwwAuthenticate === 'string');
}
export const IAuthenticationService = createDecorator('IAuthenticationService');
export function isAuthenticationSession(thing) {
    if (typeof thing !== 'object' || !thing) {
        return false;
    }
    const maybe = thing;
    if (typeof maybe.id !== 'string') {
        return false;
    }
    if (typeof maybe.accessToken !== 'string') {
        return false;
    }
    if (typeof maybe.account !== 'object' || !maybe.account) {
        return false;
    }
    if (typeof maybe.account.label !== 'string') {
        return false;
    }
    if (typeof maybe.account.id !== 'string') {
        return false;
    }
    if (!Array.isArray(maybe.scopes)) {
        return false;
    }
    if (maybe.idToken && typeof maybe.idToken !== 'string') {
        return false;
    }
    return true;
}
// TODO: Move this into MainThreadAuthentication
export const IAuthenticationExtensionsService = createDecorator('IAuthenticationExtensionsService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQVFBLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3Rjs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLElBQUksQ0FBQztBQWtFbEQsTUFBTSxVQUFVLHNDQUFzQyxDQUFDLEdBQVk7SUFDbEUsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRO1dBQzFCLEdBQUcsS0FBSyxJQUFJO1dBQ1osaUJBQWlCLElBQUksR0FBRztXQUN4QixDQUFDLE9BQU8sR0FBRyxDQUFDLGVBQWUsS0FBSyxRQUFRLENBQUMsQ0FBQztBQUMvQyxDQUFDO0FBK0RELE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGVBQWUsQ0FBeUIsd0JBQXdCLENBQUMsQ0FBQztBQWlJeEcsTUFBTSxVQUFVLHVCQUF1QixDQUFDLEtBQWM7SUFDckQsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN6QyxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxNQUFNLEtBQUssR0FBRyxLQUE4QixDQUFDO0lBQzdDLElBQUksT0FBTyxLQUFLLENBQUMsRUFBRSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksT0FBTyxLQUFLLENBQUMsV0FBVyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzNDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksT0FBTyxLQUFLLENBQUMsT0FBTyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN6RCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxJQUFJLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDN0MsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzFDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQ2xDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxPQUFPLEtBQUssQ0FBQyxPQUFPLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDeEQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsZ0RBQWdEO0FBQ2hELE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLGVBQWUsQ0FBbUMsa0NBQWtDLENBQUMsQ0FBQyJ9