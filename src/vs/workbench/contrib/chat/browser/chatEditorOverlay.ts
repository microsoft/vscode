/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorOverlay.css';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, ISettableObservable, ITransaction, observableFromEvent, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditingSessionState, IChatEditingService, IModifiedFileEntry, WorkingSetEntryState } from '../common/chatEditingService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IActionRunner } from '../../../../base/common/actions.js';
import { getWindow, reset, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

class ChatEditorOverlayWidget implements IOverlayWidget {

	readonly allowEditorOverflow = false;

	private readonly _domNode: HTMLElement;
	private readonly _progressNode: HTMLElement;
	private readonly _toolbar: WorkbenchToolBar;

	private _isAdded: boolean = false;
	private readonly _showStore = new DisposableStore();

	private readonly _entry = observableValue<{ entry: IModifiedFileEntry; next: IModifiedFileEntry } | undefined>(this, undefined);

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorService editorService: IEditorService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('chat-editor-overlay-widget');

		this._progressNode = document.createElement('div');
		this._progressNode.classList.add('chat-editor-overlay-progress');
		this._domNode.appendChild(this._progressNode);

		const toolbarNode = document.createElement('div');
		toolbarNode.classList.add('chat-editor-overlay-toolbar');
		this._domNode.appendChild(toolbarNode);

		this._toolbar = instaService.createInstance(MenuWorkbenchToolBar, toolbarNode, MenuId.ChatEditingEditorContent, {
			telemetrySource: 'chatEditor.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				const that = this;

				if (action.id === 'chatEditor.action.accept' || action.id === 'chatEditor.action.reject') {
					return new class extends ActionViewItem {

						private readonly _reveal = this._store.add(new MutableDisposable());

						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}
						override set actionRunner(actionRunner: IActionRunner) {
							super.actionRunner = actionRunner;

							const store = new DisposableStore();

							store.add(actionRunner.onWillRun(_e => {
								that._editor.focus();
							}));

							store.add(actionRunner.onDidRun(e => {
								if (e.action !== this.action) {
									return;
								}
								const d = that._entry.get();
								if (!d || d.entry === d.next) {
									return;
								}
								const change = d.next.diffInfo.get().changes.at(0);
								return editorService.openEditor({
									resource: d.next.modifiedURI,
									options: {
										selection: change && Range.fromPositions({ lineNumber: change.original.startLineNumber, column: 1 }),
										revealIfOpened: false,
										revealIfVisible: false,
									}
								}, ACTIVE_GROUP);
							}));

							this._reveal.value = store;
						}
						override get actionRunner(): IActionRunner {
							return super.actionRunner;
						}
					};
				}
				return undefined;
			}
		});
	}

	dispose() {
		this.hide();
		this._showStore.dispose();
		this._toolbar.dispose();
	}

	getId(): string {
		return 'chatEditorOverlayWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return { preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER };
	}

	show(entry: IModifiedFileEntry, next: IModifiedFileEntry) {

		this._showStore.clear();

		this._entry.set({ entry, next }, undefined);

		this._showStore.add(autorun(r => {
			const busy = entry.isCurrentlyBeingModified.read(r);
			this._domNode.classList.toggle('busy', busy);
		}));

		const slickRatio = ObservableAnimatedValue.const(0);
		let t = Date.now();
		this._showStore.add(autorun(r => {
			const value = entry.rewriteRatio.read(r);

			slickRatio.changeAnimation(prev => {
				const result = new AnimatedValue(prev.getValue(), value, Date.now() - t);
				t = Date.now();
				return result;
			}, undefined);

			const value2 = slickRatio.getValue(r);
			reset(this._progressNode, value === 0
				? renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'))
				: `${Math.round(value2 * 100)}%`
			);
		}));

		if (!this._isAdded) {
			this._editor.addOverlayWidget(this);
			this._isAdded = true;
		}
	}

	hide() {

		this._entry.set(undefined, undefined);

		if (this._isAdded) {
			this._editor.removeOverlayWidget(this);
			this._isAdded = false;
			this._showStore.clear();
		}
	}
}

