/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';

export const inAgentSessionProjection = new RawContextKey<boolean>('chatInAgentSessionProjection', false, { type: 'boolean', description: localize('chatInAgentSessionProjection', "True when the workbench is in agent session projection mode for reviewing an agent session.") });
