/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LegacyLinesDiffComputer } from 'vs/editor/common/diff/legacyLinesDiffComputer';
import { AdvancedLinesDiffComputer } from 'vs/editor/common/diff/advancedLinesDiffComputer';

export const linesDiffComputers = {
	getLegacy: () => new LegacyLinesDiffComputer(),
	getAdvanced: () => new AdvancedLinesDiffComputer(),
};
