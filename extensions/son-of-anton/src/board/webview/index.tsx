/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Bundle entry point for the Task Board React webview.
 *
 * Mounts <BoardApp /> on `#root`. The host (TaskBoardPanel.ts) is
 * responsible for serving an HTML stub with that root div + a script tag
 * pointing at the bundled output of this file.
 */

import { createRoot } from 'react-dom/client';
import { BoardApp } from './BoardApp';

const rootEl = document.getElementById('root');
if (rootEl) {
	const root = createRoot(rootEl);
	root.render(<BoardApp />);
}
