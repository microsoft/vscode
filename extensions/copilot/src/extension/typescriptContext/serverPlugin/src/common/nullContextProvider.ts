/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';

import { ContextProvider, type ComputeContextSession, type ContextRunnableCollector, type RequestContext } from './contextProvider';

export class NullContextProvider extends ContextProvider {

	constructor() {
		super();
	}

	public provide(_result: ContextRunnableCollector, _session: ComputeContextSession, _languageService: tt.LanguageService, _context: RequestContext, _token: tt.CancellationToken): void {
	}
}