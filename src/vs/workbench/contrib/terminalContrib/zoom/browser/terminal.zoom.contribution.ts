/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Event } from '../../../../../base/common/event.js';
import { IMouseWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { MouseWheelClassifier } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type IDetachedCompatibleTerminalContributionContext, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { localize2 } from '../../../../../nls.js';
import { isNumber } from '../../../../../base/common/types.js';
import { defaultTerminalFontSize } from '../../../terminal/common/terminalConfiguration.js';
import { TerminalZoomCommandId, TerminalZoomSettingId } from '../common/terminal.zoom.js';
import * as dom from '../../../../../base/browser/dom.js';

class TerminalMouseWheelZoomContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.mouseWheelZoom';

	/**
	 * Currently focused find widget. This is used to track action context since
	 * 'active terminals' are only tracked for non-detached terminal instanecs.
	 */
	static activeFindWidget?: TerminalMouseWheelZoomContribution;

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalMouseWheelZoomContribution | null {
		return instance.getContribution<TerminalMouseWheelZoomContribution>(TerminalMouseWheelZoomContribution.ID);
	}

	private readonly _listener = this._register(new MutableDisposable());

	constructor(
		_ctx: ITerminalContributionContext | IDetachedCompatibleTerminalContributionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalZoomSettingId.MouseWheelZoom)) {
				if (!!this._configurationService.getValue(TerminalZoomSettingId.MouseWheelZoom)) {
					this._setupMouseWheelZoomListener(xterm.raw);
				} else {
					this._listener.clear();
				}
			}
		}));
	}

	private _getConfigFontSize(): number {
		return this._configurationService.getValue(TerminalSettingId.FontSize);
	}

	private _clampFontSize(fontSize: number): number {
		return clampTerminalFontSize(fontSize);
	}

	private _setupMouseWheelZoomListener(raw: RawXtermTerminal) {
		// This is essentially a copy of what we do in the editor, just we modify font size directly
		// as there is no separate zoom level concept in the terminal
		const classifier = MouseWheelClassifier.INSTANCE;

		let prevMouseWheelTime = 0;
		let gestureStartFontSize = this._getConfigFontSize();
		let gestureHasZoomModifiers = false;
		let gestureAccumulatedDelta = 0;

		const wheelListener = (browserEvent: WheelEvent) => {
			if (classifier.isPhysicalMouseWheel()) {
				if (this._hasMouseWheelZoomModifiers(browserEvent)) {
					const delta = browserEvent.deltaY > 0 ? -1 : 1;
					const newFontSize = this._clampFontSize(this._getConfigFontSize() + delta);
					this._configurationService.updateValue(TerminalSettingId.FontSize, newFontSize);
					// EditorZoom.setZoomLevel(zoomLevel + delta);
					browserEvent.preventDefault();
					browserEvent.stopPropagation();
				}
			} else {
				// we consider mousewheel events that occur within 50ms of each other to be part of the same gesture
				// we don't want to consider mouse wheel events where ctrl/cmd is pressed during the inertia phase
				// we also want to accumulate deltaY values from the same gesture and use that to set the zoom level
				if (Date.now() - prevMouseWheelTime > 50) {
					// reset if more than 50ms have passed
					gestureStartFontSize = this._getConfigFontSize();
					gestureHasZoomModifiers = this._hasMouseWheelZoomModifiers(browserEvent);
					gestureAccumulatedDelta = 0;
				}

				prevMouseWheelTime = Date.now();
				gestureAccumulatedDelta += browserEvent.deltaY;

				if (gestureHasZoomModifiers) {
					const deltaAbs = Math.ceil(Math.abs(gestureAccumulatedDelta / 5));
					const deltaDirection = gestureAccumulatedDelta > 0 ? -1 : 1;
					const delta = deltaAbs * deltaDirection;
					const newFontSize = this._clampFontSize(gestureStartFontSize + delta);
					this._configurationService.updateValue(TerminalSettingId.FontSize, newFontSize);
					gestureAccumulatedDelta += browserEvent.deltaY;
					browserEvent.preventDefault();
					browserEvent.stopPropagation();
				}
			}
		};

		// Use the capture phase to ensure we catch the event before the terminal's scrollable element consumes it
		this._listener.value = dom.addDisposableListener(raw.element!, dom.EventType.MOUSE_WHEEL, wheelListener, { capture: true, passive: false });
	}

	private _hasMouseWheelZoomModifiers(browserEvent: WheelEvent | IMouseWheelEvent): boolean {
		return (
			isMacintosh
				// on macOS we support cmd + two fingers scroll (`metaKey` set)
				// and also the two fingers pinch gesture (`ctrKey` set)
				? ((browserEvent.metaKey || browserEvent.ctrlKey) && !browserEvent.shiftKey && !browserEvent.altKey)
				: (browserEvent.ctrlKey && !browserEvent.metaKey && !browserEvent.shiftKey && !browserEvent.altKey)
		);
	}
}

registerTerminalContribution(TerminalMouseWheelZoomContribution.ID, TerminalMouseWheelZoomContribution, true);

registerTerminalAction({
	id: TerminalZoomCommandId.FontZoomIn,
	title: localize2('fontZoomIn', 'Increase Font Size'),
	run: async (c, accessor) => {
		const configurationService = accessor.get(IConfigurationService);
		const value = configurationService.getValue(TerminalSettingId.FontSize);
		if (isNumber(value)) {
			const newFontSize = clampTerminalFontSize(value + 1);
			await configurationService.updateValue(TerminalSettingId.FontSize, newFontSize);
		}
	}
});

registerTerminalAction({
	id: TerminalZoomCommandId.FontZoomOut,
	title: localize2('fontZoomOut', 'Decrease Font Size'),
	run: async (c, accessor) => {
		const configurationService = accessor.get(IConfigurationService);
		const value = configurationService.getValue(TerminalSettingId.FontSize);
		if (isNumber(value)) {
			const newFontSize = clampTerminalFontSize(value - 1);
			await configurationService.updateValue(TerminalSettingId.FontSize, newFontSize);
		}
	}
});

registerTerminalAction({
	id: TerminalZoomCommandId.FontZoomReset,
	title: localize2('fontZoomReset', 'Reset Font Size'),
	run: async (c, accessor) => {
		const configurationService = accessor.get(IConfigurationService);
		await configurationService.updateValue(TerminalSettingId.FontSize, defaultTerminalFontSize);
	}
});

export function clampTerminalFontSize(fontSize: number): number {
	return Math.max(6, Math.min(100, fontSize));
}
