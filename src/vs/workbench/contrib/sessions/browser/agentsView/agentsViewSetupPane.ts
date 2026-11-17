/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewPane } from '../../../../browser/parts/views/viewPane.js';

/** The Agents view while chat needs signing in or setting up: its welcome content shows how to. */
export class AgentsViewSetupPane extends ViewPane {

	override shouldShowWelcome(): boolean {
		return true;
	}
}
