/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IWebContentExtractorService = createDecorator<IWebContentExtractorService>('IWebContentExtractorService');
export const ISharedWebContentExtractorService = createDecorator<ISharedWebContentExtractorService>('ISharedWebContentExtractorService');

export interface IWebContentExtractorOptions {
	/**
	 * Whether to allow cross-authority redirects on the web content.
	 * 'false' by default.
	 */
	followRedirects?: boolean;

	/**
	 * List of trusted domain patterns for redirect validation.
	 */
	trustedDomains?: string[];
}

export type WebContentExtractResult =
	| { status: 'ok'; result: string; title?: string }
	| { status: 'error'; error: string; statusCode?: number; result?: string; title?: string }
	| { status: 'redirect'; toURI: URI };

export interface IWebContentExtractorService {
	_serviceBrand: undefined;
	extract(uri: URI[], options?: IWebContentExtractorOptions): Promise<WebContentExtractResult[]>;
}

/*
 * A service that extracts image content from a given arbitrary URI. This is done in the shared process to avoid running non trusted application code in the main process.
 */
export interface ISharedWebContentExtractorService {
	_serviceBrand: undefined;
	readImage(uri: URI, token: CancellationToken): Promise<VSBuffer | undefined>;
}

/**
 * A service that extracts web content from a given URI.
 * This is a placeholder implementation that does not perform any actual extraction.
 * It's intended to be used on platforms where web content extraction is not supported such as in the browser.
 */
export class NullWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	extract(_uri: URI[]): Promise<WebContentExtractResult[]> {
		throw new Error('Not implemented');
	}
}

export class NullSharedWebContentExtractorService implements ISharedWebContentExtractorService {
	_serviceBrand: undefined;
	readImage(_uri: URI, _token: CancellationToken): Promise<VSBuffer | undefined> {
		throw new Error('Not implemented');
	}
}
