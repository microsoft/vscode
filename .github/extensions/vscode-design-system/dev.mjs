/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'node:url';
import { createStorybookPanel } from './storybook-host.mjs';

const panel = await createStorybookPanel(fileURLToPath(new URL('../../../', import.meta.url)));
console.log(`VS Code Design System: ${panel.url}`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, async () => {
		if (!closing) {
			closing = true;
			await panel.close();
		}
	});
}
