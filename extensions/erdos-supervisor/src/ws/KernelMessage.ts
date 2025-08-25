/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { SocketMessage } from './SocketMessage';

export interface KernelMessageStatus extends SocketMessage {
	status: string;
}

export interface KernelOutputMessage extends SocketMessage {
	output: [string, string];
}
