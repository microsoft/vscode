/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2, EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { InlayHintItem, asCommandLink } from '../../../../editor/contrib/inlayHints/browser/inlayHints.js';
import { InlayHintsController } from '../../../../editor/contrib/inlayHints/browser/inlayHintsController.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Link } from '../../../../platform/opener/browser/link.js';


export class InlayHintsAccessibility implements IEditorContribution {

	static readonly IsReading = new RawContextKey<boolean>('isReadingLineWithInlayHints', false, { type: 'boolean', description: localize('isReadingLineWithInlayHints', "Whether the current line and its inlay hints are currently focused") });

	static readonly ID: string = 'editor.contrib.InlayHintsAccessibility';

	static get(editor: ICodeEditor): InlayHintsAccessibility | undefined {
		return editor.getContribution<InlayHintsAccessibility>(InlayHintsAccessibility.ID) ?? undefined;
	}

	private readonly _ariaElement: HTMLSpanElement;
	private readonly _ctxIsReading: IContextKey<boolean>;

	private readonly _sessionDispoosables = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		this._ariaElement = document.createElement('span');
		this._ariaElement.style.position = 'fixed';
		this._ariaElement.className = 'inlayhint-accessibility-element';
		this._ariaElement.tabIndex = 0;
		this._ariaElement.setAttribute('aria-description', localize('description', "Code with Inlay Hint Information"));

		this._ctxIsReading = InlayHintsAccessibility.IsReading.bindTo(contextKeyService);
	}

	dispose(): void {
		this._sessionDispoosables.dispose();
		this._ctxIsReading.reset();
		this._ariaElement.remove();
	}

	private _reset(): void {
		dom.clearNode(this._ariaElement);
		this._sessionDispoosables.clear();
		this._ctxIsReading.reset();
	}

	private async _read(line: number, hints: InlayHintItem[]) {

		this._sessionDispoosables.clear();

		if (!this._ariaElement.isConnected) {
			this._editor.getDomNode()?.appendChild(this._ariaElement);
		}

		if (!this._editor.hasModel() || !this._ariaElement.isConnected) {
			this._ctxIsReading.set(false);
			return;
		}

		const cts = new CancellationTokenSource();
		this._sessionDispoosables.add(cts);

		for (const hint of hints) {
			await hint.resolve(cts.token);
		}

		if (cts.token.isCancellationRequested) {
			return;
		}
		const model = this._editor.getModel();
		// const text = this._editor.getModel().getLineContent(line);
		const newChildren: (string | HTMLElement)[] = [];

		let start = 0;
		let tooLongToRead = false;

		for (const item of hints) {

			// text
			const part = model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: item.hint.position.column });
			if (part.length > 0) {
				newChildren.push(part);
				start = item.hint.position.column - 1;
			}

			// check length
			if (start > 750) {
				newChildren.push('…');
				tooLongToRead = true;
				break;
			}

			// hint
			const em = document.createElement('em');
			const { label } = item.hint;
			if (typeof label === 'string') {
				em.innerText = label;
			} else {
				for (const part of label) {
					if (part.command) {
						const link = this._instaService.createInstance(Link, em,
							{ href: asCommandLink(part.command), label: part.label, title: part.command.title },
							undefined
						);
						this._sessionDispoosables.add(link);

					} else {
						em.innerText += part.label;
					}
				}
			}
			newChildren.push(em);
		}

		// trailing text
		if (!tooLongToRead) {
			newChildren.push(model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: Number.MAX_SAFE_INTEGER }));
		}

		dom.reset(this._ariaElement, ...newChildren);
		this._ariaElement.focus();
		this._ctxIsReading.set(true);

		// reset on blur
		this._sessionDispoosables.add(dom.addDisposableListener(this._ariaElement, 'focusout', () => {
			this._reset();
		}));
	}



	startInlayHintsReading(): void {
		if (!this._editor.hasModel()) {
			return;
		}
		const line = this._editor.getPosition().lineNumber;
		const hints = InlayHintsController.get(this._editor)?.getInlayHintsForLine(line);
		if (!hints || hints.length === 0) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.noInlayHints);
		} else {
			this._read(line, hints);
		}
	}

	stopInlayHintsReading(): void {
		this._reset();
		this._editor.focus();
	}
}


registerAction2(class StartReadHints extends EditorAction2 {

	constructor() {
		super({
			id: 'inlayHints.startReadingLineWithHint',
			title: localize2('read.title', "Read Line with Inlay Hints"),
			precondition: EditorContextKeys.hasInlayHintsProvider,
			f1: true
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		const ctrl = InlayHintsAccessibility.get(editor);
		ctrl?.startInlayHintsReading();
	}
});

registerAction2(class StopReadHints extends EditorAction2 {

	constructor() {
		super({
			id: 'inlayHints.stopReadingLineWithHint',
			title: localize2('stop.title', "Stop Inlay Hints Reading"),
			precondition: InlayHintsAccessibility.IsReading,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		const ctrl = InlayHintsAccessibility.get(editor);
		ctrl?.stopInlayHintsReading();
	}
});

registerEditorContribution(InlayHintsAccessibility.ID, InlayHintsAccessibility, EditorContributionInstantiation.Lazy);
