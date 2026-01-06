/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WindowIntervalTimer } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';
import { ICodeEditor, IViewZone, IViewZoneChangeAccessor } from '../../../../editor/browser/editorBrowser.js';
import { StableEditorScrollState } from '../../../../editor/browser/stableEditorScroll.js';
import { LineSource, RenderOptions, renderLines } from '../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, IValidEditOperation, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { SaveReason } from '../../../common/editor.js';
import { countWords } from '../../chat/common/chatWordCounter.js';
import { HunkInformation, Session, HunkState } from './inlineChatSession.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';
import { ACTION_TOGGLE_DIFF, CTX_INLINE_CHAT_CHANGE_HAS_DIFF, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, InlineChatConfigKeys, MENU_INLINE_CHAT_ZONE, minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from '../common/inlineChat.js';
import { assertType } from '../../../../base/common/types.js';
import { performAsyncTextEdit, asProgressiveEdit } from './utils.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IUntitledTextEditorModel } from '../../../services/untitled/common/untitledTextEditorModel.js';
import { Schemas } from '../../../../base/common/network.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DefaultChatTextEditor } from '../../chat/browser/codeBlockPart.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { ConflictActionsFactory, IContentWidgetAction } from '../../mergeEditor/browser/view/conflictActions.js';
import { observableValue } from '../../../../base/common/observable.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { InlineDecoration, InlineDecorationType } from '../../../../editor/common/viewModel/inlineDecorations.js';

export interface IEditObserver {
	start(): void;
	stop(): void;
}

export const enum HunkAction {
	Accept,
	Discard,
	MoveNext,
	MovePrev,
	ToggleDiff
}

export class LiveStrategy {

	private readonly _decoInsertedText = ModelDecorationOptions.register({
		description: 'inline-modified-line',
		className: 'inline-chat-inserted-range-linehighlight',
		isWholeLine: true,
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(overviewRulerInlineChatDiffInserted),
		},
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(minimapInlineChatDiffInserted),
		}
	});

	private readonly _decoInsertedTextRange = ModelDecorationOptions.register({
		description: 'inline-chat-inserted-range-linehighlight',
		className: 'inline-chat-inserted-range',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	protected readonly _store = new DisposableStore();
	protected readonly _onDidAccept = this._store.add(new Emitter<void>());
	protected readonly _onDidDiscard = this._store.add(new Emitter<void>());
	private readonly _ctxCurrentChangeHasDiff: IContextKey<boolean>;
	private readonly _ctxCurrentChangeShowsDiff: IContextKey<boolean>;
	private readonly _progressiveEditingDecorations: IEditorDecorationsCollection;
	private readonly _lensActionsFactory: ConflictActionsFactory;
	private _editCount: number = 0;
	private readonly _hunkData = new Map<HunkInformation, HunkDisplayData>();

	readonly onDidAccept: Event<void> = this._onDidAccept.event;
	readonly onDidDiscard: Event<void> = this._onDidDiscard.event;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: ICodeEditor,
		protected readonly _zone: InlineChatZoneWidget,
		private readonly _showOverlayToolbar: boolean,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextService: IContextKeyService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IInstantiationService protected readonly _instaService: IInstantiationService
	) {
		this._ctxCurrentChangeHasDiff = CTX_INLINE_CHAT_CHANGE_HAS_DIFF.bindTo(contextKeyService);
		this._ctxCurrentChangeShowsDiff = CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF.bindTo(contextKeyService);

		this._progressiveEditingDecorations = this._editor.createDecorationsCollection();
		this._lensActionsFactory = this._store.add(new ConflictActionsFactory(this._editor));
	}

	dispose(): void {
		this._resetDiff();
		this._store.dispose();
	}

	private _resetDiff(): void {
		this._ctxCurrentChangeHasDiff.reset();
		this._ctxCurrentChangeShowsDiff.reset();
		this._zone.widget.updateStatus('');
		this._progressiveEditingDecorations.clear();


		for (const data of this._hunkData.values()) {
			data.remove();
		}
	}

	async apply() {
		this._resetDiff();
		if (this._editCount > 0) {
			this._editor.pushUndoStop();
		}
		await this._doApplyChanges(true);
	}

	cancel() {
		this._resetDiff();
		return this._session.hunkData.discardAll();
	}

	async makeChanges(edits: ISingleEditOperation[], obs: IEditObserver, undoStopBefore: boolean): Promise<void> {
		return this._makeChanges(edits, obs, undefined, undefined, undoStopBefore);
	}

	async makeProgressiveChanges(edits: ISingleEditOperation[], obs: IEditObserver, opts: ProgressingEditsOptions, undoStopBefore: boolean): Promise<void> {

		// add decorations once per line that got edited
		const progress = new Progress<IValidEditOperation[]>(edits => {

			const newLines = new Set<number>();
			for (const edit of edits) {
				LineRange.fromRange(edit.range).forEach(line => newLines.add(line));
			}
			const existingRanges = this._progressiveEditingDecorations.getRanges().map(LineRange.fromRange);
			for (const existingRange of existingRanges) {
				existingRange.forEach(line => newLines.delete(line));
			}
			const newDecorations: IModelDeltaDecoration[] = [];
			for (const line of newLines) {
				newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: this._decoInsertedText });
			}

			this._progressiveEditingDecorations.append(newDecorations);
		});
		return this._makeChanges(edits, obs, opts, progress, undoStopBefore);
	}

	private async _makeChanges(edits: ISingleEditOperation[], obs: IEditObserver, opts: ProgressingEditsOptions | undefined, progress: Progress<IValidEditOperation[]> | undefined, undoStopBefore: boolean): Promise<void> {

		// push undo stop before first edit
		if (undoStopBefore) {
			this._editor.pushUndoStop();
		}

		this._editCount++;

		if (opts) {
			// ASYNC
			const durationInSec = opts.duration / 1000;
			for (const edit of edits) {
				const wordCount = countWords(edit.text ?? '');
				const speed = wordCount / durationInSec;
				// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
				const asyncEdit = asProgressiveEdit(new WindowIntervalTimer(this._zone.domNode), edit, speed, opts.token);
				await performAsyncTextEdit(this._session.textModelN, asyncEdit, progress, obs);
			}

		} else {
			// SYNC
			obs.start();
			this._session.textModelN.pushEditOperations(null, edits, (undoEdits) => {
				progress?.report(undoEdits);
				return null;
			});
			obs.stop();
		}
	}

	performHunkAction(hunk: HunkInformation | undefined, action: HunkAction) {
		const displayData = this._findDisplayData(hunk);

		if (!displayData) {
			// no hunks (left or not yet) found, make sure to
			// finish the sessions
			if (action === HunkAction.Accept) {
				this._onDidAccept.fire();
			} else if (action === HunkAction.Discard) {
				this._onDidDiscard.fire();
			}
			return;
		}

		if (action === HunkAction.Accept) {
			displayData.acceptHunk();
		} else if (action === HunkAction.Discard) {
			displayData.discardHunk();
		} else if (action === HunkAction.MoveNext) {
			displayData.move(true);
		} else if (action === HunkAction.MovePrev) {
			displayData.move(false);
		} else if (action === HunkAction.ToggleDiff) {
			displayData.toggleDiff?.();
		}
	}

	private _findDisplayData(hunkInfo?: HunkInformation) {
		let result: HunkDisplayData | undefined;
		if (hunkInfo) {
			// use context hunk (from tool/buttonbar)
			result = this._hunkData.get(hunkInfo);
		}

		if (!result && this._zone.position) {
			// find nearest from zone position
			const zoneLine = this._zone.position.lineNumber;
			let distance: number = Number.MAX_SAFE_INTEGER;
			for (const candidate of this._hunkData.values()) {
				if (candidate.hunk.getState() !== HunkState.Pending) {
					continue;
				}
				const hunkRanges = candidate.hunk.getRangesN();
				if (hunkRanges.length === 0) {
					// bogous hunk
					continue;
				}
				const myDistance = zoneLine <= hunkRanges[0].startLineNumber
					? hunkRanges[0].startLineNumber - zoneLine
					: zoneLine - hunkRanges[0].endLineNumber;

				if (myDistance < distance) {
					distance = myDistance;
					result = candidate;
				}
			}
		}

		if (!result) {
			// fallback: first hunk that is pending
			result = Iterable.first(Iterable.filter(this._hunkData.values(), candidate => candidate.hunk.getState() === HunkState.Pending));
		}
		return result;
	}

	async renderChanges() {

		this._progressiveEditingDecorations.clear();

		const renderHunks = () => {

			let widgetData: HunkDisplayData | undefined;

			changeDecorationsAndViewZones(this._editor, (decorationsAccessor, viewZoneAccessor) => {

				const keysNow = new Set(this._hunkData.keys());
				widgetData = undefined;

				for (const hunkData of this._session.hunkData.getInfo()) {

					keysNow.delete(hunkData);

					const hunkRanges = hunkData.getRangesN();
					let data = this._hunkData.get(hunkData);
					if (!data) {
						// first time -> create decoration
						const decorationIds: string[] = [];
						for (let i = 0; i < hunkRanges.length; i++) {
							decorationIds.push(decorationsAccessor.addDecoration(hunkRanges[i], i === 0
								? this._decoInsertedText
								: this._decoInsertedTextRange)
							);
						}

						const acceptHunk = () => {
							hunkData.acceptChanges();
							renderHunks();
						};

						const discardHunk = () => {
							hunkData.discardChanges();
							renderHunks();
						};

						// original view zone
						const mightContainNonBasicASCII = this._session.textModel0.mightContainNonBasicASCII();
						const mightContainRTL = this._session.textModel0.mightContainRTL();
						const renderOptions = RenderOptions.fromEditor(this._editor);
						const originalRange = hunkData.getRanges0()[0];
						const source = new LineSource(
							LineRange.fromRangeInclusive(originalRange).mapToLineArray(l => this._session.textModel0.tokenization.getLineTokens(l)),
							[],
							mightContainNonBasicASCII,
							mightContainRTL,
						);
						const domNode = document.createElement('div');
						domNode.className = 'inline-chat-original-zone2';
						const result = renderLines(source, renderOptions, [new InlineDecoration(new Range(originalRange.startLineNumber, 1, originalRange.startLineNumber, 1), '', InlineDecorationType.Regular)], domNode);
						const viewZoneData: IViewZone = {
							afterLineNumber: -1,
							heightInLines: result.heightInLines,
							domNode,
							ordinal: 50000 + 2 // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
						};

						const toggleDiff = () => {
							const scrollState = StableEditorScrollState.capture(this._editor);
							changeDecorationsAndViewZones(this._editor, (_decorationsAccessor, viewZoneAccessor) => {
								assertType(data);
								if (!data.diffViewZoneId) {
									const [hunkRange] = hunkData.getRangesN();
									viewZoneData.afterLineNumber = hunkRange.startLineNumber - 1;
									data.diffViewZoneId = viewZoneAccessor.addZone(viewZoneData);
								} else {
									viewZoneAccessor.removeZone(data.diffViewZoneId!);
									data.diffViewZoneId = undefined;
								}
							});
							this._ctxCurrentChangeShowsDiff.set(typeof data?.diffViewZoneId === 'string');
							scrollState.restore(this._editor);
						};


						let lensActions: DisposableStore | undefined;
						const lensActionsViewZoneIds: string[] = [];

						if (this._showOverlayToolbar && hunkData.getState() === HunkState.Pending) {

							lensActions = new DisposableStore();

							const menu = this._menuService.createMenu(MENU_INLINE_CHAT_ZONE, this._contextService);
							const makeActions = () => {
								const actions: IContentWidgetAction[] = [];
								const tuples = menu.getActions({ arg: hunkData });
								for (const [, group] of tuples) {
									for (const item of group) {
										if (item instanceof MenuItemAction) {

											let text = item.label;

											if (item.id === ACTION_TOGGLE_DIFF) {
												text = item.checked ? 'Hide Changes' : 'Show Changes';
											} else if (ThemeIcon.isThemeIcon(item.item.icon)) {
												text = `$(${item.item.icon.id}) ${text}`;
											}

											actions.push({
												text,
												tooltip: item.tooltip,
												action: async () => item.run(),
											});
										}
									}
								}
								return actions;
							};

							const obs = observableValue(this, makeActions());
							lensActions.add(menu.onDidChange(() => obs.set(makeActions(), undefined)));
							lensActions.add(menu);

							lensActions.add(this._lensActionsFactory.createWidget(viewZoneAccessor,
								hunkRanges[0].startLineNumber - 1,
								obs,
								lensActionsViewZoneIds
							));
						}

						const remove = () => {
							changeDecorationsAndViewZones(this._editor, (decorationsAccessor, viewZoneAccessor) => {
								assertType(data);
								for (const decorationId of data.decorationIds) {
									decorationsAccessor.removeDecoration(decorationId);
								}
								if (data.diffViewZoneId) {
									viewZoneAccessor.removeZone(data.diffViewZoneId!);
								}
								data.decorationIds = [];
								data.diffViewZoneId = undefined;

								data.lensActionsViewZoneIds?.forEach(viewZoneAccessor.removeZone);
								data.lensActionsViewZoneIds = undefined;
							});

							lensActions?.dispose();
						};

						const move = (next: boolean) => {
							const keys = Array.from(this._hunkData.keys());
							const idx = keys.indexOf(hunkData);
							const nextIdx = (idx + (next ? 1 : -1) + keys.length) % keys.length;
							if (nextIdx !== idx) {
								const nextData = this._hunkData.get(keys[nextIdx])!;
								this._zone.updatePositionAndHeight(nextData?.position);
								renderHunks();
							}
						};

						const zoneLineNumber = this._zone.position?.lineNumber ?? this._editor.getPosition()!.lineNumber;
						const myDistance = zoneLineNumber <= hunkRanges[0].startLineNumber
							? hunkRanges[0].startLineNumber - zoneLineNumber
							: zoneLineNumber - hunkRanges[0].endLineNumber;

						data = {
							hunk: hunkData,
							decorationIds,
							diffViewZoneId: '',
							diffViewZone: viewZoneData,
							lensActionsViewZoneIds,
							distance: myDistance,
							position: hunkRanges[0].getStartPosition().delta(-1),
							acceptHunk,
							discardHunk,
							toggleDiff: !hunkData.isInsertion() ? toggleDiff : undefined,
							remove,
							move,
						};

						this._hunkData.set(hunkData, data);

					} else if (hunkData.getState() !== HunkState.Pending) {
						data.remove();

					} else {
						// update distance and position based on modifiedRange-decoration
						const zoneLineNumber = this._zone.position?.lineNumber ?? this._editor.getPosition()!.lineNumber;
						const modifiedRangeNow = hunkRanges[0];
						data.position = modifiedRangeNow.getStartPosition().delta(-1);
						data.distance = zoneLineNumber <= modifiedRangeNow.startLineNumber
							? modifiedRangeNow.startLineNumber - zoneLineNumber
							: zoneLineNumber - modifiedRangeNow.endLineNumber;
					}

					if (hunkData.getState() === HunkState.Pending && (!widgetData || data.distance < widgetData.distance)) {
						widgetData = data;
					}
				}

				for (const key of keysNow) {
					const data = this._hunkData.get(key);
					if (data) {
						this._hunkData.delete(key);
						data.remove();
					}
				}
			});

			if (widgetData) {
				this._zone.reveal(widgetData.position);

				const mode = this._configService.getValue<'on' | 'off' | 'auto'>(InlineChatConfigKeys.AccessibleDiffView);
				if (mode === 'on' || mode === 'auto' && this._accessibilityService.isScreenReaderOptimized()) {
					this._zone.widget.showAccessibleHunk(this._session, widgetData.hunk);
				}

				this._ctxCurrentChangeHasDiff.set(Boolean(widgetData.toggleDiff));

			} else if (this._hunkData.size > 0) {
				// everything accepted or rejected
				let oneAccepted = false;
				for (const hunkData of this._session.hunkData.getInfo()) {
					if (hunkData.getState() === HunkState.Accepted) {
						oneAccepted = true;
						break;
					}
				}
				if (oneAccepted) {
					this._onDidAccept.fire();
				} else {
					this._onDidDiscard.fire();
				}
			}

			return widgetData;
		};

		return renderHunks()?.position;
	}

	getWholeRangeDecoration(): IModelDeltaDecoration[] {
		// don't render the blue in live mode
		return [];
	}

	private async _doApplyChanges(ignoreLocal: boolean): Promise<void> {

		const untitledModels: IUntitledTextEditorModel[] = [];

		const editor = this._instaService.createInstance(DefaultChatTextEditor);


		for (const request of this._session.chatModel.getRequests()) {

			if (!request.response?.response) {
				continue;
			}

			for (const item of request.response.response.value) {
				if (item.kind !== 'textEditGroup') {
					continue;
				}
				if (ignoreLocal && isEqual(item.uri, this._session.textModelN.uri)) {
					continue;
				}

				await editor.apply(request.response, item, undefined);

				if (item.uri.scheme === Schemas.untitled) {
					const untitled = this._textFileService.untitled.get(item.uri);
					if (untitled) {
						untitledModels.push(untitled);
					}
				}
			}
		}

		for (const untitledModel of untitledModels) {
			if (!untitledModel.isDisposed()) {
				await untitledModel.resolve();
				await untitledModel.save({ reason: SaveReason.EXPLICIT });
			}
		}
	}
}

export interface ProgressingEditsOptions {
	duration: number;
	token: CancellationToken;
}

type HunkDisplayData = {

	decorationIds: string[];

	diffViewZoneId: string | undefined;
	diffViewZone: IViewZone;

	lensActionsViewZoneIds?: string[];

	distance: number;
	position: Position;
	acceptHunk: () => void;
	discardHunk: () => void;
	toggleDiff?: () => any;
	remove(): void;
	move: (next: boolean) => void;

	hunk: HunkInformation;
};

function changeDecorationsAndViewZones(editor: ICodeEditor, callback: (accessor: IModelDecorationsChangeAccessor, viewZoneAccessor: IViewZoneChangeAccessor) => void): void {
	editor.changeDecorations(decorationsAccessor => {
		editor.changeViewZones(viewZoneAccessor => {
			callback(decorationsAccessor, viewZoneAccessor);
		});
	});
}
