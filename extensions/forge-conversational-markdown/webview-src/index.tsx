/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { render } from 'preact';
import type { FromWebviewMessage } from '../src/protocol/types';
import { App } from './App';

declare function acquireVsCodeApi(): {
	postMessage(message: FromWebviewMessage): void;
};

const vscode = acquireVsCodeApi();

const root = document.getElementById('root');
if (root) {
	render(<App vscode={vscode} />, root);
}
