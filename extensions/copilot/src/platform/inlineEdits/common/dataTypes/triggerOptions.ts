/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vEnum } from '../../../configuration/common/validator';

export enum DocumentSwitchTriggerStrategy {
	Always = 'always',
	AfterAcceptance = 'afterAcceptance',
}

export namespace DocumentSwitchTriggerStrategy {
	export const VALIDATOR = vEnum(DocumentSwitchTriggerStrategy.Always, DocumentSwitchTriggerStrategy.AfterAcceptance);
}
