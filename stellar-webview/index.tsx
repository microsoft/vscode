/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from './components/ChatPanel';

/**
 * Entry point for the Stellar chat webview
 * This file is bundled and loaded inside the VS Code webview panel
 */
const container = document.getElementById('root');
if (container) {
	const root = createRoot(container);
	root.render(
		<React.StrictMode>
			<ChatPanel />
		</React.StrictMode>
	);
}

