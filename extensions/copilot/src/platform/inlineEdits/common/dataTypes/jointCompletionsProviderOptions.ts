/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum JointCompletionsProviderStrategy {
	Regular = 'regular',
	CursorEndOfLine = 'cursorEndOfLine',
}

export enum JointCompletionsProviderTriggerChangeStrategy {
	NoTriggerOnRequestInFlight = 'noTriggerOnRequestInFlight',
	NoTriggerOnCompletionsRequestInFlight = 'noTriggerOnCompletionsRequestInFlight',
	AlwaysTrigger = 'alwaysTrigger',
}
