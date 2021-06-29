/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { ImagePreviewManager } from './imagePreview';
import { SvgPreviewManager } from './svgPreview';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { ZoomStatusBarEntry } from './zoomStatusBarEntry';

export function activate(context: vscode.ExtensionContext) {
	const imageSizeStatusBarEntry = new SizeStatusBarEntry();
	context.subscriptions.push(imageSizeStatusBarEntry);

	const imageBinarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(imageBinarySizeStatusBarEntry);

	const imageZoomStatusBarEntry = new ZoomStatusBarEntry();
	context.subscriptions.push(imageZoomStatusBarEntry);

	const imagePreviewManager = new ImagePreviewManager(context.extensionUri, imageSizeStatusBarEntry, imageBinarySizeStatusBarEntry, imageZoomStatusBarEntry);

	context.subscriptions.push(vscode.window.registerCustomEditorProvider(ImagePreviewManager.viewType, imagePreviewManager, {
		supportsMultipleEditorsPerDocument: true
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomIn', () => {
		imagePreviewManager.activePreview?.zoomIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomOut', () => {
		imagePreviewManager.activePreview?.zoomOut();
	}));

	const svgSizeStatusBarEntry = new SizeStatusBarEntry();
	context.subscriptions.push(svgSizeStatusBarEntry);

	const svgBinarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(svgBinarySizeStatusBarEntry);

	const svgZoomStatusBarEntry = new ZoomStatusBarEntry();
	context.subscriptions.push(svgZoomStatusBarEntry);

	const svgPreviewManager = new SvgPreviewManager(context.extensionUri, svgSizeStatusBarEntry, svgBinarySizeStatusBarEntry, svgZoomStatusBarEntry);

	context.subscriptions.push(vscode.window.registerCustomEditorProvider(SvgPreviewManager.viewType, svgPreviewManager, {
		supportsMultipleEditorsPerDocument: true
	}));

	context.subscriptions.push(vscode.commands.registerCommand('svgPreview.showPreview', () => {
		svgPreviewManager.activePreview?.showPreviewToSide();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('svgPreview.showPreview', () => {
		svgPreviewManager.activePreview?.showPreview();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('svgPreview.showSource', () => {
		svgPreviewManager.activePreview?.showSource();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('svgPreview.zoomIn', () => {
		svgPreviewManager.activePreview?.zoomIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('svgPreview.zoomOut', () => {
		svgPreviewManager.activePreview?.zoomOut();
	}));

}
