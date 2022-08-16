/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MyersDiffAlgorithm } from 'vs/editor/common/diff/algorithms/myersDiffAlgorithm';
import { SmartLinesDiffComputer } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { StandardLinesDiffComputer } from 'vs/editor/common/diff/standardLinesDiffComputer';

export const linesDiffComputers = {
	smart: new SmartLinesDiffComputer(),
	experimental: new StandardLinesDiffComputer(new MyersDiffAlgorithm())
};
