/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { revive } from '../../../../base/common/marshalling.js';
export class RemoteExtensionEnvironmentChannelClient {
    static async getEnvironmentData(channel, remoteAuthority, profile) {
        const args = {
            remoteAuthority,
            profile
        };
        const data = await channel.call('getEnvironmentData', args);
        const reconnectionGraceTime = (typeof data.reconnectionGraceTime === 'number' && data.reconnectionGraceTime >= 0)
            ? data.reconnectionGraceTime
            : 10800000 /* ProtocolConstants.ReconnectionGraceTime */;
        return {
            pid: data.pid,
            connectionToken: data.connectionToken,
            appRoot: URI.revive(data.appRoot),
            execPath: data.execPath,
            tmpDir: URI.revive(data.tmpDir),
            settingsPath: URI.revive(data.settingsPath),
            mcpResource: URI.revive(data.mcpResource),
            logsPath: URI.revive(data.logsPath),
            extensionHostLogsPath: URI.revive(data.extensionHostLogsPath),
            globalStorageHome: URI.revive(data.globalStorageHome),
            workspaceStorageHome: URI.revive(data.workspaceStorageHome),
            localHistoryHome: URI.revive(data.localHistoryHome),
            userHome: URI.revive(data.userHome),
            os: data.os,
            arch: data.arch,
            marks: data.marks,
            useHostProxy: data.useHostProxy,
            profiles: revive(data.profiles),
            isUnsupportedGlibc: data.isUnsupportedGlibc,
            reconnectionGraceTime
        };
    }
    static async getExtensionHostExitInfo(channel, remoteAuthority, reconnectionToken) {
        const args = {
            remoteAuthority,
            reconnectionToken
        };
        return channel.call('getExtensionHostExitInfo', args);
    }
    static getDiagnosticInfo(channel, options) {
        return channel.call('getDiagnosticInfo', options);
    }
    static updateTelemetryLevel(channel, telemetryLevel) {
        return channel.call('updateTelemetryLevel', { telemetryLevel });
    }
    static logTelemetry(channel, eventName, data) {
        return channel.call('logTelemetry', { eventName, data });
    }
    static flushTelemetry(channel) {
        return channel.call('flushTelemetry');
    }
    static async ping(channel) {
        await channel.call('ping');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRFbnZpcm9ubWVudENoYW5uZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50Q2hhbm5lbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsR0FBRyxFQUF5QixNQUFNLGdDQUFnQyxDQUFDO0FBTTVFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQXdDaEUsTUFBTSxPQUFPLHVDQUF1QztJQUVuRCxNQUFNLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQWlCLEVBQUUsZUFBdUIsRUFBRSxPQUEyQjtRQUN0RyxNQUFNLElBQUksR0FBaUM7WUFDMUMsZUFBZTtZQUNmLE9BQU87U0FDUCxDQUFDO1FBRUYsTUFBTSxJQUFJLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUE2QixvQkFBb0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4RixNQUFNLHFCQUFxQixHQUFHLENBQUMsT0FBTyxJQUFJLENBQUMscUJBQXFCLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxxQkFBcUIsSUFBSSxDQUFDLENBQUM7WUFDaEgsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUI7WUFDNUIsQ0FBQyx1REFBd0MsQ0FBQztRQUUzQyxPQUFPO1lBQ04sR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO1lBQ2IsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlO1lBQ3JDLE9BQU8sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDakMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDL0IsWUFBWSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztZQUMzQyxXQUFXLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO1lBQ3pDLFFBQVEsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDbkMscUJBQXFCLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUM7WUFDN0QsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDckQsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUM7WUFDM0QsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7WUFDbkQsUUFBUSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztZQUNuQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7WUFDWCxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQy9CLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztZQUMvQixrQkFBa0IsRUFBRSxJQUFJLENBQUMsa0JBQWtCO1lBQzNDLHFCQUFxQjtTQUNyQixDQUFDO0lBQ0gsQ0FBQztJQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsT0FBaUIsRUFBRSxlQUF1QixFQUFFLGlCQUF5QjtRQUMxRyxNQUFNLElBQUksR0FBdUM7WUFDaEQsZUFBZTtZQUNmLGlCQUFpQjtTQUNqQixDQUFDO1FBQ0YsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFnQywwQkFBMEIsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRUQsTUFBTSxDQUFDLGlCQUFpQixDQUFDLE9BQWlCLEVBQUUsT0FBK0I7UUFDMUUsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFrQixtQkFBbUIsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQsTUFBTSxDQUFDLG9CQUFvQixDQUFDLE9BQWlCLEVBQUUsY0FBOEI7UUFDNUUsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFPLHNCQUFzQixFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFpQixFQUFFLFNBQWlCLEVBQUUsSUFBb0I7UUFDN0UsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFPLGNBQWMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQWlCO1FBQ3RDLE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBTyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFpQjtRQUNsQyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQU8sTUFBTSxDQUFDLENBQUM7SUFDbEMsQ0FBQztDQUNEIn0=