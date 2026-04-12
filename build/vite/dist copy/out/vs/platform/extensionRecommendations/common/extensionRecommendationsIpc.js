/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class ExtensionRecommendationNotificationServiceChannelClient {
    constructor(channel) {
        this.channel = channel;
    }
    get ignoredRecommendations() { throw new Error('not supported'); }
    promptImportantExtensionsInstallNotification(extensionRecommendations) {
        return this.channel.call('promptImportantExtensionsInstallNotification', [extensionRecommendations]);
    }
    promptWorkspaceRecommendations(recommendations) {
        throw new Error('not supported');
    }
    hasToIgnoreRecommendationNotifications() {
        throw new Error('not supported');
    }
}
export class ExtensionRecommendationNotificationServiceChannel {
    constructor(service) {
        this.service = service;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen(_, event) {
        throw new Error(`Event not found: ${event}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call(_, command, args) {
        switch (command) {
            case 'promptImportantExtensionsInstallNotification': return this.service.promptImportantExtensionsInstallNotification(args[0]);
        }
        throw new Error(`Call not found: ${command}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsTUFBTSxPQUFPLHVEQUF1RDtJQUluRSxZQUE2QixPQUFpQjtRQUFqQixZQUFPLEdBQVAsT0FBTyxDQUFVO0lBQUksQ0FBQztJQUVuRCxJQUFJLHNCQUFzQixLQUFlLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTVFLDRDQUE0QyxDQUFDLHdCQUFtRDtRQUMvRixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO0lBQ3RHLENBQUM7SUFFRCw4QkFBOEIsQ0FBQyxlQUF5QjtRQUN2RCxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxzQ0FBc0M7UUFDckMsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUNsQyxDQUFDO0NBRUQ7QUFFRCxNQUFNLE9BQU8saURBQWlEO0lBRTdELFlBQW9CLE9BQW9EO1FBQXBELFlBQU8sR0FBUCxPQUFPLENBQTZDO0lBQUksQ0FBQztJQUU3RSw4REFBOEQ7SUFDOUQsTUFBTSxDQUFDLENBQVUsRUFBRSxLQUFhO1FBQy9CLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELDhEQUE4RDtJQUM5RCxJQUFJLENBQUMsQ0FBVSxFQUFFLE9BQWUsRUFBRSxJQUFVO1FBQzNDLFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyw4Q0FBOEMsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyw0Q0FBNEMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoSSxDQUFDO1FBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUMvQyxDQUFDO0NBQ0QifQ==