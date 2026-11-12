/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IScreenshotToolCaptureEvent, IScreenshotToolEdit, IScreenshotToolEditable, IScreenshotToolImage, ScreenshotToolResult, ScreenshotToolSurface } from '../../browser/screenshotTool.js';
import { ScreenshotToolService } from '../../browser/screenshotToolService.js';

/** Records screenshot tool events. */
export class TestScreenshotToolTelemetryService extends NullTelemetryServiceShape {
	readonly captures: Omit<IScreenshotToolCaptureEvent, 'durationMs'>[] = [];
	readonly edits: object[] = [];
	private readonly _onDidLogCapture = new Emitter<void>();
	/** Fires after an entry point reported its outcome, which is the last thing it does. */
	readonly onDidLogCapture = this._onDidLogCapture.event;

	override publicLog2(eventName?: string, data?: object): void {
		if (eventName === 'screenshotTool.capture' && data) {
			const { durationMs, ...capture } = data as IScreenshotToolCaptureEvent;
			if (typeof durationMs === 'number' && durationMs >= 0) {
				this.captures.push(capture);
			}
			this._onDidLogCapture.fire();
		} else if (eventName === 'screenshotTool.edit' && data) {
			const { durationMs, ...edit } = data as { durationMs: number };
			if (typeof durationMs === 'number' && durationMs >= 0) {
				this.edits.push(edit);
			}
		}
	}
}

/** Keeps the telemetry logic of the screenshot tool, and returns scripted captures and edits. */
export class TestScreenshotToolService extends ScreenshotToolService {
	/** Whether the tool can capture, as on desktop, or not, as on the web. */
	supported = true;
	readonly requests: string[] = [];
	/** What a capture returns. A pending promise holds the capture until it settles. */
	result: ScreenshotToolResult | Promise<ScreenshotToolResult> = { kind: 'cancelled', mode: 'none' };
	windowImage: IScreenshotToolImage | undefined;
	editResult: IScreenshotToolEdit | undefined;
	/** Runs while a scripted capture is active. */
	duringSession: (() => void) | undefined;

	private readonly _onDidChangeScriptedActive = this._register(new Emitter<{ readonly targetWindow: CodeWindow; readonly active: boolean }>());
	override readonly onDidChangeActive = this._onDidChangeScriptedActive.event;

	private readonly _onDidRequestEdit = this._register(new Emitter<void>());
	/** Fires when an edit starts, which then resolves with `editResult`. */
	readonly onDidRequestEdit = this._onDidRequestEdit.event;

	override get isSupported(): boolean {
		return this.supported;
	}

	override async capture(targetWindow: CodeWindow, _token?: CancellationToken): Promise<ScreenshotToolResult> {
		this.requests.push('capture');
		this.runSession(targetWindow);
		return this.result;
	}

	override async captureWindow(): Promise<IScreenshotToolImage | undefined> {
		this.requests.push('captureWindow');
		return this.windowImage;
	}

	override async edit(screenshot: IScreenshotToolEditable, _surface: ScreenshotToolSurface, name?: string): Promise<IScreenshotToolEdit | undefined> {
		this.requests.push(`edit ${screenshot.original.width}x${screenshot.original.height}${screenshot.annotationState ? ' with annotations' : ''}${name ? ` named ${name}` : ''}`);
		this._onDidRequestEdit.fire();
		return this.editResult;
	}

	private runSession(targetWindow: CodeWindow): void {
		this._onDidChangeScriptedActive.fire({ targetWindow, active: true });
		this.duringSession?.();
		this._onDidChangeScriptedActive.fire({ targetWindow, active: false });
	}
}

export function createTestScreenshotToolService(store: Pick<DisposableStore, 'add'>, supported = true): { readonly service: TestScreenshotToolService; readonly telemetry: TestScreenshotToolTelemetryService } {
	const telemetry = new TestScreenshotToolTelemetryService();
	const service = store.add(new TestScreenshotToolService(
		new TestConfigurationService(),
		telemetry,
		new class extends mock<IHostService>() { }(),
		new class extends mock<IWorkbenchLayoutService>() { }(),
		new TestAccessibilityService(),
		new MockKeybindingService(),
		new MockContextKeyService(),
		new NullLogService(),
		new class extends mock<IEditorService>() { }(),
	));
	service.supported = supported;
	return { service, telemetry };
}
