/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LegacyLinesDiffComputer } from './legacyLinesDiffComputer';
import { DefaultLinesDiffComputer } from './defaultLinesDiffComputer/defaultLinesDiffComputer';
import { ILinesDiffComputer } from './linesDiffComputer';

export const linesDiffComputers = {
	getLegacy: () => new LegacyLinesDiffComputer(),
	getDefault: () => new DefaultLinesDiffComputer(),
} satisfies Record<string, () => ILinesDiffComputer>;
