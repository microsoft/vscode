/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const ITelemetryService = createDecorator('telemetryService');
export function telemetryLevelEnabled(service, level) {
    return service.telemetryLevel >= level;
}
export const ICustomEndpointTelemetryService = createDecorator('customEndpointTelemetryService');
// Keys
export const currentSessionDateStorageKey = 'telemetry.currentSessionDate';
export const firstSessionDateStorageKey = 'telemetry.firstSessionDate';
export const lastSessionDateStorageKey = 'telemetry.lastSessionDate';
export const machineIdKey = 'telemetry.machineId';
export const sqmIdKey = 'telemetry.sqmId';
export const devDeviceIdKey = 'telemetry.devDeviceId';
// Configuration Keys
export const TELEMETRY_SECTION_ID = 'telemetry';
export const TELEMETRY_SETTING_ID = 'telemetry.telemetryLevel';
export const TELEMETRY_CRASH_REPORTER_SETTING_ID = 'telemetry.enableCrashReporter';
export const TELEMETRY_OLD_SETTING_ID = 'telemetry.enableTelemetry';
export var TelemetryLevel;
(function (TelemetryLevel) {
    TelemetryLevel[TelemetryLevel["NONE"] = 0] = "NONE";
    TelemetryLevel[TelemetryLevel["CRASH"] = 1] = "CRASH";
    TelemetryLevel[TelemetryLevel["ERROR"] = 2] = "ERROR";
    TelemetryLevel[TelemetryLevel["USAGE"] = 3] = "USAGE";
})(TelemetryLevel || (TelemetryLevel = {}));
export var TelemetryConfiguration;
(function (TelemetryConfiguration) {
    TelemetryConfiguration["OFF"] = "off";
    TelemetryConfiguration["CRASH"] = "crash";
    TelemetryConfiguration["ERROR"] = "error";
    TelemetryConfiguration["ON"] = "all";
})(TelemetryConfiguration || (TelemetryConfiguration = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzlFLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBb0Isa0JBQWtCLENBQUMsQ0FBQztBQXFEeEYsTUFBTSxVQUFVLHFCQUFxQixDQUFDLE9BQTBCLEVBQUUsS0FBcUI7SUFDdEYsT0FBTyxPQUFPLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQztBQUN4QyxDQUFDO0FBUUQsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsZUFBZSxDQUFrQyxnQ0FBZ0MsQ0FBQyxDQUFDO0FBU2xJLE9BQU87QUFDUCxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyw4QkFBOEIsQ0FBQztBQUMzRSxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyw0QkFBNEIsQ0FBQztBQUN2RSxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRywyQkFBMkIsQ0FBQztBQUNyRSxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUcscUJBQXFCLENBQUM7QUFDbEQsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDO0FBQzFDLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyx1QkFBdUIsQ0FBQztBQUV0RCxxQkFBcUI7QUFDckIsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsV0FBVyxDQUFDO0FBQ2hELE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLDBCQUEwQixDQUFDO0FBQy9ELE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLCtCQUErQixDQUFDO0FBQ25GLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLDJCQUEyQixDQUFDO0FBRXBFLE1BQU0sQ0FBTixJQUFrQixjQUtqQjtBQUxELFdBQWtCLGNBQWM7SUFDL0IsbURBQVEsQ0FBQTtJQUNSLHFEQUFTLENBQUE7SUFDVCxxREFBUyxDQUFBO0lBQ1QscURBQVMsQ0FBQTtBQUNWLENBQUMsRUFMaUIsY0FBYyxLQUFkLGNBQWMsUUFLL0I7QUFFRCxNQUFNLENBQU4sSUFBa0Isc0JBS2pCO0FBTEQsV0FBa0Isc0JBQXNCO0lBQ3ZDLHFDQUFXLENBQUE7SUFDWCx5Q0FBZSxDQUFBO0lBQ2YseUNBQWUsQ0FBQTtJQUNmLG9DQUFVLENBQUE7QUFDWCxDQUFDLEVBTGlCLHNCQUFzQixLQUF0QixzQkFBc0IsUUFLdkMifQ==