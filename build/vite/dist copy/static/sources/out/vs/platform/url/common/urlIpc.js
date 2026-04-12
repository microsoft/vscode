/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
export class URLHandlerChannel {
    constructor(handler) {
        this.handler = handler;
    }
    listen(_, event) {
        throw new Error(`Event not found: ${event}`);
    }
    call(_, command, arg) {
        switch (command) {
            case 'handleURL': return this.handler.handleURL(URI.revive(arg[0]), arg[1]);
        }
        throw new Error(`Call not found: ${command}`);
    }
}
export class URLHandlerChannelClient {
    constructor(channel) {
        this.channel = channel;
    }
    handleURL(uri, options) {
        return this.channel.call('handleURL', [uri.toJSON(), options]);
    }
}
export class URLHandlerRouter {
    constructor(next, logService) {
        this.next = next;
        this.logService = logService;
    }
    async routeCall(hub, command, arg, cancellationToken) {
        if (command !== 'handleURL') {
            throw new Error(`Call not found: ${command}`);
        }
        if (Array.isArray(arg) && arg.length > 0) {
            const uri = URI.revive(arg[0]);
            this.logService.trace('URLHandlerRouter#routeCall() with URI argument', uri.toString(true));
            if (uri.query) {
                const match = /\bwindowId=(\d+)/.exec(uri.query);
                if (match) {
                    const windowId = match[1];
                    this.logService.trace(`URLHandlerRouter#routeCall(): found windowId query parameter with value "${windowId}"`, uri.toString(true));
                    const regex = new RegExp(`window:${windowId}`);
                    const connection = hub.connections.find(c => {
                        this.logService.trace('URLHandlerRouter#routeCall(): testing connection', c.ctx);
                        return regex.test(c.ctx);
                    });
                    if (connection) {
                        this.logService.trace('URLHandlerRouter#routeCall(): found a connection to route', uri.toString(true));
                        return connection;
                    }
                    else {
                        this.logService.trace('URLHandlerRouter#routeCall(): did not find a connection to route', uri.toString(true));
                    }
                }
                else {
                    this.logService.trace('URLHandlerRouter#routeCall(): did not find windowId query parameter', uri.toString(true));
                }
            }
        }
        else {
            this.logService.trace('URLHandlerRouter#routeCall() without URI argument');
        }
        return this.next.routeCall(hub, command, arg, cancellationToken);
    }
    routeEvent(_, event) {
        throw new Error(`Event not found: ${event}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXJsL2NvbW1vbi91cmxJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBS2xELE1BQU0sT0FBTyxpQkFBaUI7SUFFN0IsWUFBb0IsT0FBb0I7UUFBcEIsWUFBTyxHQUFQLE9BQU8sQ0FBYTtJQUFJLENBQUM7SUFFN0MsTUFBTSxDQUFJLENBQVUsRUFBRSxLQUFhO1FBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELElBQUksQ0FBQyxDQUFVLEVBQUUsT0FBZSxFQUFFLEdBQVM7UUFDMUMsUUFBUSxPQUFPLEVBQUUsQ0FBQztZQUNqQixLQUFLLFdBQVcsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RSxDQUFDO1FBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUMvQyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sdUJBQXVCO0lBRW5DLFlBQW9CLE9BQWlCO1FBQWpCLFlBQU8sR0FBUCxPQUFPLENBQVU7SUFBSSxDQUFDO0lBRTFDLFNBQVMsQ0FBQyxHQUFRLEVBQUUsT0FBeUI7UUFDNUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNoRSxDQUFDO0NBQ0Q7QUFF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