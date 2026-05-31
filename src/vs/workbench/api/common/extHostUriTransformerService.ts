/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURITransformer } from '../../../base/common/uriIpc.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { URI, UriComponents } from '../../../base/common/uri.js';

export interface IURITransformerService extends IURITransformer {
	readonly _serviceBrand: undefined;
}

export const IURITransformerService = createDecorator<IURITransformerService>('IURITransformerService');

export class URITransformerService implements IURITransformerService {
	declare readonly _serviceBrand: undefined;

	transformIncoming: (uri: UriComponents) => UriComponents;
	transformOutgoing: (uri: UriComponents) => UriComponents;
	transformOutgoingURI: (uri: URI) => URI;
	transformOutgoingScheme: (scheme: string) => string;

	constructor(delegate: IURITransformer | null) {
		if (!delegate) {
			this.transformIncoming = arg => arg;
			this.transformOutgoing = arg => arg;
			this.transformOutgoingURI = arg => arg;
			this.transformOutgoingScheme = arg => arg;
		} else {
			this.transformIncoming = delegate.transformIncoming.bind(delegate);
			this.transformOutgoing = delegate.transformOutgoing.bind(delegate);
			this.transformOutgoingURI = delegate.transformOutgoingURI.bind(delegate);
			this.transformOutgoingScheme = delegate.transformOutgoingScheme.bind(delegate);
		}
	}
}
