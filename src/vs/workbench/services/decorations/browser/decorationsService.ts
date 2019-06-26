/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { IDecorationsService, IDecoration, IResourceDecorationChangeEvent, IDecorationsProvider, IDecorationData } from './decorations';
import { TernarySearchTree } from 'vs/base/common/map';
import { Disposable, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { isThenable } from 'vs/base/common/async';
import { LinkedList } from 'vs/base/common/linkedList';
import { createStyleSheet, createCSSRule, removeCSSRulesContainingSelector } from 'vs/base/browser/dom';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { Iterator } from 'vs/base/common/iterator';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class DecorationRule {

	static keyOf(data: IDecorationData | IDecorationData[]): string {
		if (Array.isArray(data)) {
			return data.map(DecorationRule.keyOf).join(',');
		} else {
			const { color, letter } = data;
			return `${color}/${letter}`;
		}
	}

	private static readonly _classNames = new IdGenerator('monaco-decorations-style-');

	readonly data: IDecorationData | IDecorationData[];
	readonly itemColorClassName: string;
	readonly itemBadgeClassName: string;
	readonly bubbleBadgeClassName: string;

	constructor(data: IDecorationData | IDecorationData[]) {
		this.data = data;
		this.itemColorClassName = DecorationRule._classNames.nextId();
		this.itemBadgeClassName = DecorationRule._classNames.nextId();
		this.bubbleBadgeClassName = DecorationRule._classNames.nextId();
	}

	appendCSSRules(element: HTMLStyleElement, theme: ITheme): void {
		if (!Array.isArray(this.data)) {
			this._appendForOne(this.data, element, theme);
		} else {
			this._appendForMany(this.data, element, theme);
		}
	}

	private _appendForOne(data: IDecorationData, element: HTMLStyleElement, theme: ITheme): void {
		const { color, letter } = data;
		// label
		createCSSRule(`.${this.itemColorClassName}`, `color: ${getColor(theme, color)};`, element);
		// letter
		if (letter) {
			createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letter}"; color: ${getColor(theme, color)};`, element);
		}
	}

	private _appendForMany(data: IDecorationData[], element: HTMLStyleElement, theme: ITheme): void {
		// label
		const { color } = data[0];
		createCSSRule(`.${this.itemColorClassName}`, `color: ${getColor(theme, color)};`, element);

		// badge
		const letters = data.filter(d => !isFalsyOrWhitespace(d.letter)).map(d => d.letter);
		if (letters.length) {
			createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letters.join(', ')}"; color: ${getColor(theme, color)};`, element);
		}

		// bubble badge
		createCSSRule(
			`.${this.bubbleBadgeClassName}::after`,
			`content: "\uf052"; color: ${getColor(theme, color)}; font-family: octicons; font-size: 14px; padding-right: 14px; opacity: 0.4;`,
			element
		);
	}

	removeCSSRules(element: HTMLStyleElement): void {
		removeCSSRulesContainingSelector(this.itemColorClassName, element);
		removeCSSRulesContainingSelector(this.itemBadgeClassName, element);
		removeCSSRulesContainingSelector(this.bubbleBadgeClassName, element);
	}

	isUnused(): boolean {
		return !document.querySelector(`.${this.itemColorClassName}`)
			&& !document.querySelector(`.${this.itemBadgeClassName}`)
			&& !document.querySelector(`.${this.bubbleBadgeClassName}`);
	}
}

class DecorationStyles extends Disposable {

	private readonly _styleElement = createStyleSheet();
	private readonly _decorationRules = new Map<string, DecorationRule>();

	constructor(
		private _themeService: IThemeService,
	) {
		super();
		this._register(this._themeService.onThemeChange(this._onThemeChange, this));
	}

	dispose(): void {
		super.dispose();

		const parent = this._styleElement.parentElement;
		if (parent) {
			parent.removeChild(this._styleElement);
		}
	}

	asDecoration(data: IDecorationData[], onlyChildren: boolean): IDecoration {

		// sort by weight
		data.sort((a, b) => (b.weight || 0) - (a.weight || 0));

		let key = DecorationRule.keyOf(data);
		let rule = this._decorationRules.get(key);

		if (!rule) {
			// new css rule
			rule = new DecorationRule(data);
			this._decorationRules.set(key, rule);
			rule.appendCSSRules(this._styleElement, this._themeService.getTheme());
		}

		let labelClassName = rule.itemColorClassName;
		let badgeClassName = rule.itemBadgeClassName;
		let tooltip = data.filter(d => !isFalsyOrWhitespace(d.tooltip)).map(d => d.tooltip).join(' • ');

		if (onlyChildren) {
			// show items from its children only
			badgeClassName = rule.bubbleBadgeClassName;
			tooltip = localize('bubbleTitle', "Contains emphasized items");
		}

		return {
			labelClassName,
			badgeClassName,
			tooltip,
			update: (replace) => {
				let newData = data.slice();
				for (let i = 0; i < newData.length; i++) {
					if (newData[i].source === replace.source) {
						// replace
						newData[i] = replace;
					}
				}
				return this.asDecoration(newData, onlyChildren);
			}
		};
	}

