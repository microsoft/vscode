/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const SANDBOX_HELPER_CHANNEL_NAME = 'sandboxHelper';
export class SandboxHelperChannel {
    constructor(service) {
        this.service = service;
    }
    listen(_context, _event) {
        throw new Error('Invalid listen');
    }
    call(_context, command, _arg, _cancellationToken) {
        switch (command) {
            case 'checkSandboxDependencies':
                return this.service.checkSandboxDependencies();
        }
        throw new Error('Invalid call');
    }
}
export class SandboxHelperChannelClient {
    constructor(channel) {
        this.channel = channel;
    }
    checkSandboxDependencies() {
        return this.channel.call('checkSandboxDependencies');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2FuZGJveEhlbHBlcklwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3NhbmRib3hIZWxwZXJJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFPaEcsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUFDO0FBRTNELE1BQU0sT0FBTyxvQkFBb0I7SUFFaEMsWUFBNkIsT0FBOEI7UUFBOUIsWUFBTyxHQUFQLE9BQU8sQ0FBdUI7SUFBSSxDQUFDO0lBRWhFLE1BQU0sQ0FBSSxRQUFpQixFQUFFLE1BQWM7UUFDMUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxJQUFJLENBQUksUUFBaUIsRUFBRSxPQUFlLEVBQUUsSUFBYyxFQUFFLGtCQUFzQztRQUNqRyxRQUFRLE9BQU8sRUFBRSxDQUFDO1lBQ2pCLEtBQUssMEJBQTBCO2dCQUM5QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsd0JBQXdCLEVBQWdCLENBQUM7UUFDL0QsQ0FBQztRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDBCQUEwQjtJQUd0QyxZQUE2QixPQUFpQjtRQUFqQixZQUFPLEdBQVAsT0FBTyxDQUFVO0lBQUksQ0FBQztJQUVuRCx3QkFBd0I7UUFDdkIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBdUMsMEJBQTBCLENBQUMsQ0FBQztJQUM1RixDQUFDO0NBQ0QifQ==