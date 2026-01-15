/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection } from '@playwright/mcp';
import { getApplication } from './application';
import { Application } from '../../automation';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export async function getServer(app?: Application): Promise<Server> {
	const application = app ?? await getApplication();
	const connection = await createConnection(
		{
			capabilities: ['core', 'pdf', 'vision']
		},
		// eslint-disable-next-line local/code-no-any-casts
		() => Promise.resolve(application.code.driver.browserContext as any)
	);
	application.code.driver.browserContext.on('close', async () => {
		await connection.close();
	});
	return connection;
}
