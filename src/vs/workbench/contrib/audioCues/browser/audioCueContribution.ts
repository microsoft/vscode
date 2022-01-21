/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Event } from 'vs/base/common/event';
import { isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { raceTimeout } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FoldingModel } from 'vs/editor/contrib/folding/browser/foldingModel';

export class AudioCueContribution extends DisposableStore implements IWorkbenchContribution {
	private audioCuesEnabled = false;
	private readonly store = this.add(new DisposableStore());

	constructor(
		@IDebugService readonly debugService: IDebugService,
		@IEditorService readonly editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super();

		this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
			this.updateAudioCuesEnabled();
		});

		this.add(
			_configurationService.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('audioCues.enabled')) {
					this.updateAudioCuesEnabled();
				}
			})
		);

		this.updateAudioCuesEnabled();
	}

	private getAudioCuesEnabled(): boolean {
		const value = this._configurationService.getValue<'auto' | 'on' | 'off'>('audioCues.enabled');
		if (value === 'on') {
			return true;
		} else if (value === 'auto') {
			return this.accessibilityService.isScreenReaderOptimized();
		} else {
			return false;
		}
	}

	private updateAudioCuesEnabled() {
		const newValue = this.getAudioCuesEnabled();
		if (newValue === this.audioCuesEnabled) {
			return;
		}
		this.audioCuesEnabled = newValue;
		if (!this.audioCuesEnabled) {
			this.store.clear();
			return;
		}

		this.store.add(
			Event.runAndSubscribeWithStore(
				this.editorService.onDidActiveEditorChange,
				(_, store) => {
					let lastLineNumber = -1;
					let hadBreakpoint = false;
					let hadMarker = false;
					let hadFoldedArea = false;

					const activeTextEditorControl =
						this.editorService.activeTextEditorControl;
					if (
						isCodeEditor(activeTextEditorControl) ||
						isDiffEditor(activeTextEditorControl)
					) {
						const editor = isDiffEditor(activeTextEditorControl)
							? activeTextEditorControl.getOriginalEditor()
							: activeTextEditorControl;

						let foldingModel: FoldingModel | null = null;
						editor
							.getContribution<FoldingController>(FoldingController.ID)
							?.getFoldingModel()
							?.then((newFoldingModel) => {
								foldingModel = newFoldingModel;
								update();
							});

						const update = () => {
							const model = editor.getModel();
							if (!model) {
								return;
							}
							const position = editor.getPosition();
							if (!position) {
								return;
							}
							const lineNumber = position.lineNumber;

							const uri = model.uri;

							const breakpoints = this.debugService
								.getModel()
								.getBreakpoints({ uri, lineNumber });
							const hasBreakpoints = breakpoints.length > 0;

							if (hasBreakpoints && !hadBreakpoint) {
								this.handleBreakpointOnLine();
							}
							hadBreakpoint = hasBreakpoints;

							const hasMarker = this.markerService
								.read({ resource: uri })
								.some(
									(m) =>
										m.severity === MarkerSeverity.Error &&
										m.startLineNumber <= lineNumber &&
										lineNumber <= m.endLineNumber
								);

							if (hasMarker && !hadMarker) {
								this.handleErrorOnLine();
							}
							hadMarker = hasMarker;

							const regionAtLine = foldingModel?.getRegionAtLine(lineNumber);
							const hasFolding = !regionAtLine ? false : regionAtLine.isCollapsed && regionAtLine.startLineNumber === lineNumber;
							if (hasFolding && !hadFoldedArea) {
								this.handleFoldedAreasOnLine();
							}
							hadFoldedArea = hasFolding;
						};

						store.add(
							editor.onDidChangeCursorPosition(() => {
								const model = editor.getModel();
								if (!model) {
									return;
								}
								const position = editor.getPosition();
								if (!position) {
									return;
								}
								const lineNumber = position.lineNumber;
								if (lineNumber === lastLineNumber) {
									return;
								}
								lastLineNumber = lineNumber;
								hadMarker = false;
								hadBreakpoint = false;
								hadFoldedArea = false;
								update();
							})
						);
						store.add(
							this.markerService.onMarkerChanged(() => {
								update();
							})
						);
						store.add(
							this.debugService.getModel().onDidChangeBreakpoints(() => {
								update();
							})
						);

						update();
					}
				}
			)
		);
	}

	private handleBreakpointOnLine(): void {
		this.playSound('break');
	}

	private handleErrorOnLine(): void {
		this.playSound('error');
	}

	private handleFoldedAreasOnLine(): void {
		this.playSound('foldedAreas');
	}

	private async playSound(fileName: string) {
		if (!this.audioCuesEnabled) {
			return;
		}

		const url = FileAccess.asBrowserUri(`vs/workbench/contrib/audioCues/browser/media/${fileName}.opus`, require).toString();
		const audio = new Audio(url);

		try {
			try {
				// Don't play when loading takes more than 1s, due to loading, decoding or playing issues.
				// Delayed sounds are very confusing.
				await raceTimeout(audio.play(), 1000);
			} catch (e) {
				console.error('Error while playing sound', e);
			}
		} finally {
			audio.remove();
		}
	}
}
