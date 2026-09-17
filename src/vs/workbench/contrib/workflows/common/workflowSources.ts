/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IWorkflowSourceEnablementService = createDecorator<IWorkflowSourceEnablementService>('workflowSourceEnablementService');

/** Projects existing extension enablement without owning another decision store. */
export interface IWorkflowSourceEnablementService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getSourceStates(): Promise<ReadonlyMap<string, boolean>>;
}
