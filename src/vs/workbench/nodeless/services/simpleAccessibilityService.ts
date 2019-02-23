/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';

export class SimpleAccessibilityService implements IAccessibilityService {

	_serviceBrand: any;

	onDidChangeAccessibilitySupport = Event.None;

	private support: AccessibilitySupport;

	alwaysUnderlineAccessKeys(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getAccessibilitySupport(): AccessibilitySupport {
		return this.support;
	}

	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void {
		this.support = accessibilitySupport;
	}
}