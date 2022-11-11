/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalQuickFixService, TerminalQuickFixAction } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	_serviceBrand: undefined;
	// async quickFixes(): Promise<TerminalQuickFix[]> {
	// 	if (!this._providers) {
	// 		return [];
	// 	}
	// 	const resultFixes: TerminalQuickFix[] = [];
	// 	for (const [extensionId, provider] of this._providers.entries()) {
	// 		let result = await provider.provideQuickFixes();
	// 		if (!result) {
	// 			continue;
	// 		}
	// 		if (!Array.isArray(result)) {
	// 			result = [result];
	// 		}
	// 		for (const fix of result) {
	// 			if (typeof fix === 'object') {
	// 				resultFixes.push(fix);
	// 			}
	// 		}
	// 	}
	// 	return resultFixes;
	// }
	providers: Map</*ext id*/string, { provideQuickFixes(matchResult: { commandLineMatch: string; outputMatch?: string; exitStatus?: number }): Promise<TerminalQuickFixAction[] | TerminalQuickFixAction | undefined> }> = new Map();

	registerQuickFixProvider(extensionIdentifier: string, provider: { provideQuickFixes(matchResult: { commandLineMatch: string; outputMatch?: string; exitStatus?: number }): Promise<TerminalQuickFixAction[] | TerminalQuickFixAction | undefined> }): IDisposable {
		this.providers.set(extensionIdentifier, provider);
		return toDisposable(() => this.providers.delete(extensionIdentifier));
	}
}