export class ObservableAnimatedValue {
	public static const(value: number): ObservableAnimatedValue {
		return new ObservableAnimatedValue(AnimatedValue.const(value));
	}

	private readonly _value: ISettableObservable<AnimatedValue>;

	constructor(
		initialValue: AnimatedValue,
	) {
		this._value = observableValue(this, initialValue);
	}

	setAnimation(value: AnimatedValue, tx: ITransaction | undefined): void {
		this._value.set(value, tx);
	}

	changeAnimation(fn: (prev: AnimatedValue) => AnimatedValue, tx: ITransaction | undefined): void {
		const value = fn(this._value.get());
		this._value.set(value, tx);
	}

	getValue(reader: IReader | undefined): number {
		const value = this._value.read(reader);
		if (!value.isFinished()) {
			Scheduler.instance.invalidateOnNextAnimationFrame(reader);
		}
		return value.getValue();
	}
}

class Scheduler {
	static instance = new Scheduler();

	private readonly _signal = observableSignal(this);

	private _isScheduled = false;

	invalidateOnNextAnimationFrame(reader: IReader | undefined): void {
		this._signal.read(reader);
		if (!this._isScheduled) {
			this._isScheduled = true;
			scheduleAtNextAnimationFrame(getWindow(undefined), () => {
				this._isScheduled = false;
				this._signal.trigger(undefined);
			});
		}
	}
}

class AnimatedValue {

	static const(value: number): AnimatedValue {
		return new AnimatedValue(value, value, 0);
	}

	readonly startTimeMs = Date.now();

	constructor(
		readonly startValue: number,
		readonly endValue: number,
		readonly durationMs: number,
	) {
		if (startValue === endValue) {
			this.durationMs = 0;
		}
	}

	isFinished(): boolean {
		return Date.now() >= this.startTimeMs + this.durationMs;
	}

	getValue(): number {
		const timePassed = Date.now() - this.startTimeMs;
		if (timePassed >= this.durationMs) {
			return this.endValue;
		}
		const value = easeOutExpo(timePassed, this.startValue, this.endValue - this.startValue, this.durationMs);
		return value;
	}
}

function easeOutExpo(passedTime: number, start: number, length: number, totalDuration: number): number {
	return passedTime === totalDuration
		? start + length
		: length * (-Math.pow(2, -10 * passedTime / totalDuration) + 1) + start;
}


export class ChatEditorOverlayController implements IEditorContribution {

	static readonly ID = 'editor.contrib.chatOverlayController';

	private readonly _store = new DisposableStore();

	static get(editor: ICodeEditor) {
		return editor.getContribution<ChatEditorOverlayController>(ChatEditorOverlayController.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IChatEditingService chatEditingService: IChatEditingService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		const modelObs = observableFromEvent(this._editor.onDidChangeModel, () => this._editor.getModel());
		const widget = instaService.createInstance(ChatEditorOverlayWidget, this._editor);

		if (this._editor.getOption(EditorOption.inDiffEditor)) {
			return;
		}

		this._store.add(autorun(r => {
			const model = modelObs.read(r);
			const session = chatEditingService.currentEditingSessionObs.read(r);
			if (!session || !model) {
				widget.hide();
				return;
			}

			const state = session.state.read(r);
			if (state === ChatEditingSessionState.Disposed) {
				widget.hide();
				return;
			}

			const entries = session.entries.read(r);
			const idx = entries.findIndex(e => isEqual(e.modifiedURI, model.uri));
			if (idx < 0) {
				widget.hide();
				return;
			}

			const isModifyingOrModified = entries.some(e => e.state.read(r) === WorkingSetEntryState.Modified || e.isCurrentlyBeingModified.read(r));
			if (!isModifyingOrModified) {
				widget.hide();
				return;
			}

			const entry = entries[idx];
			widget.show(entry, entries[(idx + 1) % entries.length]);

		}));
	}

	dispose() {
		this._store.dispose();
	}
}
