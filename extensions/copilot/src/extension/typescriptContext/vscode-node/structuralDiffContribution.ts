/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable, DisposableStore, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { TS6StructuralDiffProvider } from './ts6/structuralDiffProvider';
import { TS7StructuralDiffProvider } from './ts7/structuralDiffProvider';
import { TypeScript } from './tsService';

export class StructuralDiffContribution extends Disposable {
	constructor(@ILogService logService: ILogService) {
		super();
		if (typeof vscode.languages.registerStructuralDiffProvider !== 'function') {
			return;
		}
		// Like the TypeScript extension, run TS7 only while a native TypeScript extension is installed and fall back to TS6 otherwise.
		const runsVersion7 = () => TypeScript.runsVersion7() && TypeScript.getVersion7Extension() !== undefined;
		const registration = this._register(new MutableDisposable<DisposableStore>());
		let registeredVersion7: boolean | undefined;
		const update = () => {
			const version7 = runsVersion7();
			if (version7 === registeredVersion7) {
				return;
			}
			registeredVersion7 = version7;
			registration.clear();
			const resources = new DisposableStore();
			registration.value = resources;
			const provider = resources.add(version7 ? new TS7StructuralDiffProvider(logService) : new TS6StructuralDiffProvider());
			resources.add(vscode.languages.registerStructuralDiffProvider([
				{ language: 'typescript', scheme: 'file' },
				{ language: 'typescriptreact', scheme: 'file' },
				{ language: 'typescript', scheme: 'git' },
				{ language: 'typescriptreact', scheme: 'git' },
			], {
				provideStructuralDiff: (original, modified, context, token) => runsVersion7() === version7
					? provider.provideStructuralDiff(original, modified, context, token)
					: undefined,
			}));
		};
		this._register(vscode.workspace.onDidChangeConfiguration(event => {
			if (TypeScript.affectsVersion(event)) {
				update();
			}
		}));
		this._register(vscode.extensions.onDidChange(update));
		update();
	}
}
