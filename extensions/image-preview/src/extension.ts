/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { registerImagePreviewSupport } from './imagePreview';
import { registerAudioPreviewSupport } from './audioPreview';

export function activate(context: vscode.ExtensionContext) {
	const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(binarySizeStatusBarEntry);

	context.subscriptions.push(registerImagePreviewSupport(context, binarySizeStatusBarEntry));
	context.subscriptions.push(registerAudioPreviewSupport(context, binarySizeStatusBarEntry));
}
