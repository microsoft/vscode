/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { JupyterMessageType } from './JupyterMessageType.js';

export interface JupyterMessageHeader {
	msg_id: string;
	session: string;
	username: string;
	date: string;
	msg_type: JupyterMessageType;
	version: string;
}
