/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';

export interface IURITransformer {
	transformIncoming(uri: UriComponents): UriComponents;
	transformOutgoing(uri: URI): URI;
	transformOutgoing(uri: UriComponents): UriComponents;
}

export const DefaultURITransformer: IURITransformer = new class {
	transformIncoming(uri: UriComponents) {
		return uri;
	}

	transformOutgoing(uri: URI): URI;
	transformOutgoing(uri: UriComponents): UriComponents;
	transformOutgoing(uri: URI | UriComponents): URI | UriComponents {
		return uri;
	}
};