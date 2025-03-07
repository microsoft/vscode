/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAccessibilityService = createDecorator<IAccessibilityService>('accessibilityService');

export interface IAccessibilityService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeScreenReaderOptimized: Event<void>;
	readonly onDidChangeReducedMotion: Event<void>;

	alwaysUnderlineAccessKeys(): Promise<boolean>;
	isScreenReaderOptimized(): boolean;
	isMotionReduced(): boolean;
	getAccessibilitySupport(): AccessibilitySupport;
	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void;
	alert(message: string): void;
	status(message: string): void;
}

export const enum AccessibilitySupport {
	/**
	 * This should be the browser case where it is not known if a screen reader is attached or no.
	 */
	Unknown = 0,

	Disabled = 1,

	Enabled = 2
}

export const CONTEXT_ACCESSIBILITY_MODE_ENABLED = new RawContextKey<boolean>('accessibilityModeEnabled', false);

export interface IAccessibilityInformation {
	label: string;
	role?: string;
}

export function isAccessibilityInformation(obj: any): obj is IAccessibilityInformation {
	return obj && typeof obj === 'object'
		&& typeof obj.label === 'string'
		&& (typeof obj.role === 'undefined' || typeof obj.role === 'string');
}

export const ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX = 'ACCESSIBLE_VIEW_SHOWN_';
