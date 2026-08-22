/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { serializeNotebookToBytes } from './serializers';
import type { NotebookData } from 'vscode';

onmessage = (e) => {
	const data = e.data as { id: string; data: NotebookData };
	postMessage({ id: data.id, data: serializeNotebookToBytes(data.data) });
};
