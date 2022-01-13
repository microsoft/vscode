/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalCapability } from 'vs/platform/terminal/common/terminal';

export class CommandDetectionCapability {
	readonly type = TerminalCapability.CommandDetection;

	// TODO: Encapsulate the functionality the capability brings here
}
