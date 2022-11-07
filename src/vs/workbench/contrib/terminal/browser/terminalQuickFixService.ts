/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalQuickFixOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalQuickFixService } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	_serviceBrand: undefined;
	quickFixes(): ITerminalQuickFixOptions[] {
		if (!this._providers) {
			return [];
		}
		const resultFixes: ITerminalQuickFixOptions[] = [];
		for (const [extensionId, fixes] of this._providers.entries()) {
			for (const fix of fixes) {
				fix.source = extensionId;
				fix.isExtensionContributed = true;
				resultFixes.push(fix);
			}
		}
		return resultFixes;
	}
	private readonly _providers: Map</*ext id*/string, ITerminalQuickFixOptions[]> = new Map();

	registerQuickFixProvider(extensionIdentifier: string, provider: { provideQuickFixes(): ITerminalQuickFixOptions[]; }): IDisposable {
		const fixes = provider.provideQuickFixes();
		this._providers.set(extensionIdentifier, fixes);
		return toDisposable(() => this._providers.delete(extensionIdentifier));
	}
}
