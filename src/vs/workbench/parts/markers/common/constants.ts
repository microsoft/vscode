/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export default {
	MARKERS_PANEL_ID: 'workbench.panel.markers',
	MARKER_COPY_ACTION_ID: 'problems.action.copy',
	MARKER_COPY_MESSAGE_ACTION_ID: 'problems.action.copyMessage',
	MARKER_OPEN_SIDE_ACTION_ID: 'problems.action.openToSide',

	MarkerFocusContextKey: new RawContextKey<boolean>('problemFocus', true)
};
