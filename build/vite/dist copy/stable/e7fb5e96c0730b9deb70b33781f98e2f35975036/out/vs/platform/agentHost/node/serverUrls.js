/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'os';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '0000:0000:0000:0000:0000:0000:0000:0001']);
const wildcardHosts = new Set(['0.0.0.0', '::', '0000:0000:0000:0000:0000:0000:0000:0000']);
export function resolveServerUrls(host, port, networkInterfaces = os.networkInterfaces()) {
    if (host === undefined) {
        return { local: [formatWebSocketUrl('localhost', port)], network: [] };
    }
    if (!wildcardHosts.has(host)) {
        const url = formatWebSocketUrl(host, port);
        return loopbackHosts.has(host)
            ? { local: [url], network: [] }
            : { local: [], network: [url] };
    }
    const network = new Set();
    for (const netInterface of Object.values(networkInterfaces)) {
        for (const detail of netInterface ?? []) {
            if (detail.family !== 'IPv4' || detail.internal) {
                continue;
            }
            network.add(formatWebSocketUrl(detail.address, port));
        }
    }
    return {
        local: [formatWebSocketUrl('localhost', port)],
        network: [...network],
    };
}
export function formatWebSocketUrl(host, port) {
    const normalizedHost = host.includes(':') ? `[${host}]` : host;
    return `ws://${normalizedHost}:${port}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyVXJscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NlcnZlclVybHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFPekIsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDLENBQUM7QUFDNUcsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLHlDQUF5QyxDQUFDLENBQUMsQ0FBQztBQUU1RixNQUFNLFVBQVUsaUJBQWlCLENBQUMsSUFBd0IsRUFBRSxJQUFZLEVBQUUsb0JBQTZELEVBQUUsQ0FBQyxpQkFBaUIsRUFBRTtJQUM1SixJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUN4QixPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsa0JBQWtCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQ3hFLENBQUM7SUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQzlCLE1BQU0sR0FBRyxHQUFHLGtCQUFrQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzQyxPQUFPLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQzdCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7WUFDL0IsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ2xDLEtBQUssTUFBTSxZQUFZLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7UUFDN0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxZQUFZLElBQUksRUFBRSxFQUFFLENBQUM7WUFDekMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLE1BQU0sSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2pELFNBQVM7WUFDVixDQUFDO1lBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDdkQsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPO1FBQ04sS0FBSyxFQUFFLENBQUMsa0JBQWtCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlDLE9BQU8sRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDO0tBQ3JCLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxVQUFVLGtCQUFrQixDQUFDLElBQVksRUFBRSxJQUFZO0lBQzVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUMvRCxPQUFPLFFBQVEsY0FBYyxJQUFJLElBQUksRUFBRSxDQUFDO0FBQ3pDLENBQUMifQ==