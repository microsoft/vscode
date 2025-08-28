/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { SocketMessage } from './SocketMessage';

export interface KernelMessageStatus extends SocketMessage {
	status: string;
}

export interface KernelOutputMessage extends SocketMessage {
	output: [string, string];
}