	private _onThemeChange(): void {
		this._decorationRules.forEach(rule => {
			rule.removeCSSRules(this._styleElement);
			rule.appendCSSRules(this._styleElement, this._themeService.getTheme());
		});
	}

	cleanUp(iter: Iterator<DecorationProviderWrapper>): void {
		// remove every rule for which no more
		// decoration (data) is kept. this isn't cheap
		let usedDecorations = new Set<string>();
		for (let e = iter.next(); !e.done; e = iter.next()) {
			e.value.data.forEach((value, key) => {
				if (value && !(value instanceof DecorationDataRequest)) {
					usedDecorations.add(DecorationRule.keyOf(value));
				}
			});
		}
		this._decorationRules.forEach((value, index) => {
			const { data } = value;
			if (value.isUnused()) {
				let remove: boolean = false;
				if (Array.isArray(data)) {
					remove = data.some(data => !usedDecorations.has(DecorationRule.keyOf(data)));
				} else if (!usedDecorations.has(DecorationRule.keyOf(data))) {
					remove = true;
				}
				if (remove) {
					value.removeCSSRules(this._styleElement);
					this._decorationRules.delete(index);
				}
			}
		});
	}
}

class FileDecorationChangeEvent implements IResourceDecorationChangeEvent {

	private readonly _data = TernarySearchTree.forPaths<boolean>();

	affectsResource(uri: URI): boolean {
		return this._data.get(uri.toString()) || this._data.findSuperstr(uri.toString()) !== undefined;
	}

	static debouncer(last: FileDecorationChangeEvent, current: URI | URI[]) {
		if (!last) {
			last = new FileDecorationChangeEvent();
		}
		if (Array.isArray(current)) {
			// many
			for (const uri of current) {
				last._data.set(uri.toString(), true);
			}
		} else {
			// one
			last._data.set(current.toString(), true);
		}

		return last;
	}
}

class DecorationDataRequest {
	constructor(
		readonly source: CancellationTokenSource,
		readonly thenable: Promise<void>,
	) { }
}

class DecorationProviderWrapper {

	readonly data = TernarySearchTree.forPaths<DecorationDataRequest | IDecorationData | null>();
	private readonly _dispoable: IDisposable;

	constructor(
		private readonly _provider: IDecorationsProvider,
		private readonly _uriEmitter: Emitter<URI | URI[]>,
		private readonly _flushEmitter: Emitter<IResourceDecorationChangeEvent>
	) {
		this._dispoable = this._provider.onDidChange(uris => {
			if (!uris) {
				// flush event -> drop all data, can affect everything
				this.data.clear();
				this._flushEmitter.fire({ affectsResource() { return true; } });

			} else {
				// selective changes -> drop for resource, fetch again, send event
				// perf: the map stores thenables, decorations, or `null`-markers.
				// we make us of that and ignore all uris in which we have never
				// been interested.
				for (const uri of uris) {
					this._fetchData(uri);
				}
			}
		});
	}

	dispose(): void {
		this._dispoable.dispose();
		this.data.clear();
	}

	knowsAbout(uri: URI): boolean {
		return Boolean(this.data.get(uri.toString())) || Boolean(this.data.findSuperstr(uri.toString()));
	}

	getOrRetrieve(uri: URI, includeChildren: boolean, callback: (data: IDecorationData, isChild: boolean) => void): void {
		const key = uri.toString();
		let item = this.data.get(key);

		if (item === undefined) {
			// unknown -> trigger request
			item = this._fetchData(uri);
		}

		if (item && !(item instanceof DecorationDataRequest)) {
			// found something (which isn't pending anymore)
			callback(item, false);
		}

		if (includeChildren) {
			// (resolved) children
			const iter = this.data.findSuperstr(key);
			if (iter) {
				for (let item = iter.next(); !item.done; item = iter.next()) {
					if (item.value && !(item.value instanceof DecorationDataRequest)) {
						callback(item.value, true);
					}
				}
			}
		}
	}

