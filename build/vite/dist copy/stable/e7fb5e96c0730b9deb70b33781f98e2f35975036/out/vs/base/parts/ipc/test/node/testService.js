/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeout } from '../../../../common/async.js';
import { Emitter } from '../../../../common/event.js';
export class TestService {
    constructor() {
        this._onMarco = new Emitter();
        this.onMarco = this._onMarco.event;
    }
    marco() {
        this._onMarco.fire({ answer: 'polo' });
        return Promise.resolve('polo');
    }
    pong(ping) {
        return Promise.resolve({ incoming: ping, outgoing: 'pong' });
    }
    cancelMe() {
        return Promise.resolve(timeout(100)).then(() => true);
    }
}
export class TestChannel {
    constructor(testService) {
        this.testService = testService;
    }
    listen(_, event) {
        switch (event) {
            case 'marco': return this.testService.onMarco;
        }
        throw new Error('Event not found');
    }
    call(_, command, ...args) {
        switch (command) {
            case 'pong': return this.testService.pong(args[0]);
            case 'cancelMe': return this.testService.cancelMe();
            case 'marco': return this.testService.marco();
            default: return Promise.reject(new Error(`command not found: ${command}`));
        }
    }
}
export class TestServiceClient {
    get onMarco() { return this.channel.listen('marco'); }
    constructor(channel) {
        this.channel = channel;
    }
    marco() {
        return this.channel.call('marco');
    }
    pong(ping) {
        return this.channel.call('pong', ping);
    }
    cancelMe() {
        return this.channel.call('cancelMe');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3BhcnRzL2lwYy90ZXN0L25vZGUvdGVzdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSw2QkFBNkIsQ0FBQztBQWM3RCxNQUFNLE9BQU8sV0FBVztJQUF4QjtRQUVrQixhQUFRLEdBQUcsSUFBSSxPQUFPLEVBQW1CLENBQUM7UUFDbEQsWUFBTyxHQUEyQixJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztJQWNoRSxDQUFDO0lBWkEsS0FBSztRQUNKLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDdkMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxJQUFJLENBQUMsSUFBWTtRQUNoQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRCxRQUFRO1FBQ1AsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sV0FBVztJQUV2QixZQUFvQixXQUF5QjtRQUF6QixnQkFBVyxHQUFYLFdBQVcsQ0FBYztJQUFJLENBQUM7SUFFbEQsTUFBTSxDQUFDLENBQVUsRUFBRSxLQUFhO1FBQy9CLFFBQVEsS0FBSyxFQUFFLENBQUM7WUFDZixLQUFLLE9BQU8sQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUM7UUFDL0MsQ0FBQztRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBSSxDQUFDLENBQVUsRUFBRSxPQUFlLEVBQUUsR0FBRyxJQUFXO1FBQy9DLFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyxNQUFNLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25ELEtBQUssVUFBVSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3BELEtBQUssT0FBTyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzlDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVFLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8saUJBQWlCO0lBRTdCLElBQUksT0FBTyxLQUE2QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUU5RSxZQUFvQixPQUFpQjtRQUFqQixZQUFPLEdBQVAsT0FBTyxDQUFVO0lBQUksQ0FBQztJQUUxQyxLQUFLO1FBQ0osT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsSUFBSSxDQUFDLElBQVk7UUFDaEIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELFFBQVE7UUFDUCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRCJ9