/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, TimeoutTimer } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { IEditorProgressService, Progress } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption, ShowLightbulbIconMode } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Selection } from '../../../common/core/selection.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { CodeActionProvider, CodeActionTriggerType } from '../../../common/languages.js';
import { CodeActionKind, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from '../common/types.js';
import { getCodeActions } from './codeAction.js';

export const SUPPORTED_CODE_ACTIONS = new RawContextKey<string>('supportedCodeAction', '');

export const APPLY_FIX_ALL_COMMAND_ID = '_typescript.applyFixAllCodeAction';

type TriggeredCodeAction = {
	readonly selection: Selection;
	readonly trigger: CodeActionTrigger;
};

class CodeActionOracle extends Disposable {

	private readonly _autoTriggerTimer = this._register(new TimeoutTimer());

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _markerService: IMarkerService,
		private readonly _signalChange: (triggered: TriggeredCodeAction | undefined) => void,
		private readonly _delay: number = 250,
	) {
		super();
		this._register(this._markerService.onMarkerChanged(e => this._onMarkerChanges(e)));
		this._register(this._editor.onDidChangeCursorPosition(() => this._tryAutoTrigger()));
	}

	public trigger(trigger: CodeActionTrigger): void {
		const selection = this._getRangeOfSelectionUnlessWhitespaceEnclosed(trigger);
		this._signalChange(selection ? { trigger, selection } : undefined);
	}

	private _onMarkerChanges(resources: readonly URI[]): void {
		const model = this._editor.getModel();
		if (model && resources.some(resource => isEqual(resource, model.uri))) {
			this._tryAutoTrigger();
		}
	}

	private _tryAutoTrigger() {
		this._autoTriggerTimer.cancelAndSet(() => {
			this.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
		}, this._delay);
	}

	private _getRangeOfSelectionUnlessWhitespaceEnclosed(trigger: CodeActionTrigger): Selection | undefined {
		if (!this._editor.hasModel()) {
			return undefined;
		}
		const selection = this._editor.getSelection();
		if (trigger.type === CodeActionTriggerType.Invoke) {
			return selection;
		}
		const enabled = this._editor.getOption(EditorOption.lightbulb).enabled;
		if (enabled === ShowLightbulbIconMode.Off) {
			return undefined;
		} else if (enabled === ShowLightbulbIconMode.On) {
			return selection;
		} else if (enabled === ShowLightbulbIconMode.OnCode) {
			const isSelectionEmpty = selection.isEmpty();
			if (!isSelectionEmpty) {
				return selection;
			}
			const model = this._editor.getModel();
			const { lineNumber, column } = selection.getPosition();
			const line = model.getLineContent(lineNumber);
			if (line.length === 0) {
				// empty line
				return undefined;
			} else if (column === 1) {
				// look only right
				if (/\s/.test(line[0])) {
					return undefined;
				}
			} else if (column === model.getLineMaxColumn(lineNumber)) {
				// look only left
				if (/\s/.test(line[line.length - 1])) {
					return undefined;
				}
			} else {
				// look left and right
				if (/\s/.test(line[column - 2]) && /\s/.test(line[column - 1])) {
					return undefined;
				}
			}
		}
		return selection;
	}
}

export namespace CodeActionsState {

	export const enum Type { Empty, Triggered }

	export const Empty = { type: Type.Empty } as const;

	export class Triggered {
		readonly type = Type.Triggered;

		public readonly actions: Promise<CodeActionSet>;

		constructor(
			public readonly trigger: CodeActionTrigger,
			public readonly position: Position,
			private readonly _cancellablePromise: CancelablePromise<CodeActionSet>,
		) {
			this.actions = _cancellablePromise.catch((e): CodeActionSet => {
				if (isCancellationError(e)) {
					return emptyCodeActionSet;
				}
				throw e;
			});
		}

		public cancel() {
			this._cancellablePromise.cancel();
		}
	}

	export type State = typeof Empty | Triggered;
}

const emptyCodeActionSet = Object.freeze<CodeActionSet>({
	allActions: [],
	validActions: [],
	dispose: () => { },
	documentation: [],
	hasAutoFix: false,
	hasAIFix: false,
	allAIFixes: false,
});


export class CodeActionModel extends Disposable {

	private readonly _codeActionOracle = this._register(new MutableDisposable<CodeActionOracle>());
	private _state: CodeActionsState.State = CodeActionsState.Empty;

	private readonly _supportedCodeActions: IContextKey<string>;

	private readonly _onDidChangeState = this._register(new Emitter<CodeActionsState.State>());
	public readonly onDidChangeState = this._onDidChangeState.event;

