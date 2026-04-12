/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class TelemetryAppenderChannel {
    constructor(appenders) {
        this.appenders = appenders;
    }
    listen(_, event) {
        throw new Error(`Event not found: ${event}`);
    }
    call(_, command, { eventName, data }) {
        this.appenders.forEach(a => a.log(eventName, data ?? {}));
        return Promise.resolve(null);
    }
}
export class TelemetryAppenderClient {
    constructor(channel) {
        this.channel = channel;
    }
    log(eventName, data) {
        this.channel.call('log', { eventName, data })
            .then(undefined, err => `Failed to log telemetry: ${console.warn(err)}`);
        return Promise.resolve(null);
    }
    flush() {
        // TODO
        return Promise.resolve();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5SXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFZaEcsTUFBTSxPQUFPLHdCQUF3QjtJQUVwQyxZQUFvQixTQUErQjtRQUEvQixjQUFTLEdBQVQsU0FBUyxDQUFzQjtJQUFJLENBQUM7SUFFeEQsTUFBTSxDQUFJLENBQVUsRUFBRSxLQUFhO1FBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELElBQUksQ0FBSSxDQUFVLEVBQUUsT0FBZSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBaUI7UUFDdEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBb0IsQ0FBQyxDQUFDO0lBQzlDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyx1QkFBdUI7SUFFbkMsWUFBb0IsT0FBaUI7UUFBakIsWUFBTyxHQUFQLE9BQU8sQ0FBVTtJQUFJLENBQUM7SUFFMUMsR0FBRyxDQUFDLFNBQWlCLEVBQUUsSUFBYztRQUNwQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7YUFDM0MsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLDRCQUE0QixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUUxRSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPO1FBQ1AsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUIsQ0FBQztDQUNEIn0=