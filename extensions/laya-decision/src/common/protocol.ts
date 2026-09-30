/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Question } from './types';

/**
 * Messages exchanged between the extension host and the model worker process over Node IPC.
 */

export interface LoadOptions {
	/** Folder holding the exported ONNX bundle. */
	readonly modelDir: string;
	/** Number of intra-op threads for the ONNX session. */
	readonly intraOpNumThreads: number;
}

export type HostToWorkerMessage =
	| { readonly type: 'load'; readonly id: number; readonly options: LoadOptions }
	| { readonly type: 'decide'; readonly id: number; readonly state: unknown; readonly questions: Record<string, Question> };

export type WorkerToHostMessage =
	| { readonly type: 'loaded'; readonly id: number; readonly loadTimeMs: number }
	| { readonly type: 'result'; readonly id: number; readonly result: unknown; readonly inferenceTimeMs: number }
	| { readonly type: 'error'; readonly id: number; readonly message: string };
