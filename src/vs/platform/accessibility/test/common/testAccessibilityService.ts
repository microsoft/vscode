/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IAccessibilityService, AccessibilitySupport } from '../../common/accessibility.js';

export class TestAccessibilityService implements IAccessibilityService {

	declare readonly _serviceBrand: undefined;

	onDidChangeScreenReaderOptimized = Event.None;
	onDidChangeReducedMotion = Event.None;

	isScreenReaderOptimized(): boolean { return false; }
	isMotionReduced(): boolean { return false; }
	alwaysUnderlineAccessKeys(): Promise<boolean> { return Promise.resolve(false); }
	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void { }
	getAccessibilitySupport(): AccessibilitySupport { return AccessibilitySupport.Unknown; }
	alert(message: string): void { }
	status(message: string): void { }
}
