/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISession } from '../../../services/sessions/common/session.js';

export async function createAndOpenPullRequestSession(
	createSession: (onSessionCreated: (session: ISession) => void) => Promise<ISession | undefined>,
	showSession: (resource: URI) => void,
	onDidShowSession: () => void,
): Promise<ISession | undefined> {
	return createSession(session => {
		showSession(session.resource);
		onDidShowSession();
	});
}
