/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, autorun, observableValue } from '@vscode/observables';
import type { MarkdownDiagnostic } from '../src/preview/markdownEditorProtocol';

export class DiagnosticHover extends Disposable {
	readonly element = document.createElement('div');
	readonly #state = observableValue<{ readonly items: readonly MarkdownDiagnostic[]; readonly anchor: DOMRect } | undefined>('diagnosticHover', undefined);
	#timer: ReturnType<typeof setTimeout> | undefined;
	#pending: readonly MarkdownDiagnostic[] = [];

	constructor(openLink: (href: string) => Promise<void>) {
		super();
		this.element.className = 'md-diagnostic-hover';
		this.element.setAttribute('role', 'tooltip');
		this.element.id = `markdown-diagnostic-hover-${crypto.randomUUID()}`;
		this.element.tabIndex = -1;
		this._register(autorun(reader => {
			const state = this.#state.read(reader);
			this.element.hidden = !state;
			this.element.replaceChildren();
			if (!state) { return; }
			for (const item of state.items) {
				const row = document.createElement('div');
				row.className = 'md-diagnostic-hover-row';
				const message = document.createElement('span');
				message.textContent = item.message;
				row.append(message);
				const details = document.createElement('span');
				details.className = 'md-diagnostic-hover-details';
				details.append(document.createTextNode(item.source ?? ''));
				if (item.code !== undefined) {
					if (item.codeTarget) {
						const link = document.createElement('a');
						link.href = item.codeTarget;
						link.textContent = `(${item.code})`;
						link.addEventListener('click', event => {
							event.preventDefault();
							event.stopPropagation();
							void openLink(item.codeTarget!).catch(error => {
								const failure = document.createElement('div');
								failure.setAttribute('role', 'alert');
								failure.textContent = `Could not open diagnostic link: ${error instanceof Error ? error.message : String(error)}`;
								row.append(failure);
							});
						});
						details.append(link);
					} else {
						details.append(document.createTextNode(`(${item.code})`));
					}
				}
				row.append(details);
				this.element.append(row);
			}
			this.element.style.left = '0px';
			this.element.style.top = '0px';
			const bounds = this.element.getBoundingClientRect();
			this.element.style.left = `${Math.max(4, Math.min(state.anchor.left, window.innerWidth - bounds.width - 4))}px`;
			const above = state.anchor.top - bounds.height;
			this.element.style.top = `${Math.max(4, Math.min(above >= 4 ? above : state.anchor.bottom, window.innerHeight - bounds.height - 4))}px`;
		}));
		const enter = (): void => { clearTimeout(this.#timer); };
		const leave = (): void => this.scheduleHide();
		const escape = (event: KeyboardEvent): void => {
			if (event.key === 'Escape' && this.#state.get()) {
				event.preventDefault();
				event.stopPropagation();
				this.hide();
			}
		};
		const hide = (): void => this.hide();
		const scroll = (event: Event): void => {
			if (!(event.target instanceof Node) || !this.element.contains(event.target)) { this.hide(); }
		};
		const stopPropagation = (event: Event): void => event.stopPropagation();
		this.element.addEventListener('mouseenter', enter);
		this.element.addEventListener('mouseleave', leave);
		this.element.addEventListener('pointerdown', stopPropagation);
		this.element.addEventListener('keydown', stopPropagation);
		document.addEventListener('keydown', escape, true);
		document.addEventListener('scroll', scroll, true);
		window.addEventListener('blur', hide);
		window.addEventListener('resize', hide);
		this._register({
			dispose: () => {
				this.hide();
				document.removeEventListener('keydown', escape, true);
				document.removeEventListener('scroll', scroll, true);
				window.removeEventListener('blur', hide);
				window.removeEventListener('resize', hide);
				this.element.remove();
			}
		});
	}

	show(items: readonly MarkdownDiagnostic[], anchor: DOMRect): void {
		if (items.length === this.#pending.length && items.every((item, index) => item === this.#pending[index])) {
			if (this.#state.get()) { clearTimeout(this.#timer); }
			return;
		}
		clearTimeout(this.#timer);
		this.#pending = items;
		this.#timer = setTimeout(() => this.#state.set({ items, anchor }, undefined), this.#state.get() ? 0 : 300);
	}

	scheduleHide(): void {
		clearTimeout(this.#timer);
		this.#pending = [];
		this.#timer = setTimeout(() => this.hide(), 150);
	}

	hide(): void {
		clearTimeout(this.#timer);
		this.#pending = [];
		this.#state.set(undefined, undefined);
	}
}