	private readonly codeActionsDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	private _disposed = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _registry: LanguageFeatureRegistry<CodeActionProvider>,
		private readonly _markerService: IMarkerService,
		contextKeyService: IContextKeyService,
		private readonly _progressService?: IEditorProgressService,
		private readonly _configurationService?: IConfigurationService,
		private readonly _telemetryService?: ITelemetryService
	) {
		super();
		this._supportedCodeActions = SUPPORTED_CODE_ACTIONS.bindTo(contextKeyService);

		this._register(this._editor.onDidChangeModel(() => this._update()));
		this._register(this._editor.onDidChangeModelLanguage(() => this._update()));
		this._register(this._registry.onDidChange(() => this._update()));
		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.lightbulb)) {
				this._update();
			}
		}));
		this._update();
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		super.dispose();
		this.setState(CodeActionsState.Empty, true);
	}

	private _settingEnabledNearbyQuickfixes(): boolean {
		const model = this._editor?.getModel();
		return this._configurationService ? this._configurationService.getValue('editor.codeActionWidget.includeNearbyQuickFixes', { resource: model?.uri }) : false;
	}

	private _update(): void {
		if (this._disposed) {
			return;
		}

		this._codeActionOracle.value = undefined;

		this.setState(CodeActionsState.Empty);

		const model = this._editor.getModel();
		if (model
			&& this._registry.has(model)
			&& !this._editor.getOption(EditorOption.readOnly)
		) {
			const supportedActions: string[] = this._registry.all(model).flatMap(provider => provider.providedCodeActionKinds ?? []);
			this._supportedCodeActions.set(supportedActions.join(' '));

			this._codeActionOracle.value = new CodeActionOracle(this._editor, this._markerService, trigger => {
				if (!trigger) {
					this.setState(CodeActionsState.Empty);
					return;
				}

				const startPosition = trigger.selection.getStartPosition();

				const actions = createCancelablePromise(async token => {
					if (this._settingEnabledNearbyQuickfixes() && trigger.trigger.type === CodeActionTriggerType.Invoke && (trigger.trigger.triggerAction === CodeActionTriggerSource.QuickFix || trigger.trigger.filter?.include?.contains(CodeActionKind.QuickFix))) {
						const codeActionSet = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
						const allCodeActions = [...codeActionSet.allActions];
						if (token.isCancellationRequested) {
							codeActionSet.dispose();
							return emptyCodeActionSet;
						}

						// Search for quickfixes in the curret code action set.
						const foundQuickfix = codeActionSet.validActions?.some(action => action.action.kind ? CodeActionKind.QuickFix.contains(new HierarchicalKind(action.action.kind)) : false);
						const allMarkers = this._markerService.read({ resource: model.uri });
						if (foundQuickfix) {
							for (const action of codeActionSet.validActions) {
								if (action.action.command?.arguments?.some(arg => typeof arg === 'string' && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) {
									action.action.diagnostics = [...allMarkers.filter(marker => marker.relatedInformation)];
								}
							}
							return { validActions: codeActionSet.validActions, allActions: allCodeActions, documentation: codeActionSet.documentation, hasAutoFix: codeActionSet.hasAutoFix, hasAIFix: codeActionSet.hasAIFix, allAIFixes: codeActionSet.allAIFixes, dispose: () => { this.codeActionsDisposable.value = codeActionSet; } };
						} else if (!foundQuickfix) {
							// If markers exist, and there are no quickfixes found or length is zero, check for quickfixes on that line.
							if (allMarkers.length > 0) {
								const currPosition = trigger.selection.getPosition();
								let trackedPosition = currPosition;
								let distance = Number.MAX_VALUE;
								const currentActions = [...codeActionSet.validActions];

								for (const marker of allMarkers) {
									const col = marker.endColumn;
									const row = marker.endLineNumber;
									const startRow = marker.startLineNumber;

									// Found quickfix on the same line and check relative distance to other markers
									if ((row === currPosition.lineNumber || startRow === currPosition.lineNumber)) {
										trackedPosition = new Position(row, col);
										const newCodeActionTrigger: CodeActionTrigger = {
											type: trigger.trigger.type,
											triggerAction: trigger.trigger.triggerAction,
											filter: { include: trigger.trigger.filter?.include ? trigger.trigger.filter?.include : CodeActionKind.QuickFix },
											autoApply: trigger.trigger.autoApply,
											context: { notAvailableMessage: trigger.trigger.context?.notAvailableMessage || '', position: trackedPosition }
										};

										const selectionAsPosition = new Selection(trackedPosition.lineNumber, trackedPosition.column, trackedPosition.lineNumber, trackedPosition.column);
										const actionsAtMarker = await getCodeActions(this._registry, model, selectionAsPosition, newCodeActionTrigger, Progress.None, token);
										if (token.isCancellationRequested) {
											actionsAtMarker.dispose();
											return emptyCodeActionSet;
										}

										if (actionsAtMarker.validActions.length !== 0) {
											for (const action of actionsAtMarker.validActions) {
												if (action.action.command?.arguments?.some(arg => typeof arg === 'string' && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) {
													action.action.diagnostics = [...allMarkers.filter(marker => marker.relatedInformation)];
												}
											}

											if (codeActionSet.allActions.length === 0) {
												allCodeActions.push(...actionsAtMarker.allActions);
											}

											// Already filtered through to only get quickfixes, so no need to filter again.
											if (Math.abs(currPosition.column - col) < distance) {
												currentActions.unshift(...actionsAtMarker.validActions);
											} else {
												currentActions.push(...actionsAtMarker.validActions);
											}
										}
										distance = Math.abs(currPosition.column - col);
									}
								}
								const filteredActions = currentActions.filter((action, index, self) =>
									self.findIndex((a) => a.action.title === action.action.title) === index);

								filteredActions.sort((a, b) => {
									if (a.action.isPreferred && !b.action.isPreferred) {
										return -1;
									} else if (!a.action.isPreferred && b.action.isPreferred) {
										return 1;
									} else if (a.action.isAI && !b.action.isAI) {
										return 1;
									} else if (!a.action.isAI && b.action.isAI) {
										return -1;
									} else {
										return 0;
									}
								});

								// Only retriggers if actually found quickfix on the same line as cursor
								return { validActions: filteredActions, allActions: allCodeActions, documentation: codeActionSet.documentation, hasAutoFix: codeActionSet.hasAutoFix, hasAIFix: codeActionSet.hasAIFix, allAIFixes: codeActionSet.allAIFixes, dispose: () => { this.codeActionsDisposable.value = codeActionSet; } };
							}
						}
					}

					// Case for manual triggers - specifically Source Actions and Refactors
					if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
						const sw = new StopWatch();
						const codeActions = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);

						// Telemetry for duration of each code action on save.
						if (this._telemetryService) {
							type RenderActionMenu = {
								codeActions: number;
								duration: number;
							};

							type RenderActionMenuClassification = {
								owner: 'justschen';
								comment: 'Information about how long it took for code actions to be received from the provider and shown in the UI.';
								codeActions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of valid code actions received from TS.' };
								duration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Duration it took for TS to return the action to run for each kind. ' };
							};

							this._telemetryService.publicLog2<RenderActionMenu, RenderActionMenuClassification>('codeAction.invokedDurations', {
								codeActions: codeActions.validActions.length,
								duration: sw.elapsed()
							});
						}

						return codeActions;
					}

					const codeActionSet = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
					this.codeActionsDisposable.value = codeActionSet;
					return codeActionSet;
				});

				if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
					this._progressService?.showWhile(actions, 250);
				}
				const newState = new CodeActionsState.Triggered(trigger.trigger, startPosition, actions);
				let isManualToAutoTransition = false;
				if (this._state.type === CodeActionsState.Type.Triggered) {
					// Check if the current state is manual and the new state is automatic
					isManualToAutoTransition = this._state.trigger.type === CodeActionTriggerType.Invoke &&
						newState.type === CodeActionsState.Type.Triggered &&
						newState.trigger.type === CodeActionTriggerType.Auto &&
						this._state.position !== newState.position;
				}

				// Do not trigger state if current state is manual and incoming state is automatic
				if (!isManualToAutoTransition) {
					this.setState(newState);
				} else {
					// Reset the new state after getting code actions back.
					setTimeout(() => {
						this.setState(newState);
					}, 500);
				}
			}, undefined);
			this._codeActionOracle.value.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
		} else {
			this._supportedCodeActions.reset();
		}
	}

	public trigger(trigger: CodeActionTrigger) {
		this._codeActionOracle.value?.trigger(trigger);
		this.codeActionsDisposable.clear();
	}

	private setState(newState: CodeActionsState.State, skipNotify?: boolean) {
		if (newState === this._state) {
			return;
		}

		// Cancel old request
		if (this._state.type === CodeActionsState.Type.Triggered) {
			this._state.cancel();
		}

		this._state = newState;

		if (!skipNotify && !this._disposed) {
			this._onDidChangeState.fire(newState);
		}
	}
}
