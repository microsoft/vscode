/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { computeUnifiedDiff } from '../../src/vs/sessions/browser/parts/mobile/contributions/mobileDiffHelpers.js';

interface IComputeDiffRequest {
	readonly id: number;
	readonly originalText: string;
	readonly modifiedText: string;
}

self.addEventListener('message', (event: MessageEvent<IComputeDiffRequest>) => {
	const { id, originalText, modifiedText } = event.data;
	try {
		self.postMessage({ id, hunks: computeUnifiedDiff(originalText, modifiedText) });
	} catch (error) {
		self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
	}
});

self.postMessage({ type: 'ready' });
