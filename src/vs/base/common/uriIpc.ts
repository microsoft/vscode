/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';

export interface IURITransformer {
	transformIncoming(uri: UriComponents): UriComponents;
	transformOutgoing(uri: URI): URI;
}

export const DefaultURITransformer: IURITransformer = {
	transformIncoming: (uri: UriComponents) => uri,
	transformOutgoing: (uri: URI) => uri,
};