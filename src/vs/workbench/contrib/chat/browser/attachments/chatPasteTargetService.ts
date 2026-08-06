/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatPasteTarget, IChatPasteTargetService } from '../chat.js';

export class ChatPasteTargetService implements IChatPasteTargetService {
	declare readonly _serviceBrand: undefined;

	private readonly _targets = new ResourceMap<IChatPasteTarget>();

	registerTarget(inputUri: URI, target: IChatPasteTarget): IDisposable {
		this._targets.set(inputUri, target);
		return toDisposable(() => {
			if (this._targets.get(inputUri) === target) {
				this._targets.delete(inputUri);
			}
		});
	}

	getTarget(inputUri: URI): IChatPasteTarget | undefined {
		return this._targets.get(inputUri);
	}
}
