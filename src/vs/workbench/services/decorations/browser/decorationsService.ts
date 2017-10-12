/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import Event, { Emitter, debounceEvent, any } from 'vs/base/common/event';
import { IResourceDecorationsService, IResourceDecoration, IResourceDecorationChangeEvent, IDecorationsProvider, IResourceDecorationData } from './decorations';
import { TernarySearchTree } from 'vs/base/common/map';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isThenable } from 'vs/base/common/async';
import { LinkedList } from 'vs/base/common/linkedList';
import { createStyleSheet, createCSSRule, removeCSSRulesContainingSelector } from 'vs/base/browser/dom';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { listActiveSelectionForeground, ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';


class DecorationColors {

	private readonly _disposables: IDisposable[];
	private readonly _styleElement = createStyleSheet();
	private readonly _classNames = new IdGenerator('monaco-decoration-styles-');
	private readonly _classNames2ColorIds = new Map<string, [string, string]>();

	constructor(
		private _themeService: IThemeService,
	) {
		this._disposables = [
			this._themeService.onThemeChange(this._onThemeChange, this),
		];
	}

	dispose(): void {
		dispose(this._disposables);
		this._styleElement.innerHTML = '';
	}

	makeResourceDecoration(decoration: IResourceDecorationData): IResourceDecoration {
		if (!decoration) {
			return undefined;
		}

		let { severity, letter, tooltip } = decoration;
		let labelClassName, badgeClassName;

		let tuple = this._classNames2ColorIds.get(decoration.color);

		if (tuple) {
			// from cache
			labelClassName = tuple[0];
			badgeClassName = tuple[1];
		} else {
			// new css rules
			labelClassName = this._classNames.nextId();
			badgeClassName = this._classNames.nextId();
			this._classNames2ColorIds.set(decoration.color, [labelClassName, badgeClassName]);
			this._createCssRules(labelClassName, badgeClassName, decoration.color);
		}

		return {
			_decoBrand: undefined,
			severity,
			letter,
			tooltip,
			labelClassName,
			badgeClassName
		};
	}

	private _onThemeChange(): void {
		this._classNames2ColorIds.forEach((tuple, color) => {
			const [labelClassName, badgeClassName] = tuple;
			removeCSSRulesContainingSelector(labelClassName, this._styleElement);
			removeCSSRulesContainingSelector(badgeClassName, this._styleElement);
			this._createCssRules(labelClassName, badgeClassName, color);
		});
	}

	private _createCssRules(labelClassName: string, badgeClassName: string, color: ColorIdentifier): void {
		const theme = this._themeService.getTheme();
		// label
		createCSSRule(`.${labelClassName}`, `color: ${theme.getColor(color)}`, this._styleElement);
		createCSSRule(`.selected .${labelClassName}`, `color: ${theme.getColor(listActiveSelectionForeground)}`, this._styleElement);

		// badge
		createCSSRule(`.${badgeClassName}`, `background-color: ${theme.getColor(color)}; color: ${theme.getColor(listActiveSelectionForeground)};`, this._styleElement);
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

class DecorationProviderWrapper {

	private readonly _data = TernarySearchTree.forPaths<Thenable<void> | IResourceDecoration>();
	private readonly _dispoable: IDisposable;

	constructor(
		private readonly _decorationStyles: DecorationColors,
		private readonly _provider: IDecorationsProvider,
		private readonly _emitter: Emitter<URI | URI[]>
	) {
		this._dispoable = this._provider.onDidChange(uris => {
			for (const uri of uris) {
				this._data.delete(uri.toString());
				this._fetchData(uri);
			}
		});
	}

	dispose(): void {
		this._dispoable.dispose();
		this._data.clear();
	}

	knowsAbout(uri: URI): boolean {
		return Boolean(this._data.get(uri.toString())) || Boolean(this._data.findSuperstr(uri.toString()));
	}

	getOrRetrieve(uri: URI, includeChildren: boolean, callback: (data: IResourceDecoration, isChild: boolean) => void): void {
		const key = uri.toString();
		let item = this._data.get(key);

		if (isThenable<void>(item)) {
			// pending -> still waiting
			return;
		}

		if (item === undefined && !includeChildren) {
			// unknown, a leaf node -> trigger request
			item = this._fetchData(uri);
		}

		if (item) {
			// leaf node
			callback(item, false);
		}
		if (includeChildren) {
			// (resolved) children
			const childTree = this._data.findSuperstr(key);
			if (childTree) {
				childTree.forEach(([, value]) => {
					if (value && !isThenable<void>(value)) {
						callback(value, true);
					}
				});
			}
		}
	}

	private _fetchData(uri: URI): IResourceDecoration {

		const dataOrThenable = this._provider.provideDecorations(uri);
		if (!isThenable(dataOrThenable)) {
			// sync -> we have a result now
			return this._keepItem(uri, dataOrThenable);

		} else {
			// async -> we have a result soon
			const request = Promise.resolve(dataOrThenable)
				.then(data => this._keepItem(uri, data))
				.catch(_ => this._data.delete(uri.toString()));

			this._data.set(uri.toString(), request);
			return undefined;
		}
	}

	private _keepItem(uri: URI, data: IResourceDecorationData): IResourceDecoration {
		let deco = data ? this._decorationStyles.makeResourceDecoration(data) : null;
		this._data.set(uri.toString(), deco);
		this._emitter.fire(uri);
		return deco;
	}
}

export class FileDecorationsService implements IResourceDecorationsService {

	_serviceBrand: any;

	private readonly _data = new LinkedList<DecorationProviderWrapper>();
	private readonly _onDidChangeDecorationsDelayed = new Emitter<URI | URI[]>();
	private readonly _onDidChangeDecorations = new Emitter<IResourceDecorationChangeEvent>();
	private readonly _decorationStyles: DecorationColors;

	readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent> = any(
		this._onDidChangeDecorations.event,
		debounceEvent<URI | URI[], FileDecorationChangeEvent>(
			this._onDidChangeDecorationsDelayed.event,
			FileDecorationChangeEvent.debouncer
		)
	);

	constructor(
		@IThemeService themeService: IThemeService,
	) {
		this._decorationStyles = new DecorationColors(themeService);
	}

	dispose(): void {
		this._decorationStyles.dispose();
	}

	registerDecortionsProvider(provider: IDecorationsProvider): IDisposable {

		const wrapper = new DecorationProviderWrapper(
			this._decorationStyles,
			provider,
			this._onDidChangeDecorationsDelayed
		);
		const remove = this._data.push(wrapper);
		return {
			dispose: () => {
				// fire event that says 'yes' for any resource
				// known to this provider. then dispose and remove it.
				remove();
				this._onDidChangeDecorations.fire({ affectsResource: uri => wrapper.knowsAbout(uri) });
				wrapper.dispose();
			}
		};
	}

	getTopDecoration(uri: URI, includeChildren: boolean): IResourceDecoration {
		let top: IResourceDecoration;
		for (let iter = this._data.iterator(), next = iter.next(); !next.done; next = iter.next()) {
			next.value.getOrRetrieve(uri, includeChildren, (candidate, isChild) => {
				top = FileDecorationsService._pickBest(top, candidate);
				if (isChild && top === candidate) {
					// only bubble up color
					top = {
						_decoBrand: undefined,
						severity: top.severity,
						labelClassName: top.labelClassName
					};
				}
			});
		}
		return top;
	}

	private static _pickBest(a: IResourceDecoration, b: IResourceDecoration): IResourceDecoration {
		if (!a) {
			return b;
		} else if (!b) {
			return a;
		} else if (Severity.compare(a.severity, b.severity) < 0) {
			return a;
		} else {
			return b;
		}
	}
}
