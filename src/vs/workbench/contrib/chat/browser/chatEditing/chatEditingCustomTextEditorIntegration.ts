/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection, SelectionDirection } from '../../../../../editor/common/core/selection.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { EditorsOrder, IEditorIdentifier, IEditorPane, isDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CustomEditorInput } from '../../../customEditor/browser/customEditorInput.js';
import { ICustomTextEditorNavigation } from '../../../customEditor/common/customTextEditorNavigation.js';
import { IModifiedFileEntry, IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { ctxCursorInChangeRange } from './chatEditingEditorContextKeys.js';

export class ChatEditingCustomTextEditorIntegration extends Disposable implements IModifiedFileEntryEditorIntegration {

	private static readonly _activeContextKeyOwner = new WeakMap<IContextKeyService, ChatEditingCustomTextEditorIntegration>();

	private readonly _currentIndex = observableValue(this, -1);
	readonly currentIndex: IObservable<number> = this._currentIndex;

	private readonly _navigation: IObservable<ICustomTextEditorNavigation | undefined>;
	private readonly _selection: IObservable<Selection | undefined>;

	private readonly _revealCts = this._register(new MutableDisposable<IDisposable>());
	private readonly _closeDiffEditorsWhenDecided = this._register(new MutableDisposable());

	private _pendingReveal: { readonly index: number; readonly preserveFocus: boolean } | undefined;
	private _pendingRevealIndex: number | undefined;

	constructor(
		private readonly _entry: IModifiedFileEntry,
		private readonly _editor: IEditorPane,
		private readonly _documentDiffInfo: IObservable<IDocumentDiff2>,
		@IEditorService private readonly _editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const activeInputObs = observableFromEvent(
			this,
			Event.any(this._editor.group.onDidActiveEditorChange, this._editor.group.onDidModelChange),
			() => this._getActiveCustomEditorInput(),
		);

		this._navigation = derived(r => {
			const input = activeInputObs.read(r);
			if (!input) {
				return undefined;
			}
			return observableFromEvent(input.onDidChangeNavigation, () => input.navigation).read(r);
		});

		this._selection = derived(r => {
			const navigation = this._navigation.read(r);
			if (!navigation) {
				return undefined;
			}
			const raw = observableFromEvent(navigation.onDidChangeSelection, () => navigation.selection).read(r);
			return raw ? Selection.liftSelection(raw) : undefined;
		});

		this._register(autorun(r => {
			const navigation = this._navigation.read(r);
			this._revealCts.clear();
			this._pendingRevealIndex = undefined;
			if (!navigation) {
				return;
			}
			r.store.add(navigation.onDidChangeSelection(() => {
				this._pendingRevealIndex = undefined;
			}));

			if (this._pendingReveal) {
				const pending = this._pendingReveal;
				this._pendingReveal = undefined;
				const ranges = this._getChangeRanges(this._documentDiffInfo.read(undefined));
				if (pending.index >= 0 && pending.index < ranges.length) {
					this._revealRange(navigation, ranges[pending.index], pending.preserveFocus);
				}
			}
		}));

		// Initialize currentIndex when edits settle and clamp when changes shrink
		let lastModifyingRequestId: string | undefined;
		this._register(autorun(r => {
			const diff = this._documentDiffInfo.read(r);
			const ranges = this._getChangeRanges(diff);
			if (ranges.length === 0) {
				this._currentIndex.set(-1, undefined);
				return;
			}

			if (!this._entry.isCurrentlyBeingModifiedBy.read(r)
				&& lastModifyingRequestId !== this._entry.lastModifyingRequestId
				&& !diff.identical
			) {
				lastModifyingRequestId = this._entry.lastModifyingRequestId;
				const position = this._selection.read(undefined)?.getStartPosition() ?? new Position(1, 1);
				let initialIndex = ranges.findIndex(range => range.containsPosition(position));
				if (initialIndex < 0) {
					initialIndex = 0;
					for (; initialIndex < ranges.length - 1; initialIndex++) {
						if (ranges[initialIndex].endLineNumber >= position.lineNumber) {
							break;
						}
					}
				}
				this._currentIndex.set(initialIndex, undefined);
				return;
			}

			const current = this._currentIndex.read(undefined);
			if (current >= ranges.length) {
				this._currentIndex.set(ranges.length - 1, undefined);
			}
		}));

		const scopedContextKeyService = this._editor.scopedContextKeyService ?? this._editor.group.scopedContextKeyService ?? contextKeyService;
		const ctxCursorInRange = ctxCursorInChangeRange.bindTo(scopedContextKeyService);
		const resetContextKeyIfOwned = () => {
			if (ChatEditingCustomTextEditorIntegration._activeContextKeyOwner.get(scopedContextKeyService) === this) {
				ChatEditingCustomTextEditorIntegration._activeContextKeyOwner.delete(scopedContextKeyService);
				ctxCursorInRange.reset();
			}
		};
		this._register(toDisposable(resetContextKeyIfOwned));

		const enabledObs = derived(r => this._navigation.read(r) !== undefined);
		this._register(autorun(r => {
			if (!enabledObs.read(r)) {
				resetContextKeyIfOwned();
				return;
			}
			const position = this._selection.read(r)?.getStartPosition();
			ChatEditingCustomTextEditorIntegration._activeContextKeyOwner.set(scopedContextKeyService, this);
			if (!position) {
				ctxCursorInRange.set(false);
				return;
			}
			const diff = this._documentDiffInfo.read(r);
			const inRange = this._getChangeRanges(diff).some(range => range.containsPosition(position));
			ctxCursorInRange.set(inRange);
		}));
	}

	private _getActiveCustomEditorInput(): CustomEditorInput | undefined {
		const input = this._editor.input;
		if (input instanceof CustomEditorInput && isEqual(input.resource, this._entry.modifiedURI)) {
			return input;
		}
		return undefined;
	}

	private _getSortedChanges(diff: IDocumentDiff2): { readonly mapping: DetailedLineRangeMapping; readonly range: Range }[] {
		const model = diff.modifiedModel;
		return diff.changes
			.map(mapping => {
				const rawRange = mapping.modified.toInclusiveRange()
					?? new Range(mapping.modified.startLineNumber, 1, mapping.modified.startLineNumber, Number.MAX_SAFE_INTEGER);
				return {
					mapping,
					range: model.validateRange(rawRange),
				};
			})
			.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
	}

	private _getChangeRanges(diff: IDocumentDiff2): Range[] {
		return this._getSortedChanges(diff).map(item => item.range);
	}

	private _revealRange(navigation: ICustomTextEditorNavigation, range: Range, preserveFocus: boolean): void {
		const cts = new CancellationTokenSource();
		this._revealCts.value = toDisposable(() => cts.dispose(true));
		void navigation.revealRange(range, Selection.fromRange(range, SelectionDirection.LTR), preserveFocus, cts.token);
	}

	private _revealAt(index: number, ranges: readonly Range[], preserveFocus: boolean): void {
		this._currentIndex.set(index, undefined);
		this._pendingRevealIndex = index;

		const range = ranges[index];
		const navigation = this._getActiveCustomEditorInput()?.navigation;
		if (navigation) {
			this._pendingReveal = undefined;
			this._revealRange(navigation, range, preserveFocus);
		} else {
			this._pendingReveal = { index, preserveFocus };
		}
	}

	reveal(firstOrLast: boolean, preserveFocus?: boolean): void {
		const ranges = this._getChangeRanges(this._documentDiffInfo.get());
		if (ranges.length === 0) {
			return;
		}
		const index = firstOrLast ? 0 : ranges.length - 1;
		this._revealAt(index, ranges, !!preserveFocus);
	}

	next(wrap: boolean): boolean {
		return this._navigate(true, !wrap);
	}

	previous(wrap: boolean): boolean {
		return this._navigate(false, !wrap);
	}

	private _navigate(next: boolean, strict: boolean): boolean {
		const navigation = this._getActiveCustomEditorInput()?.navigation;
		if (!navigation) {
			return false;
		}

		const ranges = this._getChangeRanges(this._documentDiffInfo.get());
		if (ranges.length === 0) {
			this._currentIndex.set(-1, undefined);
			return false;
		}

		let newIndex = -1;
		if (this._pendingRevealIndex !== undefined) {
			newIndex = this._pendingRevealIndex + (next ? 1 : -1);
		} else {
			const position = navigation.selection
				? Selection.liftSelection(navigation.selection).getStartPosition()
				: undefined;

			if (position) {
				for (let i = 0; i < ranges.length; i++) {
					const range = ranges[i];
					if (range.containsPosition(position)) {
						newIndex = i + (next ? 1 : -1);
						break;
					} else if (Position.isBefore(position, range.getStartPosition())) {
						newIndex = next ? i : i - 1;
						break;
					}
				}
				if (newIndex === -1 && Position.isBefore(ranges[ranges.length - 1].getEndPosition(), position)) {
					newIndex = next ? ranges.length : ranges.length - 1;
				}
			} else {
				const current = this._currentIndex.get();
				newIndex = current < 0
					? (next ? 0 : ranges.length - 1)
					: current + (next ? 1 : -1);
			}
		}

		if (strict && (newIndex < 0 || newIndex >= ranges.length)) {
			return false;
		}

		newIndex = (newIndex + ranges.length) % ranges.length;
		this._revealAt(newIndex, ranges, false);
		return true;
	}

	enableAccessibleDiffView(): void {
		// Not applicable to custom text editors
	}

	private _findTargetChange(diff: IDocumentDiff2): DetailedLineRangeMapping | undefined {
		const sorted = this._getSortedChanges(diff);
		if (sorted.length === 0) {
			return undefined;
		}

		const sel = this._getActiveCustomEditorInput()?.navigation?.selection;
		if (sel) {
			const position = Selection.liftSelection(sel).getStartPosition();
			const containing = sorted.find(item => item.range.containsPosition(position));
			if (containing) {
				return containing.mapping;
			}
		}

		const currentIdx = this._currentIndex.get();
		if (currentIdx >= 0 && currentIdx < sorted.length) {
			return sorted[currentIdx].mapping;
		}

		return sorted[0].mapping;
	}

	async acceptNearestChange(change?: IModifiedFileEntryChangeHunk): Promise<void> {
		if (change) {
			await change.accept();
			return;
		}
		const diff = this._documentDiffInfo.get();
		const target = this._findTargetChange(diff);
		if (target && await diff.keep(target)) {
			this.next(true);
		}
	}

	async rejectNearestChange(change?: IModifiedFileEntryChangeHunk): Promise<void> {
		if (change) {
			await change.reject();
			return;
		}
		const diff = this._documentDiffInfo.get();
		const target = this._findTargetChange(diff);
		if (target && await diff.undo(target)) {
			this.next(true);
		}
	}

	async toggleDiff(_change: IModifiedFileEntryChangeHunk | undefined, show?: boolean): Promise<void> {
		const rawSel = this._getActiveCustomEditorInput()?.navigation?.selection;
		let selection = rawSel ? Selection.liftSelection(rawSel) : undefined;
		if (!selection) {
			const ranges = this._getChangeRanges(this._documentDiffInfo.get());
			const idx = this._currentIndex.get();
			const range = ranges[idx >= 0 && idx < ranges.length ? idx : 0];
			if (range) {
				selection = Selection.fromRange(range, SelectionDirection.LTR);
			}
		}

		if (show !== false) {
			const diffEditor = await this._editorService.openEditor({
				original: { resource: this._entry.originalURI },
				modified: { resource: this._entry.modifiedURI },
				options: { selection },
				label: localize('diff.generic', '{0} (changes from chat)', basename(this._entry.modifiedURI))
			});

			if (diffEditor && diffEditor.input) {
				if (selection) {
					diffEditor.getControl()?.setSelection(selection);
				}
				this._closeDiffEditorsWhenDecided.value = autorunSelfDisposable(r => {
					const state = this._entry.state.read(r);
					if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
						r.dispose();
						const editorIdents: IEditorIdentifier[] = [];
						for (const candidate of this._editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
							if (isDiffEditorInput(candidate.editor)
								&& isEqual(candidate.editor.original.resource, this._entry.originalURI)
								&& isEqual(candidate.editor.modified.resource, this._entry.modifiedURI)
							) {
								editorIdents.push(candidate);
							}
						}
						this._editorService.closeEditors(editorIdents);
					}
				});
			}
		} else {
			await this._editorService.openEditor({
				resource: this._entry.modifiedURI,
				options: {
					selection,
					selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport
				}
			});
		}
	}
}
