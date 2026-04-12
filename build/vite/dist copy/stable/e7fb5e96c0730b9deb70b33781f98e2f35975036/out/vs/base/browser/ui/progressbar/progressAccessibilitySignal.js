/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const nullScopedAccessibilityProgressSignalFactory = () => ({
    msLoopTime: -1,
    msDelayTime: -1,
    dispose: () => { },
});
let progressAccessibilitySignalSchedulerFactory = nullScopedAccessibilityProgressSignalFactory;
export function setProgressAccessibilitySignalScheduler(progressAccessibilitySignalScheduler) {
    progressAccessibilitySignalSchedulerFactory = progressAccessibilitySignalScheduler;
}
export function getProgressAccessibilitySignalScheduler(msDelayTime, msLoopTime) {
    return progressAccessibilitySignalSchedulerFactory(msDelayTime, msLoopTime);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzQWNjZXNzaWJpbGl0eVNpZ25hbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxNQUFNLDRDQUE0QyxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDM0QsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUNkLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDZixPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztDQUNsQixDQUFDLENBQUM7QUFDSCxJQUFJLDJDQUEyQyxHQUE2Riw0Q0FBNEMsQ0FBQztBQUV6TCxNQUFNLFVBQVUsdUNBQXVDLENBQUMsb0NBQThIO0lBQ3JMLDJDQUEyQyxHQUFHLG9DQUFvQyxDQUFDO0FBQ3BGLENBQUM7QUFFRCxNQUFNLFVBQVUsdUNBQXVDLENBQUMsV0FBbUIsRUFBRSxVQUFtQjtJQUMvRixPQUFPLDJDQUEyQyxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUM3RSxDQUFDIn0=