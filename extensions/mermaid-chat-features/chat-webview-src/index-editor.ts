/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { initializeMermaidWebview } from './mermaidWebview';
import { VsCodeApi } from './vscodeApi';

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();


initializeMermaidWebview(vscode);
