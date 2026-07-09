/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';

/**
 * Code data transfer mime types specific to the Agents window.
 */
export const SessionsDataTransfers = {
	/** Mime type used to identify a session being dragged within the application. */
	SESSION: 'application/vnd.code.session',
};

/**
 * Identifier used to track a session being dragged via
 * {@link LocalSelectionTransfer}. Mirrors the editor's
 * {@link DraggedEditorIdentifier} pattern.
 */
export class DraggedSessionIdentifier {

	constructor(
		readonly sessionId: string,
		readonly resource: URI,
	) { }
}
