/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, h } from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, DebugOwner, derivedObservableWithCache, derivedOpts, derived, IObservable, IReader } from '../../../../base/common/observable.js';
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

	/**
	 * When enabled, a one-shot shimmer animation is played whenever the
	 * placeholder text changes from one non-empty value to another while the
	 * placeholder is visible. Used e.g. for rotating chat input placeholders.
	 */
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
		this._view = derived((reader) => {
			if (!this._shouldViewBeAlive.read(reader)) { return; }

			const element = h('div.editorPlaceholder');

			// Two-phase transition state machine. When the placeholder text
			// changes while visible (and animation is enabled), the current text
			// first wipes out left-to-right, then the new text wipes in
			// left-to-right with a shimmer glint.
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
				// Force a reflow so the animation restarts even if the class was
				// just removed.
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
						// The target may have changed again mid-transition.
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

				const win = getWindow(element.root);
				const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
				const wantAnimate = this._animateTransitions
					&& !reducedMotion
					&& shouldBeVisibile
					&& displayedText !== undefined
					&& displayedText !== ''
					&& text !== displayedText;

				if (wantAnimate) {
					runTransition();
				} else {
					// Snap to the latest text without animating.
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
