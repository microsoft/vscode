/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../../../base/common/uri.js';
import { fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import type { IChatMode, IChatModes } from '../../../common/chatModes.js';

/** Finds a chat mode by its client ID or unwrapped Agent Host URI. */
export function findAgentHostMode(modes: IChatModes, modeId: string): IChatMode | undefined {
	return modes.findModeById(modeId) ?? modes.custom.find(mode => {
		const uri = mode.uri?.get();
		return uri && fromAgentHostUri(uri).toString() === modeId;
	});
}

/** Returns the raw URI expected by the Agent Host protocol. */
export function getAgentHostModeUri(mode: IChatMode): URI | undefined {
	const uri = mode.uri?.get();
	return uri ? fromAgentHostUri(uri) : undefined;
}
