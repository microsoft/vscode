/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { VSBufferReadableStream, streamToBuffer } from 'vs/base/common/buffer';

export const IRequestService = createDecorator<IRequestService>('requestService');

export interface IHeaders {
	[header: string]: string;
}

export interface IRequestOptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	headers?: IHeaders;
	timeout?: number;
	data?: string;
	followRedirects?: number;
}

export interface IRequestContext {
	res: {
		headers: IHeaders;
		statusCode?: number;
	};
	stream: VSBufferReadableStream;
}

export interface IRequestService {
	_serviceBrand: any;

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext>;
}

function isSuccess(context: IRequestContext): boolean {
	return (context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300) || context.res.statusCode === 1223;
}

function hasNoContent(context: IRequestContext): boolean {
	return context.res.statusCode === 204;
}

export async function asText(context: IRequestContext): Promise<string | null> {
	if (!isSuccess(context)) {
		throw new Error('Server returned ' + context.res.statusCode);
	}
	if (hasNoContent(context)) {
		return null;
	}
	const buffer = await streamToBuffer(context.stream);
	return buffer.toString();
}

export async function asJson<T = {}>(context: IRequestContext): Promise<T | null> {
	if (!isSuccess(context)) {
		throw new Error('Server returned ' + context.res.statusCode);
	}
	if (hasNoContent(context)) {
		return null;
	}
	const buffer = await streamToBuffer(context.stream);
	return JSON.parse(buffer.toString());
}


export interface IHTTPConfiguration {
	http?: {
		proxy?: string;
		proxyStrictSSL?: boolean;
		proxyAuthorization?: string;
	};
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		id: 'http',
		order: 15,
		title: localize('httpConfigurationTitle', "HTTP"),
		type: 'object',
		properties: {
			'http.proxy': {
				type: 'string',
				pattern: '^https?://([^:]*(:[^@]*)?@)?([^:]+)(:\\d+)?/?$|^$',
				markdownDescription: localize('proxy', "The proxy setting to use. If not set, will be inherited from the `http_proxy` and `https_proxy` environment variables.")
			},
			'http.proxyStrictSSL': {
				type: 'boolean',
				default: true,
				description: localize('strictSSL', "Controls whether the proxy server certificate should be verified against the list of supplied CAs.")
			},
			'http.proxyAuthorization': {
				type: ['null', 'string'],
				default: null,
				markdownDescription: localize('proxyAuthorization', "The value to send as the `Proxy-Authorization` header for every network request.")
			},
			'http.proxySupport': {
				type: 'string',
				enum: ['off', 'on', 'override'],
				enumDescriptions: [
					localize('proxySupportOff', "Disable proxy support for extensions."),
					localize('proxySupportOn', "Enable proxy support for extensions."),
					localize('proxySupportOverride', "Enable proxy support for extensions, override request options."),
				],
				default: 'override',
				description: localize('proxySupport', "Use the proxy support for extensions.")
			},
			'http.systemCertificates': {
				type: 'boolean',
				default: true,
				description: localize('systemCertificates', "Controls whether CA certificates should be loaded from the OS. (On Windows and macOS a reload of the window is required after turning this off.)")
			}
		}
	});
