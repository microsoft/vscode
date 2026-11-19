/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IBrowserResourceService = createDecorator<IBrowserResourceService>('browserResourceService');

export interface IBrowserResourceService {
	readonly _serviceBrand: undefined;

	/** Opts a filesystem scheme into browser delivery; other schemes are never read by this service. */
	registerScheme(scheme: string): IDisposable;

	/** Resolves registered resources, using scoped object URLs when no browser request transport exists. */
	resolve(resource: URI): Promise<IReference<URI>> | undefined;

	/** Reads only IDs issued by this window, preserving the complete original URI. Unknown IDs return undefined. */
	read(resourceId: string): Promise<{ content: VSBuffer; mimeType: string | undefined } | undefined>;
}
