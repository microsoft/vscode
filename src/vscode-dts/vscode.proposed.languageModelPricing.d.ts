/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/XXXXX

	export interface LanguageModelChatInformation {
		/**
		 * Optional pricing label for this model, such as "Free", "$0.01/request", etc.
		 * This value is meant for display purposes and will be shown in the model management UI.
		 */
		readonly pricing?: string;

		/**
		 * Optional input cost in AI credits for this model.
		 * Displayed in the model management UI as the cost per million input tokens.
		 */
		readonly inputCost?: number;

		/**
		 * Optional output cost in AI credits for this model.
		 * Displayed in the model management UI as the cost per million output tokens.
		 */
		readonly outputCost?: number;

		/**
		 * Optional cache cost in AI credits for this model.
		 * Displayed in the model management UI as the cost per million cached tokens.
		 */
		readonly cacheCost?: number;
	}

	export interface LanguageModelChat {
		/**
		 * Optional pricing label for this model, such as "Free", "$0.01/request", etc.
		 * This value is provided by the model provider and is meant for display purposes only.
		 */
		readonly pricing?: string;

		/**
		 * Optional input cost in AI credits for this model.
		 */
		readonly inputCost?: number;

		/**
		 * Optional output cost in AI credits for this model.
		 */
		readonly outputCost?: number;

		/**
		 * Optional cache cost in AI credits for this model.
		 */
		readonly cacheCost?: number;
	}
}
