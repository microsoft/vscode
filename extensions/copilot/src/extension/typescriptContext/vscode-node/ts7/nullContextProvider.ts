/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project } from '@typescript/native/unstable/async';
import { ContextProvider, type ComputeContextSession, type ContextRunnableCollector, type RequestContext } from './contextProvider';
import type { CancellationTokenWithTimer } from './typescripts';

export class NullContextProvider extends ContextProvider {
	public override async provide(_result: ContextRunnableCollector, _session: ComputeContextSession, _project: Project, _context: RequestContext, _token: CancellationTokenWithTimer): Promise<void> {
	}
}
