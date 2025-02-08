/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger } from '../logging';

export const nulLogger = new class implements ILogger {
	verbose(): void {
		// noop
	}
};
