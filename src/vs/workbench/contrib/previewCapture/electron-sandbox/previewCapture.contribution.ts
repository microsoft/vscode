/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPreviewCaptureService } from '../../../../platform/previewCapture/common/previewCapture.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';

CommandsRegistry.registerCommand('_autothropic.capture.screenshot', async (accessor, proxyPort: number, deviceInfo?: { width: number; height: number; dpr: number }) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.screenshot(proxyPort, deviceInfo);
	} catch (err) {
		logService.error('[previewCapture] screenshot command failed:', err);
		throw err;
	}
});

CommandsRegistry.registerCommand('_autothropic.capture.startClipBuffer', async (accessor, proxyPort: number) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.startClipBuffer(proxyPort);
	} catch (err) {
		logService.error('[previewCapture] startClipBuffer command failed:', err);
		throw err;
	}
});

CommandsRegistry.registerCommand('_autothropic.capture.stopClipBuffer', async (accessor) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.stopClipBuffer();
	} catch (err) {
		logService.error('[previewCapture] stopClipBuffer command failed:', err);
		throw err;
	}
});

CommandsRegistry.registerCommand('_autothropic.capture.getClipThumbnails', async (accessor, seconds: number) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.getClipThumbnails(seconds);
	} catch (err) {
		logService.error('[previewCapture] getClipThumbnails command failed:', err);
		throw err;
	}
});

CommandsRegistry.registerCommand('_autothropic.capture.getSuggestedIndices', async (accessor, seconds: number, maxFrames: number) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.getSuggestedIndices(seconds, maxFrames);
	} catch (err) {
		logService.error('[previewCapture] getSuggestedIndices command failed:', err);
		throw err;
	}
});

CommandsRegistry.registerCommand('_autothropic.capture.grabSelected', async (accessor, indices: number[]) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.grabSelected(indices);
	} catch (err) {
		logService.error('[previewCapture] grabSelected command failed:', err);
		throw err;
	}
});

CommandsRegistry.registerCommand('_autothropic.capture.getClipStatus', async (accessor) => {
	const logService = accessor.get(ILogService);
	try {
		const captureService = accessor.get(IPreviewCaptureService);
		return await captureService.getClipStatus();
	} catch (err) {
		logService.error('[previewCapture] getClipStatus command failed:', err);
		throw err;
	}
});
