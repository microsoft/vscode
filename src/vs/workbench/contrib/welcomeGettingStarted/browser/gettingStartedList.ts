/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { $, Dimension } from '../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { equals } from '../../../../base/common/arrays.js';

type GettingStartedIndexListOptions<T> = {
	title: string;
	klass: string;
	limit: number;
	empty?: HTMLElement | undefined;
	more?: HTMLElement | undefined;
	footer?: HTMLElement | undefined;
	renderElement: (item: T) => HTMLElement;
	rankElement?: (item: T) => number | null;
	contextService: IContextKeyService;
};

export class GettingStartedIndexList<T extends { id: string; when?: ContextKeyExpression }> extends Disposable {
	private readonly _onDidChangeEntries = new Emitter<void>();
	private readonly onDidChangeEntries: Event<void> = this._onDidChangeEntries.event;

	private domElement: HTMLElement;
	private list: HTMLUListElement;
	private scrollbar: DomScrollableElement;

	private entries: undefined | T[];

	private lastRendered: string[] | undefined;

	public itemCount: number;

	private isDisposed = false;

	private contextService: IContextKeyService;
	private contextKeysToWatch = new Set<string>();

	constructor(
		private options: GettingStartedIndexListOptions<T>
	) {
		super();

		this.contextService = options.contextService;

		this.entries = undefined;

		this.itemCount = 0;
		this.list = $('ul');
		this.scrollbar = this._register(new DomScrollableElement(this.list, {}));
		this._register(this.onDidChangeEntries(() => this.scrollbar.scanDomNode()));
		this.domElement = $('.index-list.' + options.klass, {},
			$('h2', {}, options.title),
			this.scrollbar.getDomNode());

		this._register(this.contextService.onDidChangeContext(e => {
			if (e.affectsSome(this.contextKeysToWatch)) {
				this.rerender();
			}
		}));
	}

	getDomElement() {
		return this.domElement;
	}

	layout(size: Dimension) {
		this.scrollbar.scanDomNode();
	}

	onDidChange(listener: () => void) {
		this._register(this.onDidChangeEntries(listener));
	}

	register(d: IDisposable) { if (this.isDisposed) { d.dispose(); } else { this._register(d); } }

	override dispose() {
		this.isDisposed = true;
		super.dispose();
	}

	setLimit(limit: number) {
		this.options.limit = limit;
		this.setEntries(this.entries);
	}

	rerender() {
		this.setEntries(this.entries);
	}

	setEntries(entries: undefined | T[]) {
		let entryList = entries ?? [];

		this.itemCount = 0;

		const ranker = this.options.rankElement;
		if (ranker) {
			entryList = entryList.filter(e => ranker(e) !== null);
			entryList.sort((a, b) => ranker(b)! - ranker(a)!);
		}

		const activeEntries = entryList.filter(e => !e.when || this.contextService.contextMatchesRules(e.when));
		const limitedEntries = activeEntries.slice(0, this.options.limit);

		const toRender = limitedEntries.map(e => e.id);

		if (this.entries === entries && equals(toRender, this.lastRendered)) { return; }
		this.entries = entries;

		this.contextKeysToWatch.clear();
		entryList.forEach(e => {
			const keys = e.when?.keys();
			keys?.forEach(key => this.contextKeysToWatch.add(key));
		});

		this.lastRendered = toRender;
		this.itemCount = limitedEntries.length;


		while (this.list.firstChild) {
			this.list.firstChild.remove();
		}

		this.itemCount = limitedEntries.length;
		for (const entry of limitedEntries) {
			const rendered = this.options.renderElement(entry);
			this.list.appendChild(rendered);
		}

		if (activeEntries.length > limitedEntries.length && this.options.more) {
			this.list.appendChild(this.options.more);
		}
		else if (entries !== undefined && this.itemCount === 0 && this.options.empty) {
			this.list.appendChild(this.options.empty);
		}
		else if (this.options.footer) {
			this.list.appendChild(this.options.footer);
		}

		this._onDidChangeEntries.fire();
	}
}
