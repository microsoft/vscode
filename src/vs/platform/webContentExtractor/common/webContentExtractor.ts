/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IWebContentExtractorService = createDecorator<IWebContentExtractorService>('IWebContentExtractorService');

export interface IWebContentExtractorService {
	_serviceBrand: undefined;
	extract(uri: URI[]): Promise<string[]>;
	extractUrls(uri: URI): Promise<Uint8Array>;
}

/**
 * A service that extracts web content from a given URI.
 * This is a placeholder implementation that does not perform any actual extraction.
 * It's intended to be used on platforms where web content extraction is not supported such as in the browser.
 */
export class NullWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	extract(_uri: URI[]): Promise<string[]> {
		throw new Error('Not implemented');
	}

	extractUrls(_uri: URI): Promise<Uint8Array> {
		throw new Error('Not implemented');
	}
}
