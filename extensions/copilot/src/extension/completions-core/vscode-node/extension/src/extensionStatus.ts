/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../util/common/services';
import { Command, StatusKind } from '../../types/src';

export const ICompletionsExtensionStatus = createServiceIdentifier<ICompletionsExtensionStatus>('ICompletionsExtensionStatus');
export interface ICompletionsExtensionStatus {
	readonly _serviceBrand: undefined;

	kind: StatusKind;
	message?: string;
	busy: boolean;
	command?: Command;
}

export class CopilotExtensionStatus implements ICompletionsExtensionStatus {
	declare _serviceBrand: undefined;
	constructor(
		public kind: StatusKind = 'Normal',
		public message?: string,
		public busy = false,
		public command?: Command
	) { }
}
