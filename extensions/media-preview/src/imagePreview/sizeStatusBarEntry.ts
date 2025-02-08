/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PreviewStatusBarEntry } from '../ownedStatusBarEntry';


export class SizeStatusBarEntry extends PreviewStatusBarEntry {

	constructor() {
		super('status.imagePreview.size', vscode.l10n.t("Image Size"), vscode.StatusBarAlignment.Right, 101 /* to the left of editor status (100) */);
	}

	public show(owner: unknown, text: string) {
		this.showItem(owner, text);
	}
}
