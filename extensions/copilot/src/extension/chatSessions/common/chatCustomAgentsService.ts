/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatCustomAgent } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';

export const IChatCustomAgentsService = createServiceIdentifier<IChatCustomAgentsService>('IChatCustomAgentsService');

export interface IChatCustomAgentsService extends IDisposable {
	readonly _serviceBrand: undefined;
	readonly onDidChangeCustomAgents: Event<void>;
	getCustomAgents(): readonly ChatCustomAgent[];
}
