/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';

export interface ActionSet<T> extends IDisposable {
	readonly validActions: readonly T[];
	readonly allActions: readonly T[];
	readonly hasAutoFix: boolean;
	readonly hasAIFix: boolean;
	readonly allAIFixes: boolean;
}
