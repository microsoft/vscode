/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickTreeItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ConfirmedReason } from './chatService.js';
import { IToolData, ToolDataSource } from './languageModelToolsService.js';

export interface ILanguageModelToolConfirmationActions {
	/** Label for the action */
	label: string;
	/** Action detail (e.g. tooltip) */
	detail?: string;
	/** Show a separator before this action */
	divider?: boolean;
	/** Selects this action. Resolves true if the action should be confirmed after selection */
	select(): Promise<boolean>;
}

export interface ILanguageModelToolConfirmationRef {
	toolId: string;
	source: ToolDataSource;
	parameters: unknown;
}

export interface ILanguageModelToolConfirmationActionProducer {
	getPreConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined;
	getPostConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined;

	/** Gets the selectable actions to take to memorize confirmation changes */
	getPreConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[];
	getPostConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[];
}

export interface ILanguageModelToolConfirmationContributionQuickTreeItem extends IQuickTreeItem {
	onDidTriggerItemButton?(button: IQuickInputButton): void;
	onDidChangeChecked?(checked: boolean): void;
}

/**
 * Type that can be registered to provide more specific confirmation
 * actions for a specific tool.
 */
export type ILanguageModelToolConfirmationContribution = Partial<ILanguageModelToolConfirmationActionProducer> & {
	/**
	 * Gets items to be shown in the `manageConfirmationPreferences` quick tree.
	 * These are added under the tool's category.
	 */
	getManageActions?(): ILanguageModelToolConfirmationContributionQuickTreeItem[];

	/**
	 * Defaults to true. If false, the "Always Allow" options will not be shown
	 * and _only_ your custom manage actions will be shown.
	 */
	canUseDefaultApprovals?: boolean;

	/**
	 * Reset all confirmation settings for this tool.
	 */
	reset?(): void;
};

/**
 * Handles language model tool confirmation.
 *
 * - By default, all tools can have their confirmation preferences saved within
 *   a session, workspace, or globally.
 * - Tools with ToolDataSource from an extension or MCP can have that entire
 *   source's preference saved within a session, workspace, or globally.
 * - Contributable confirmations may also be registered for specific behaviors.
 *
 * Note: this interface MUST NOT depend in the ILanguageModelToolsService.
 * The ILanguageModelToolsService depends on this service instead in order to
 * call getPreConfirmAction/getPostConfirmAction.
 */
export interface ILanguageModelToolsConfirmationService extends ILanguageModelToolConfirmationActionProducer {
	readonly _serviceBrand: undefined;

	/** Opens an IQuickTree to let the user manage their preferences.  */
	manageConfirmationPreferences(tools: Readonly<IToolData>[], options?: { defaultScope?: 'workspace' | 'profile' | 'session' }): void;

	/**
	 * Registers a contribution that provides more specific confirmation logic
	 * for a tool, in addition to the default confirmation handling.
	 */
	registerConfirmationContribution(toolName: string, contribution: ILanguageModelToolConfirmationContribution): IDisposable;

	/** Resets all tool and server confirmation preferences */
	resetToolAutoConfirmation(): void;
}

export const ILanguageModelToolsConfirmationService = createDecorator<ILanguageModelToolsConfirmationService>('ILanguageModelToolsConfirmationService');
