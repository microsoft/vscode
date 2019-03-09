/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { Disposable } from 'vs/base/common/lifecycle';

export class BrowserAccessibilityService extends Disposable implements IAccessibilityService {

	_serviceBrand: any;

	private _accessibilitySupport = AccessibilitySupport.Unknown;
	private readonly _onDidChangeAccessibilitySupport = new Emitter<void>();
	readonly onDidChangeAccessibilitySupport: Event<void> = this._onDidChangeAccessibilitySupport.event;

	alwaysUnderlineAccessKeys(): Promise<boolean> {
		return Promise.resolve(false);
	}

	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void {
		if (this._accessibilitySupport === accessibilitySupport) {
			return;
		}

		this._accessibilitySupport = accessibilitySupport;
		this._onDidChangeAccessibilitySupport.fire();
	}

	getAccessibilitySupport(): AccessibilitySupport {
		return this._accessibilitySupport;
	}
}