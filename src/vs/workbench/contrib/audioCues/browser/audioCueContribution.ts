/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Event } from 'vs/base/common/event';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { raceTimeout } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

export class AudioCueContribution extends DisposableStore implements IWorkbenchContribution {
	constructor(
		@IDebugService readonly debugService: IDebugService,
		@IEditorService readonly editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		this.add(Event.runAndSubscribeWithStore(editorService.onDidActiveEditorChange, (_, store) => {
			let lastLineNumber = -1;

			const activeTextEditorControl = editorService.activeTextEditorControl;
			if (isCodeEditor(activeTextEditorControl)) {
				store.add(
					activeTextEditorControl.onDidChangeCursorPosition(() => {
						const model = activeTextEditorControl.getModel();
						if (!model) {
							return;
						}
						const position = activeTextEditorControl.getPosition();
						if (!position) {
							return;
						}
						const lineNumber = position.lineNumber;
						if (lineNumber === lastLineNumber) {
							return;
						}
						lastLineNumber = lineNumber;

						const uri = model.uri;

						const breakpoints = debugService.getModel().getBreakpoints({ uri, lineNumber });
						const hasBreakpoints = breakpoints.length > 0;

						if (hasBreakpoints) {
							this.handleBreakpointOnLine();
						}
					})
				);
			}
		}));
	}

	private get audioCuesEnabled(): boolean {
		const value = this._configurationService.getValue<'smart' | 'on' | 'off'>('audioCues.enabled');
		if (value === 'on') {
			return true;
		} else if (value === 'smart') {
			return this.accessibilityService.isScreenReaderOptimized();
		} else {
			return false;
		}
	}

	public handleBreakpointOnLine(): void {
		this.playSound('breakpointHit');
	}

	private async playSound(fileName: string) {
		if (!this.audioCuesEnabled) {
			return;
		}

		const url = FileAccess.asBrowserUri(`vs/workbench/contrib/audioCues/browser/media/${fileName}.webm`, require).toString();
		const audio = new Audio(url);

		try {
			// Don't play when loading takes more than 1s, due to loading, decoding or playing issues.
			// Delayed sounds are very confusing.
			await raceTimeout(audio.play(), 1000);
		} catch (e) {
			audio.remove();
		}
	}
}
