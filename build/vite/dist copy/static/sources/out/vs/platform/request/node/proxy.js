/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parse as parseUrl } from 'url';
import { isBoolean } from '../../../base/common/types.js';
function getSystemProxyURI(requestURL, env) {
    if (requestURL.protocol === 'http:') {
        return env.HTTP_PROXY || env.http_proxy || null;
    }
    else if (requestURL.protocol === 'https:') {
        return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null;
    }
    return null;
}
export async function getProxyAgent(rawRequestURL, env, options = {}) {
    const requestURL = parseUrl(rawRequestURL);
    const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL, env);
    if (!proxyURL) {
        return null;
    }
    const proxyEndpoint = parseUrl(proxyURL);
    if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
        return null;
    }
    const opts = {
        host: proxyEndpoint.hostname || '',
        port: (proxyEndpoint.port ? +proxyEndpoint.port : 0) || (proxyEndpoint.protocol === 'https' ? 443 : 80),
        auth: proxyEndpoint.auth,
        rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true,
    };
    if (requestURL.protocol === 'http:') {
        const { default: mod } = await import('http-proxy-agent');
        return new mod.HttpProxyAgent(proxyURL, opts);
    }
    else {
        const { default: mod } = await import('https-proxy-agent');
        return new mod.HttpsProxyAgent(proxyURL, opts);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJveHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9yZXF1ZXN0L25vZGUvcHJveHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxRQUFRLEVBQU8sTUFBTSxLQUFLLENBQUM7QUFDN0MsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBSTFELFNBQVMsaUJBQWlCLENBQUMsVUFBZSxFQUFFLEdBQXVCO0lBQ2xFLElBQUksVUFBVSxDQUFDLFFBQVEsS0FBSyxPQUFPLEVBQUUsQ0FBQztRQUNyQyxPQUFPLEdBQUcsQ0FBQyxVQUFVLElBQUksR0FBRyxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUM7SUFDakQsQ0FBQztTQUFNLElBQUksVUFBVSxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM3QyxPQUFPLEdBQUcsQ0FBQyxXQUFXLElBQUksR0FBRyxDQUFDLFdBQVcsSUFBSSxHQUFHLENBQUMsVUFBVSxJQUFJLEdBQUcsQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDO0lBQ3ZGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFPRCxNQUFNLENBQUMsS0FBSyxVQUFVLGFBQWEsQ0FBQyxhQUFxQixFQUFFLEdBQXVCLEVBQUUsVUFBb0IsRUFBRTtJQUN6RyxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDM0MsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsSUFBSSxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFeEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2YsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXpDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNyRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNLElBQUksR0FBRztRQUNaLElBQUksRUFBRSxhQUFhLENBQUMsUUFBUSxJQUFJLEVBQUU7UUFDbEMsSUFBSSxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUN2RyxJQUFJLEVBQUUsYUFBYSxDQUFDLElBQUk7UUFDeEIsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSTtLQUMzRSxDQUFDO0lBRUYsSUFBSSxVQUFVLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRSxDQUFDO1FBQ3JDLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMxRCxPQUFPLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDL0MsQ0FBQztTQUFNLENBQUM7UUFDUCxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU0sTUFBTSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDM0QsT0FBTyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hELENBQUM7QUFDRixDQUFDIn0=