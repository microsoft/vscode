/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../base/common/event.js';
import { isURLDomainTrusted } from '../../../../../platform/url/common/trustedDomains.js';
export class MockTrustedDomainService {
    constructor(_trustedDomains = []) {
        this._trustedDomains = _trustedDomains;
        this.onDidChangeTrustedDomains = Event.None;
    }
    get trustedDomains() {
        return this._trustedDomains;
    }
    isValid(resource) {
        return isURLDomainTrusted(resource, this._trustedDomains);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja1RydXN0ZWREb21haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdXJsL3Rlc3QvYnJvd3Nlci9tb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzVELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE1BQU0sT0FBTyx3QkFBd0I7SUFHcEMsWUFBNkIsa0JBQTRCLEVBQUU7UUFBOUIsb0JBQWUsR0FBZixlQUFlLENBQWU7UUFHbEQsOEJBQXlCLEdBQWdCLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFGN0QsQ0FBQztJQUlELElBQUksY0FBYztRQUNqQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7SUFDN0IsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFhO1FBQ3BCLE9BQU8sa0JBQWtCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUMzRCxDQUFDO0NBQ0QifQ==