/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { bufferToStream, VSBuffer } from '../../../common/buffer.js';
import { canceled } from '../../../common/errors.js';
import { OfflineError } from './request.js';
export async function request(options, token, isOnline) {
    if (token.isCancellationRequested) {
        throw canceled();
    }
    const cancellation = new AbortController();
    const disposable = token.onCancellationRequested(() => cancellation.abort());
    const signal = options.timeout ? AbortSignal.any([
        cancellation.signal,
        AbortSignal.timeout(options.timeout),
    ]) : cancellation.signal;
    try {
        const fetchInit = {
            method: options.type || 'GET',
            headers: getRequestHeaders(options),
            body: options.data,
            signal
        };
        if (options.disableCache) {
            fetchInit.cache = 'no-store';
        }
        const res = await fetch(options.url || '', fetchInit);
        return {
            res: {
                statusCode: res.status,
                headers: getResponseHeaders(res),
            },
            stream: bufferToStream(VSBuffer.wrap(new Uint8Array(await res.arrayBuffer()))),
        };
    }
    catch (err) {
        if (isOnline && !isOnline()) {
            throw new OfflineError();
        }
        if (err?.name === 'AbortError') {
            throw canceled();
        }
        if (err?.name === 'TimeoutError') {
            throw new Error(`Fetch timeout: ${options.timeout}ms`);
        }
        throw err;
    }
    finally {
        disposable.dispose();
    }
}
function getRequestHeaders(options) {
    if (options.headers || options.user || options.password || options.proxyAuthorization) {
        const headers = new Headers();
        outer: for (const k in options.headers) {
            switch (k.toLowerCase()) {
                case 'user-agent':
                case 'accept-encoding':
                case 'content-length':
                    // unsafe headers
                    continue outer;
            }
            const header = options.headers[k];
            if (typeof header === 'string') {
                headers.set(k, header);
            }
            else if (Array.isArray(header)) {
                for (const h of header) {
                    headers.append(k, h);
                }
            }
        }
        if (options.user || options.password) {
            headers.set('Authorization', 'Basic ' + btoa(`${options.user || ''}:${options.password || ''}`));
        }
        if (options.proxyAuthorization) {
            headers.set('Proxy-Authorization', options.proxyAuthorization);
        }
        return headers;
    }
    return undefined;
}
function getResponseHeaders(res) {
    const headers = Object.create(null);
    res.headers.forEach((value, key) => {
        if (headers[key]) {
            if (Array.isArray(headers[key])) {
                headers[key].push(value);
            }
            else {
                headers[key] = [headers[key], value];
            }
        }
        else {
            headers[key] = value;
        }
    });
    return headers;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdEltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3RJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3JELE9BQU8sRUFBOEMsWUFBWSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRXhGLE1BQU0sQ0FBQyxLQUFLLFVBQVUsT0FBTyxDQUFDLE9BQXdCLEVBQUUsS0FBd0IsRUFBRSxRQUF3QjtJQUN6RyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQ25DLE1BQU0sUUFBUSxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sWUFBWSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDM0MsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzdFLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUM7UUFDaEQsWUFBWSxDQUFDLE1BQU07UUFDbkIsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDO0tBQ3BDLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQztJQUV6QixJQUFJLENBQUM7UUFDSixNQUFNLFNBQVMsR0FBZ0I7WUFDOUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLElBQUksS0FBSztZQUM3QixPQUFPLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDO1lBQ25DLElB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