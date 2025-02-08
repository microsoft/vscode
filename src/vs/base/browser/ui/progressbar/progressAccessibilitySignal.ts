/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../common/lifecycle.js';

export interface IScopedAccessibilityProgressSignalDelegate extends IDisposable { }

const nullScopedAccessibilityProgressSignalFactory = () => ({
	msLoopTime: -1,
	msDelayTime: -1,
	dispose: () => { },
});
let progressAccessibilitySignalSchedulerFactory: (msDelayTime: number, msLoopTime?: number) => IScopedAccessibilityProgressSignalDelegate = nullScopedAccessibilityProgressSignalFactory;

export function setProgressAcccessibilitySignalScheduler(progressAccessibilitySignalScheduler: (msDelayTime: number, msLoopTime?: number) => IScopedAccessibilityProgressSignalDelegate) {
	progressAccessibilitySignalSchedulerFactory = progressAccessibilitySignalScheduler;
}

export function getProgressAcccessibilitySignalScheduler(msDelayTime: number, msLoopTime?: number): IScopedAccessibilityProgressSignalDelegate {
	return progressAccessibilitySignalSchedulerFactory(msDelayTime, msLoopTime);
}
