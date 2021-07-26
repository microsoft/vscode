/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URITransformer } from 'vs/base/common/uriIpc';
import rawURITransformerFactory = require('vs/server/uriTransformer');

export const getUriTransformer = (remoteAuthority: string): URITransformer => {
	return new URITransformer(rawURITransformerFactory(remoteAuthority));
};
