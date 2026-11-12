/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IUntitledDocumentTelemetryService = createDecorator<IUntitledDocumentTelemetryService>('untitledDocumentTelemetryService');

/**
 * Follows untitled text documents from creation to their end (saved, closed) and sends
 * `untitledDocument` telemetry events. All events about the same document carry the same
 * random `untitledDocumentId`, which survives window reloads through hot exit.
 */
export interface IUntitledDocumentTelemetryService {

	readonly _serviceBrand: undefined;

	/**
	 * The telemetry id of the untitled document with this resource, for other events
	 * that want to be correlated with the untitled document funnel.
	 */
	getUntitledDocumentId(resource: URI | undefined): string | undefined;
}
