/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { AhpErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

/** The error of an operation on Working Set changes that were updated since the client showed them. */
export function createChangedSinceShownError(resource: URI): ProtocolError {
	return new ProtocolError(AhpErrorCodes.Conflict, localize('agentHost.changeset.workingSet.changedSinceShown', "The changes to '{0}' were updated after they were shown. Try again.", basename(resource)));
}
