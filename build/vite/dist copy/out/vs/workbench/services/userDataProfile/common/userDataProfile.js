/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isUndefined } from '../../../../base/common/types.js';
import { localize, localize2 } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../base/common/uri.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
export const IUserDataProfileService = createDecorator('IUserDataProfileService');
export const IUserDataProfileManagementService = createDecorator('IUserDataProfileManagementService');
export function isUserDataProfileTemplate(thing) {
    const candidate = thing;
    return !!(candidate && typeof candidate === 'object'
        && (isUndefined(candidate.settings) || typeof candidate.settings === 'string')
        && (isUndefined(candidate.globalState) || typeof candidate.globalState === 'string')
        && (isUndefined(candidate.extensions) || typeof candidate.extensions === 'string')
        && (isUndefined(candidate.mcp) || typeof candidate.mcp === 'string'));
}
export const PROFILE_URL_AUTHORITY = 'profile';
export function toUserDataProfileUri(path, productService) {
    return URI.from({
        scheme: productService.urlProtocol,
        authority: PROFILE_URL_AUTHORITY,
        path: path.startsWith('/') ? path : `/${path}`
    });
}
export const PROFILE_URL_AUTHORITY_PREFIX = 'profile-';
export function isProfileURL(uri) {
    return uri.authority === PROFILE_URL_AUTHORITY || new RegExp(`^${PROFILE_URL_AUTHORITY_PREFIX}`).test(uri.authority);
}
export const IUserDataProfileImportExportService = createDecorator('IUserDataProfileImportExportService');
export const defaultUserDataProfileIcon = registerIcon('defaultProfile-icon', Codicon.settings, localize('defaultProfileIcon', 'Icon for Default Profile.'));
export const PROFILES_TITLE = localize2('profiles', 'Profiles');
export const PROFILES_CATEGORY = { ...PROFILES_TITLE };
export const PROFILE_EXTENSION = 'code-profile';
export const PROFILE_FILTER = [{ name: localize('profile', "Profile"), extensions: [PROFILE_EXTENSION] }];
export const CURRENT_PROFILE_CONTEXT = new RawContextKey('currentProfile', '');
export const IS_CURRENT_PROFILE_TRANSIENT_CONTEXT = new RawContextKey('isCurrentProfileTransient', false);
export const HAS_PROFILES_CONTEXT = new RawContextKey('hasProfiles', false);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFZOUQsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsZUFBZSxDQUEwQix5QkFBeUIsQ0FBQyxDQUFDO0FBYTNHLE1BQU0sQ0FBQyxNQUFNLGlDQUFpQyxHQUFHLGVBQWUsQ0FBb0MsbUNBQW1DLENBQUMsQ0FBQztBQTBCekksTUFBTSxVQUFVLHlCQUF5QixDQUFDLEtBQWM7SUFDdkQsTUFBTSxTQUFTLEdBQUcsS0FBNkMsQ0FBQztJQUVoRSxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxPQUFPLFNBQVMsS0FBSyxRQUFRO1dBQ2hELENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLFNBQVMsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDO1dBQzNFLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxPQUFPLFNBQVMsQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDO1dBQ2pGLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsSUFBSSxPQUFPLFNBQVMsQ0FBQyxVQUFVLEtBQUssUUFBUSxDQUFDO1dBQy9FLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLFNBQVMsQ0FBQyxHQUFHLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztBQUN4RSxDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsU0FBUyxDQUFDO0FBQy9DLE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxJQUFZLEVBQUUsY0FBK0I7SUFDakYsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ2YsTUFBTSxFQUFFLGNBQWMsQ0FBQyxXQUFXO1FBQ2xDLFNBQVMsRUFBRSxxQkFBcUI7UUFDaEMsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUU7S0FDOUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLFVBQVUsQ0FBQztBQUN2RCxNQUFNLFVBQVUsWUFBWSxDQUFDLEdBQVE7SUFDcEMsT0FBTyxHQUFHLENBQUMsU0FBUyxLQUFLLHFCQUFxQixJQUFJLElBQUksTUFBTSxDQUFDLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDdEgsQ0FBQztBQWFELE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLGVBQWUsQ0FBc0MscUNBQXFDLENBQUMsQ0FBQztBQWdEL0ksTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsWUFBWSxDQUFDLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLDJCQUEyQixDQUFDLENBQUMsQ0FBQztBQUU3SixNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNoRSxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxFQUFFLEdBQUcsY0FBYyxFQUFFLENBQUM7QUFDdkQsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsY0FBYyxDQUFDO0FBQ2hELE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDMUcsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxhQUFhLENBQVMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDdkYsTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsSUFBSSxhQUFhLENBQVUsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbkgsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxhQUFhLENBQVUsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDIn0=