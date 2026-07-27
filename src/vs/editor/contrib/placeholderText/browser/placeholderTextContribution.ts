/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, DebugOwner, derivedObservableWithCache, derivedOpts, derived, IObservable, IReader, observableFromEvent } from '../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';

/**
 * Use the editor option to set the placeholder text.
*/
export class PlaceholderTextContribution extends Disposable implements IEditorContribution {
	public static get(editor: ICodeEditor): PlaceholderTextContribution {
		return editor.getContribution<PlaceholderTextContribution>(PlaceholderTextContribution.ID)!;
	}

	public static readonly ID = 'editor.contrib.placeholderText';
	private readonly _editorObs;

	private readonly _placeholderText;

	private readonly _state;

	private readonly _shouldViewBeAlive;

	private readonly _view;

	/** Whether visible placeholder changes use a one-shot shimmer transition. */
	private _animateTransitions = false;

	/**
	 * Enable or disable the shimmer transition that plays when the placeholder
	 * text changes while it is visible.
	 */
	public setAnimateTransitions(animate: boolean): void {
		this._animateTransitions = animate;
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();
		this._editorObs = observableCodeEditor(this._editor);
		this._placeholderText = this._editorObs.getOption(EditorOption.placeholder);
		this._state = derivedOpts<{ placeholder: string } | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
			const p = this._placeholderText.read(reader);
			if (!p) { return undefined; }
			if (!this._editorObs.valueIsEmpty.read(reader)) { return undefined; }
			return { placeholder: p };
		});
		this._shouldViewBeAlive = isOrWasTrue(this, reader => this._state.read(reader)?.placeholder !== undefined);
		const reducedMotion = observableFromEvent(this, this._accessibilityService.onDidChangeReducedMotion, () => this._accessibilityService.isMotionReduced());
		this._view = derived((reader) => {
			if (!this._shouldViewBeAlive.read(reader)) { return; }

			const element = h('div.editorPlaceholder');

			const FADE_OUT_MS = 220;
			const FADE_IN_MS = 480;
			const transitionTimer = reader.store.add(new MutableDisposable());
			let displayedText: string | undefined = undefined;
			let targetText = '';
			let phase: 'idle' | 'out' | 'in' = 'idle';

			const clearAnimClasses = () => element.root.classList.remove('editorPlaceholder-fade-in', 'editorPlaceholder-fade-out');
			const setText = (text: string) => {
				element.root.innerText = text;
				displayedText = text;
			};
			const restartAnimation = (className: string) => {
				clearAnimClasses();
				// Force a reflow so a just-removed animation class can restart.
				void element.root.offsetWidth;
				element.root.classList.add(className);
			};
			const runTransition = () => {
				if (phase !== 'idle' || targetText === displayedText) {
					return;
				}
				phase = 'out';
				restartAnimation('editorPlaceholder-fade-out');
				transitionTimer.value = disposableTimeout(() => {
					phase = 'in';
					setText(targetText);
					restartAnimation('editorPlaceholder-fade-in');
					transitionTimer.value = disposableTimeout(() => {
						clearAnimClasses();
						phase = 'idle';
						runTransition();
					}, FADE_IN_MS);
				}, FADE_OUT_MS);
			};

			reader.store.add(autorun(reader => {
				const data = this._state.read(reader);
				const shouldBeVisibile = data?.placeholder !== undefined;
				const text = data?.placeholder ?? '';
				element.root.style.display = shouldBeVisibile ? 'block' : 'none';
				targetText = text;

				const wantAnimate = this._animateTransitions
					&& !reducedMotion.read(reader)
					&& shouldBeVisibile
					&& displayedText !== undefined
					&& displayedText !== ''
					&& text !== displayedText;

				if (wantAnimate) {
					runTransition();
				} else {
					transitionTimer.clear();
					phase = 'idle';
					clearAnimClasses();
					if (displayedText !== text) {
						setText(text);
					}
				}
			}));
			reader.store.add(autorun(reader => {
				const info = this._editorObs.layoutInfo.read(reader);
				element.root.style.left = `${info.contentLeft}px`;
				element.root.style.width = (info.contentWidth - info.verticalScrollbarWidth) + 'px';
				element.root.style.top = `${this._editor.getTopForLineNumber(0)}px`;
			}));
			reader.store.add(autorun(reader => {
				element.root.style.fontFamily = this._editorObs.getOption(EditorOption.fontFamily).read(reader);
				element.root.style.fontSize = this._editorObs.getOption(EditorOption.fontSize).read(reader) + 'px';
				element.root.style.lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader) + 'px';
			}));
			reader.store.add(this._editorObs.createOverlayWidget({
				allowEditorOverflow: false,
				minContentWidthInPx: constObservable(0),
				position: constObservable(null),
				domNode: element.root,
			}));
		});
		this._view.recomputeInitiallyAndOnChange(this._store);
	}
}

function isOrWasTrue(owner: DebugOwner, fn: (reader: IReader) => boolean): IObservable<boolean> {
	return derivedObservableWithCache<boolean>(owner, (reader, lastValue) => {
		if (lastValue === true) { return true; }
		return fn(reader);
	});
}
