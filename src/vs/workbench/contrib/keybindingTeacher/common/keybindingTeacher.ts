/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IKeybindingTeacherService = createDecorator<IKeybindingTeacherService>('keybindingTeacherService');

export interface IKeybindingTeacherService {
	readonly _serviceBrand: undefined;

	/**
	 * Record a command execution from the UI (mouse/menu)
	 */
	recordUICommandExecution(commandId: string): void;

	/**
	 * Record a command execution from a keybinding
	 */
	recordKeybindingExecution(commandId: string): void;

	/**
	 * Get statistics for a specific command
	 */
	getCommandStats(commandId: string): ICommandStats | undefined;

	/**
	 * Dismiss suggestions for a specific command
	 */
	dismissCommand(commandId: string): void;

	/**
	 * Enable or disable the keybinding teacher
	 */
	setEnabled(enabled: boolean): void;
}

export interface ICommandStats {
	readonly commandId: string;
	readonly uiExecutions: number;
	readonly keyboardExecutions: number;
	readonly totalExecutions: number;
	readonly lastNotified: number | undefined;
	readonly dismissed: boolean;
	readonly firstUIExecution: number;
}

export interface IKeybindingTeacherConfiguration {
	readonly enabled: boolean;
	readonly threshold: number;
	readonly cooldownMinutes: number;
	readonly showDismissOption: boolean;
}

export const DEFAULT_CONFIG: IKeybindingTeacherConfiguration = {
	enabled: true,
	threshold: 3,
	cooldownMinutes: 60,
	showDismissOption: true
};
