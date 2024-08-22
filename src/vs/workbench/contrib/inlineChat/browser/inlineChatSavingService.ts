/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation';
import { Session } from './inlineChatSession';


export const IInlineChatSavingService = createDecorator<IInlineChatSavingService>('IInlineChatSavingService	');

export interface IInlineChatSavingService {
	_serviceBrand: undefined;

	markChanged(session: Session): void;

}
