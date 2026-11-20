/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Message } from '../../common/state/sessionState.js';

export interface IToolCallSource {
	readonly session: string;
	readonly chat: string;
	readonly turnId: string;
}

interface IDelegatedMessageAttribution {
	readonly source?: IToolCallSource;
	readonly version?: { readonly messageId: string; readonly revision: number };
}

// Key the host's evidence by the exact message version admitted, not by copyable protocol metadata.
const attribution = new WeakMap<Message, IDelegatedMessageAttribution>();

export function captureDelegatedMessage(message: Message, source: IToolCallSource | undefined, version?: IDelegatedMessageAttribution['version']): Message {
	attribution.set(message, { source, version });
	return message;
}

export function getDelegatedMessageAttribution(message: Message): IDelegatedMessageAttribution | undefined {
	return attribution.get(message);
}
