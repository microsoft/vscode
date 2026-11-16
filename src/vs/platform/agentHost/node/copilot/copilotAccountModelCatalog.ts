/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import { isObject } from '../../../../base/common/types.js';

type ModelCatalog = Awaited<ReturnType<CopilotClient['rpc']['models']['list']>>;
type SessionModelCatalog = Awaited<ReturnType<CopilotSession['rpc']['model']['list']>>;

/**
 * The session API carries the runtime's model records as JSON rather than the server API's typed list.
 *
 * TODO@TylerLeonhardt: follow up with the runtime to type the session model list, then remove this conversion and its shape checks.
 */
export function toCopilotAccountModelCatalog(catalog: SessionModelCatalog): ModelCatalog {
	if (!catalog.list.length) {
		throw new Error('The selected Copilot account returned no usable models.');
	}
	const models = catalog.list.map(model => {
		if (!isModel(model)) {
			throw new Error('The runtime returned an invalid account model.');
		}
		return model;
	});
	return { models, auto: catalog.auto };
}

function isModel(value: unknown): value is ModelCatalog['models'][number] {
	return isObject(value) && 'id' in value && typeof value.id === 'string' && value.id.length > 0
		&& 'name' in value && typeof value.name === 'string' && 'capabilities' in value && isObject(value.capabilities);
}
