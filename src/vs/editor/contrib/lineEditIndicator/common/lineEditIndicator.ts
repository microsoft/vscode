/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Configuration options for the line edit indicator extension
 */
export interface ILineEditIndicatorOptions {
	/**
	 * Whether the line edit indicator is enabled
	 */
	enabled: boolean;
}

/**
 * CSS class names for different line edit sources
 */
export const enum LineEditIndicatorCssClass {
	Human = 'line-edit-indicator-human',
	AI = 'line-edit-indicator-ai',
	Undetermined = 'line-edit-indicator-undetermined'
}

/**
 * Tooltip messages for different line edit sources
 */
export const enum LineEditIndicatorTooltip {
	Human = 'Last edited by Human',
	AI = 'Last edited by AI',
	Undetermined = 'Edit source undetermined'
}

/**
 * Command IDs for line edit indicator actions
 */
export const enum LineEditIndicatorCommandId {
	Enable = 'editor.action.lineEditIndicator.enable',
	Disable = 'editor.action.lineEditIndicator.disable',
	Toggle = 'editor.action.lineEditIndicator.toggle'
}
