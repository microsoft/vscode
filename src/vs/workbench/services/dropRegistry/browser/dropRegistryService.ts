/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IDropResourceHandler, IDropRegistryService } from '../common/dropRegistryService.js';

export class DropRegistryService extends Disposable implements IDropRegistryService {
	declare readonly _serviceBrand: undefined;

	private readonly handlers = new Set<IDropResourceHandler>();

	registerHandler(handler: IDropResourceHandler): IDisposable {
		this.handlers.add(handler);
		return toDisposable(() => this.handlers.delete(handler));
	}

	async tryHandleDrop(resource: URI, accessor: ServicesAccessor): Promise<boolean> {
		for (const handler of this.handlers) {
			if (await handler.tryHandleDrop(resource, accessor)) {
				return true;
			}
		}
		return false;
	}
}
