/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerAudioPreviewSupport } from './audioPreview';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { registerImagePreviewSupport } from './imagePreview';
import { registerVideoPreviewSupport } from './videoPreview';

export function activate(context: vscode.ExtensionContext) {
	const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(binarySizeStatusBarEntry);

	context.subscriptions.push(registerImagePreviewSupport(context, binarySizeStatusBarEntry));
	context.subscriptions.push(registerAudioPreviewSupport(context, binarySizeStatusBarEntry));
	context.subscriptions.push(registerVideoPreviewSupport(context, binarySizeStatusBarEntry));
}