	private _fetchData(uri: URI): IDecorationData | null {

		// check for pending request and cancel it
		const pendingRequest = this.data.get(uri.toString());
		if (pendingRequest instanceof DecorationDataRequest) {
			pendingRequest.source.cancel();
			this.data.delete(uri.toString());
		}

		const source = new CancellationTokenSource();
		const dataOrThenable = this._provider.provideDecorations(uri, source.token);
		if (!isThenable<IDecorationData | Promise<IDecorationData | undefined> | undefined>(dataOrThenable)) {
			// sync -> we have a result now
			return this._keepItem(uri, dataOrThenable);

		} else {
			// async -> we have a result soon
			const request = new DecorationDataRequest(source, Promise.resolve(dataOrThenable).then(data => {
				if (this.data.get(uri.toString()) === request) {
					this._keepItem(uri, data);
				}
			}).catch(err => {
				if (!isPromiseCanceledError(err) && this.data.get(uri.toString()) === request) {
					this.data.delete(uri.toString());
				}
			}));

			this.data.set(uri.toString(), request);
			return null;
		}
	}

	private _keepItem(uri: URI, data: IDecorationData | undefined): IDecorationData | null {
		const deco = data ? data : null;
		const old = this.data.set(uri.toString(), deco);
		if (deco || old) {
			// only fire event when something changed
			this._uriEmitter.fire(uri);
		}
		return deco;
	}
}

export class FileDecorationsService implements IDecorationsService {

	_serviceBrand: any;

	private readonly _data = new LinkedList<DecorationProviderWrapper>();
	private readonly _onDidChangeDecorationsDelayed = new Emitter<URI | URI[]>();
	private readonly _onDidChangeDecorations = new Emitter<IResourceDecorationChangeEvent>();
	private readonly _decorationStyles: DecorationStyles;
	private readonly _disposables: IDisposable[];

	readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent> = Event.any(
		this._onDidChangeDecorations.event,
		Event.debounce<URI | URI[], FileDecorationChangeEvent>(
			this._onDidChangeDecorationsDelayed.event,
			FileDecorationChangeEvent.debouncer,
			undefined, undefined, 500
		)
	);

	constructor(
		@IThemeService themeService: IThemeService
	) {
		this._decorationStyles = new DecorationStyles(themeService);

		// every so many events we check if there are
		// css styles that we don't need anymore
		let count = 0;
		let reg = this.onDidChangeDecorations(() => {
			if (++count % 17 === 0) {
				this._decorationStyles.cleanUp(this._data.iterator());
			}
		});

		this._disposables = [
			reg,
			this._decorationStyles
		];
	}

	dispose(): void {
		dispose(this._disposables);
		dispose(this._onDidChangeDecorations);
		dispose(this._onDidChangeDecorationsDelayed);
	}

	registerDecorationsProvider(provider: IDecorationsProvider): IDisposable {

		const wrapper = new DecorationProviderWrapper(
			provider,
			this._onDidChangeDecorationsDelayed,
			this._onDidChangeDecorations
		);
		const remove = this._data.push(wrapper);

		this._onDidChangeDecorations.fire({
			// everything might have changed
			affectsResource() { return true; }
		});

		return toDisposable(() => {
			// fire event that says 'yes' for any resource
			// known to this provider. then dispose and remove it.
			remove();
			this._onDidChangeDecorations.fire({ affectsResource: uri => wrapper.knowsAbout(uri) });
			wrapper.dispose();
		});
	}

	getDecoration(uri: URI, includeChildren: boolean, overwrite?: IDecorationData): IDecoration | undefined {
		let data: IDecorationData[] = [];
		let containsChildren: boolean = false;
		for (let iter = this._data.iterator(), next = iter.next(); !next.done; next = iter.next()) {
			next.value.getOrRetrieve(uri, includeChildren, (deco, isChild) => {
				if (!isChild || deco.bubble) {
					data.push(deco);
					containsChildren = isChild || containsChildren;
				}
			});
		}

		if (data.length === 0) {
			// nothing, maybe overwrite data
			if (overwrite) {
				return this._decorationStyles.asDecoration([overwrite], containsChildren);
			} else {
				return undefined;
			}
		} else {
			// result, maybe overwrite
			let result = this._decorationStyles.asDecoration(data, containsChildren);
			if (overwrite) {
				return result.update(overwrite);
			} else {
				return result;
			}
		}
	}
}
function getColor(theme: ITheme, color: string | undefined) {
	if (color) {
		const foundColor = theme.getColor(color);
		if (foundColor) {
			return foundColor;
		}
	}
	return 'inherit';
}

registerSingleton(IDecorationsService, FileDecorationsService);