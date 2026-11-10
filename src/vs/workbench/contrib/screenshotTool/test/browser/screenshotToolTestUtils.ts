/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IScreenshotToolCaptureEvent, IScreenshotToolImage, SCREENSHOT_TOOL_ENABLED_SETTING_ID, ScreenshotToolMode, ScreenshotToolResult } from '../../browser/screenshotTool.js';
import { ScreenshotToolService } from '../../browser/screenshotToolService.js';

/** Records experiment triggers and screenshot tool events. */
export class TestScreenshotToolTelemetryService extends TestExperimentTriggerTelemetryService {
	readonly captures: Omit<IScreenshotToolCaptureEvent, 'durationMs'>[] = [];
	private readonly _onDidLogCapture = new Emitter<void>();
	/** Fires after an entry point reported its outcome, which is the last thing it does. */
	readonly onDidLogCapture = this._onDidLogCapture.event;

	override publicLog2(eventName?: string, data?: object): void {
		super.publicLog2(eventName, data);
		if (eventName === 'screenshotTool.capture' && data) {
			const { durationMs, ...capture } = data as IScreenshotToolCaptureEvent;
			if (typeof durationMs === 'number' && durationMs >= 0) {
				this.captures.push(capture);
			}
			this._onDidLogCapture.fire();
		}
	}
}

/** Keeps the experiment and telemetry logic of the screenshot tool, and returns scripted captures. */
export class TestScreenshotToolService extends ScreenshotToolService {
	readonly requests: string[] = [];
	result: ScreenshotToolResult = { kind: 'cancelled', mode: 'none' };
	windowImage: IScreenshotToolImage | undefined;
	/** Runs while a scripted capture is active, as a selection or an annotation would. */
	duringSession: (() => void) | undefined;

	private readonly _onDidChangeScriptedActive = this._register(new Emitter<{ readonly targetWindow: CodeWindow; readonly active: boolean }>());
	override readonly onDidChangeActive = this._onDidChangeScriptedActive.event;

	protected override get isSupported(): boolean {
		return true;
	}

	override async captureAndAnnotate(targetWindow: CodeWindow): Promise<ScreenshotToolResult> {
		this.requests.push('captureAndAnnotate');
		this.runSession(targetWindow);
		return this.result;
	}

	override async captureWindow(): Promise<IScreenshotToolImage | undefined> {
		this.requests.push('captureWindow');
		return this.windowImage;
	}

	override async annotate(targetWindow: CodeWindow, image: IScreenshotToolImage, mode: ScreenshotToolMode): Promise<ScreenshotToolResult> {
		this.requests.push(`annotate ${mode} ${image.width}x${image.height}`);
		this.runSession(targetWindow);
		return this.result;
	}

	private runSession(targetWindow: CodeWindow): void {
		this._onDidChangeScriptedActive.fire({ targetWindow, active: true });
		this.duringSession?.();
		this._onDidChangeScriptedActive.fire({ targetWindow, active: false });
	}
}

export function createTestScreenshotToolService(store: Pick<DisposableStore, 'add'>, enabled: boolean): { readonly service: TestScreenshotToolService; readonly telemetry: TestScreenshotToolTelemetryService } {
	const telemetry = new TestScreenshotToolTelemetryService();
	const service = store.add(new TestScreenshotToolService(
		new TestConfigurationService({ [SCREENSHOT_TOOL_ENABLED_SETTING_ID]: enabled }),
		telemetry,
		new class extends mock<IHostService>() { }(),
		new class extends mock<IWorkbenchLayoutService>() { }(),
		new TestAccessibilityService(),
		new MockKeybindingService(),
		new MockContextKeyService(),
		new NullLogService(),
	));
	return { service, telemetry };
}
