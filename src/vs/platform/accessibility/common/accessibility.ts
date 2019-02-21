/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { AccessibilitySupport } from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';

export const IAccessibilityService = createDecorator<IAccessibilityService>('accessibilityService');

export interface IAccessibilityService {
	_serviceBrand: any;

	readonly onDidChangeAccessibilitySupport: Event<void>;

	alwaysUnderlineAccessKeys(): Promise<boolean>;
	getAccessibilitySupport(): AccessibilitySupport;
	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void;
}