/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISession } from '../../../services/sessions/common/session.js';

export async function createAndOpenPullRequestSession(
	createSession: () => Promise<ISession | undefined>,
	openSession: (resource: URI) => Promise<void>,
	onDidComplete: () => void,
): Promise<ISession | undefined> {
	const session = await createSession();
	if (session) {
		await openSession(session.resource);
	}
	onDidComplete();
	return session;
}
