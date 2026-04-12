/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Promises } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
export class UserDataProfileService extends Disposable {
    get currentProfile() { return this._currentProfile; }
    constructor(currentProfile) {
        super();
        this._onDidChangeCurrentProfile = this._register(new Emitter());
        this.onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;
        this._currentProfile = currentProfile;
    }
    async updateCurrentProfile(userDataProfile) {
        if (equals(this._currentProfile, userDataProfile)) {
            return;
        }
        const previous = this._currentProfile;
        this._currentProfile = userDataProfile;
        const joiners = [];
        this._onDidChangeCurrentProfile.fire({
            previous,
            profile: userDataProfile,
            join(promise) {
                joiners.push(promise);
            }
        });
        await Promises.settled(joiners);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBSTVELE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxVQUFVO0lBUXJELElBQUksY0FBYyxLQUF1QixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0lBRXZFLFlBQ0MsY0FBZ0M7UUFFaEMsS0FBSyxFQUFFLENBQUM7UUFUUSwrQkFBMEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFpQyxDQUFDLENBQUM7UUFDbEcsOEJBQXlCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQVMxRSxJQUFJLENBQUMsZUFBZSxHQUFHLGNBQWMsQ0FBQztJQUN2QyxDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQixDQUFDLGVBQWlDO1FBQzNELElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUNuRCxPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7UUFDdEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsTUFBTSxPQUFPLEdBQW9CLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDO1lBQ3BDLFFBQVE7WUFDUixPQUFPLEVBQUUsZUFBZTtZQUN4QixJQUFJLENBQUMsT0FBTztnQkFDWCxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZCLENBQUM7U0FDRCxDQUFDLENBQUM7UUFDSCxNQUFNLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNEIn0=