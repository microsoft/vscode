/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Command } from 'vs/editor/common/languages';
import { InlayHintItem } from 'vs/editor/contrib/inlayHints/browser/inlayHints';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Link } from 'vs/platform/opener/browser/link';


export class InlayHintsAccessibility {

	static readonly IsReading = new RawContextKey<boolean>('isReadingLineWithInlayHints', false, { type: 'boolean', description: localize('isReadingLineWithInlayHints', "Whether the current line and its inlay hints are currently focused") });

	private readonly _ariaElement: HTMLSpanElement;
	private readonly _ctxIsReading: IContextKey<boolean>;


	private _sessionDispoosables = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
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

	reset(): void {
		dom.clearNode(this._ariaElement);
		this._sessionDispoosables.clear();
		this._ctxIsReading.reset();
	}

	async read(line: number, hints: InlayHintItem[]) {

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

		for (let hint of hints) {
			await hint.resolve(cts.token);
		}

		if (cts.token.isCancellationRequested) {
			return;
		}
		const model = this._editor.getModel();
		// const text = this._editor.getModel().getLineContent(line);
		const newChildren: (string | HTMLElement)[] = [];

		let start = 0;
		for (const item of hints) {

			// text
			const part = model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: item.hint.position.column });
			if (part.length > 0) {
				newChildren.push(part);
				start = item.hint.position.column - 1;
			}

			// hint
			const em = document.createElement('em');
			const { label } = item.hint;
			if (typeof label === 'string') {
				em.innerText = label;
			} else {
				for (let part of label) {
					if (part.command) {
						const link = this._instaService.createInstance(Link, em,
							{ href: InlayHintsAccessibility._asCommandLink(part.command), label: part.label, title: part.command.title },
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
		newChildren.push(model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: Number.MAX_SAFE_INTEGER }));
		dom.reset(this._ariaElement, ...newChildren);

		this._ariaElement.focus();
		this._ctxIsReading.set(true);

		// reset on blur
		this._sessionDispoosables.add(dom.addDisposableListener(this._ariaElement, 'focusout', () => {
			this.reset();
		}));
	}

	private static _asCommandLink(command: Command): string {
		return URI.from({
			scheme: Schemas.command,
			path: command.id,
			query: encodeURIComponent(JSON.stringify(command.arguments))
		}).toString();
	}
}
