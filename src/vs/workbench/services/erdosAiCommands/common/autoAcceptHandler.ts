/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAutoAcceptHandler = createDecorator<IAutoAcceptHandler>('autoAcceptHandler');

export interface IWidgetDecisionSetter {
	setWidgetDecision(
		functionType: string,
		messageId: number,
		decision: 'accept' | 'cancel',
		content?: string,
		requestId?: string
	): void;
}

export interface IAutoAcceptHandler {
	readonly _serviceBrand: undefined;
	
	/**
	 * Set the widget decision setter (called by the service core to avoid circular dependency)
	 */
	setWidgetDecisionSetter(setter: IWidgetDecisionSetter): void;
	
	/**
	 * Check for auto-accept conditions and automatically set widget decisions
	 */
	checkAndHandleAutoAccept(specificBranch: any): Promise<boolean>;
	
	/**
	 * Track an auto-accepted edit for later highlighting
	 */
	trackAutoAcceptEdit(filePath: string, conversationId: number): Promise<void>;
}
