/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

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

export const IAccessibleNotificationService = createDecorator<IAccessibleNotificationService>('accessibleNotificationService');
/**
 * Manages whether an audio cue or an aria alert will be used
 * in response to actions taken around the workbench.
 * Targets screen reader and braille users.
 */
export interface IAccessibleNotificationService {
	readonly _serviceBrand: undefined;
	notify(event: AccessibleNotificationEvent, userGesture?: boolean, forceSound?: boolean, allowManyInParallel?: boolean): void;
	notifyLineChanges(event: AccessibleNotificationEvent[]): void;
}

export const enum AccessibleNotificationEvent {
	Clear = 'clear',
	Save = 'save',
	Format = 'format',
	Breakpoint = 'breakpoint',
	Error = 'error',
	Warning = 'warning',
	Folded = 'folded',
	TerminalQuickFix = 'terminalQuickFix',
	TerminalBell = 'terminalBell',
	TerminalCommandFailed = 'terminalCommandFailed',
	TaskCompleted = 'taskCompleted',
	TaskFailed = 'taskFailed',
	ChatRequestSent = 'chatRequestSent',
	NotebookCellCompleted = 'notebookCellCompleted',
	NotebookCellFailed = 'notebookCellFailed',
	OnDebugBreak = 'onDebugBreak',
	NoInlayHints = 'noInlayHints'
}
