/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable, DisposableStore, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { TS7StructuralDiffProvider } from './ts7/structuralDiffProvider';
import { TypeScript } from './tsService';

export class StructuralDiffContribution extends Disposable {
	constructor(@ILogService logService: ILogService) {
		super();
		if (typeof vscode.languages.registerStructuralDiffProvider !== 'function') {
			return;
		}
		const registration = this._register(new MutableDisposable<DisposableStore>());
		const update = () => {
			registration.clear();
			if (!TypeScript.runsVersion7()) {
				return;
			}
			const resources = new DisposableStore();
			registration.value = resources;
			const provider = resources.add(new TS7StructuralDiffProvider(logService));
			resources.add(vscode.languages.registerStructuralDiffProvider([
				{ language: 'typescript', scheme: 'file' },
				{ language: 'typescriptreact', scheme: 'file' },
			], {
				provideStructuralDiff: (original, modified, context, token) => TypeScript.runsVersion7()
					? provider.provideStructuralDiff(original, modified, context, token)
					: undefined,
			}));
		};
		this._register(vscode.workspace.onDidChangeConfiguration(event => {
			if (TypeScript.affectsVersion(event)) {
				update();
			}
		}));
		update();
	}
}
