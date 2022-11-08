/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalQuickFixOptions } from 'vs/workbench/contrib/terminal/browser/terminal';

export interface TerminalQuickFixProvider {
	/**
	 * Provides terminal quick fixes.
	 * @param token A cancellation token indicating the result is no longer needed
	 * @return an array of terminal quick fixes
	 */
	provideQuickFixes(token: CancellationToken): ITerminalQuickFixOptions[];
}

export namespace window {
	/** Registers a provider that gives terminal quick fixes to be registered
	 * @param provider The provider that provides terminal quick fixes
	 * @return Disposable that unregisters the provider and its associated quick fixes
	 */
	export function registerQuickFixProvider(quickFixes: ITerminalQuickFixOptions[]): Disposable;
}
