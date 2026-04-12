/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { bufferToStream, streamToBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
export class RequestChannel {
    constructor(service) {
        this.service = service;
    }
    listen(context, event) {
        throw new Error('Invalid listen');
    }
    call(context, command, args, token = CancellationToken.None) {
        switch (command) {
            case 'request': return this.service.request(args[0], token)
                .then(async ({ res, stream }) => {
                const buffer = await streamToBuffer(stream);
                return [{ statusCode: res.statusCode, headers: res.headers }, buffer];
            });
            case 'resolveProxy': return this.service.resolveProxy(args[0]);
            case 'lookupAuthorization': return this.service.lookupAuthorization(args[0]);
            case 'lookupKerberosAuthorization': return this.service.lookupKerberosAuthorization(args[0]);
            case 'loadCertificates': return this.service.loadCertificates();
        }
        throw new Error('Invalid call');
    }
}
export class RequestChannelClient {
    constructor(channel) {
        this.channel = channel;
        this.onDidCompleteRequest = Event.None;
    }
    async request(options, token) {
        const [res, buffer] = await this.channel.call('request', [options], token);
        return { res, stream: bufferToStream(buffer) };
    }
    async resolveProxy(url) {
        return this.channel.call('resolveProxy', [url]);
    }
    async lookupAuthorization(authInfo) {
        return this.channel.call('lookupAuthorization', [authInfo]);
    }
    async lookupKerberosAuthorization(url) {
        return this.channel.call('lookupKerberosAuthorization', [url]);
    }
    async loadCertificates() {
        return this.channel.call('loadCertificates');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdElwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3RJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQVksTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFhdEQsTUFBTSxPQUFPLGNBQWM7SUFFMUIsWUFBNkIsT0FBd0I7UUFBeEIsWUFBTyxHQUFQLE9BQU8sQ0FBaUI7SUFBSSxDQUFDO0lBRTFELE1BQU0sQ0FBQyxPQUFZLEVBQUUsS0FBYTtRQUNqQyxNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELElBQUksQ0FBQyxPQUFZLEVBQUUsT0FBZSxFQUFFLElBQVUsRUFBRSxRQUEyQixpQkFBaUIsQ0FBQyxJQUFJO1FBQ2hHLFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyxTQUFTLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUM7aUJBQ3pELElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRTtnQkFDL0IsTUFBTSxNQUFNLEdBQUcsTUFBTSxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzVDLE9BQXdCLENBQUMsRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hGLENBQUMsQ0FBQyxDQUFDO1lBQ0osS0FBSyxjQUFjLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9ELEtBQUsscUJBQXFCLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0UsS0FBSyw2QkFBNkIsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RixLQUFLLGtCQUFrQixDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDakUsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLG9CQUFvQjtJQU1oQyxZQUE2QixPQUFpQjtRQUFqQixZQUFPLEdBQVAsT0FBTyxDQUFVO1FBRnJDLHlCQUFvQixHQUFHLEtBQUssQ0FBQyxJQUFvQyxDQUFDO0lBRXpCLENBQUM7SUFFbkQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUF3QixFQUFFLEtBQXdCO1FBQy9ELE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBa0IsU0FBUyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDaEQsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQUMsR0FBVztRQUM3QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFxQixjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsUUFBa0I7UUFDM0MsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBcUQscUJBQXFCLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ2pILENBQUM7SUFFRCxLQUFLLENBQUMsMkJBQTJCLENBQUMsR0FBVztRQUM1QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFxQiw2QkFBNkIsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDcEYsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0I7UUFDckIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBVyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDRCJ9