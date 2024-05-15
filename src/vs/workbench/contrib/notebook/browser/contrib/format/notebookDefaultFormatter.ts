/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';


export class NotebookDefaultFormatter extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebook.defaultFormatter';
	static readonly configName = 'notebook.defaultFormatter';

	static extensionIds: (string | null)[] = [];
	static extensionItemLabels: string[] = [];
	static extensionDescriptions: string[] = [];

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super();
		this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
		this._updateConfigValues();
	}

	private async _updateConfigValues(): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		let extensions = [...this._extensionService.extensions];

		extensions = extensions.sort((a, b) => {
			const boostA = a.categories?.find(cat => cat === 'Formatters' || cat === 'Programming Languages');
			const boostB = b.categories?.find(cat => cat === 'Formatters' || cat === 'Programming Languages');

			if (boostA && !boostB) {
				return -1;
			} else if (!boostA && boostB) {
				return 1;
			} else {
				return a.name.localeCompare(b.name);
			}
		});

		NotebookDefaultFormatter.extensionIds.length = 0;
		NotebookDefaultFormatter.extensionItemLabels.length = 0;
		NotebookDefaultFormatter.extensionDescriptions.length = 0;

		NotebookDefaultFormatter.extensionIds.push(null);
		NotebookDefaultFormatter.extensionItemLabels.push(nls.localize('null', 'None'));
		NotebookDefaultFormatter.extensionDescriptions.push(nls.localize('nullFormatterDescription', "None"));

		for (const extension of extensions) {
			if (extension.main || extension.browser) {
				NotebookDefaultFormatter.extensionIds.push(extension.identifier.value);
				NotebookDefaultFormatter.extensionItemLabels.push(extension.displayName ?? '');
				NotebookDefaultFormatter.extensionDescriptions.push(extension.description ?? '');
			}
		}
	}

	static _maybeQuotes(s: string): string {
		return s.match(/\s/) ? `'${s}'` : s;
	}
}
