/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITerminalQuickFixOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalQuickFixService } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	_serviceBrand: undefined;
	async quickFixes(): Promise<ITerminalQuickFixOptions[]> {
		if (!this._providers) {
			return [];
		}
		const resultFixes: ITerminalQuickFixOptions[] = [];
		for (const [extensionId, provider] of this._providers.entries()) {
			const result = await provider.provideQuickFixes();
			if (!result) {
				continue;
			}
			for (const fix of result) {
				fix.source = extensionId;
				fix.isExtensionContributed = true;
				resultFixes.push(fix);
			}
		}
		return resultFixes;
	}
	private readonly _providers: Map</*ext id*/string, { provideQuickFixes(): Promise<ITerminalQuickFixOptions[] | null | undefined>; }> = new Map();

	registerQuickFixProvider(extensionIdentifier: string, provider: { provideQuickFixes(): Promise<ITerminalQuickFixOptions[] | null | undefined>; }): IDisposable {
		this._providers.set(extensionIdentifier, provider);
		return toDisposable(() => this._providers.delete(extensionIdentifier));
	}
}
