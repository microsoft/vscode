/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter, DebounceEmitter } from '../../../../base/common/event.js';
import { IDecorationsService } from '../common/decorations.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isThenable } from '../../../../base/common/async.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { createStyleSheet, createCSSRule, removeCSSRulesContainingSelector } from '../../../../base/browser/domStylesheets.js';
import * as cssValue from '../../../../base/browser/cssValue.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { hash } from '../../../../base/common/hash.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { asArray, distinct } from '../../../../base/common/arrays.js';
import { asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
class DecorationRule {
    static keyOf(data) {
        if (Array.isArray(data)) {
            return data.map(DecorationRule.keyOf).join(',');
        }
        else {
            const { color, letter } = data;
            if (ThemeIcon.isThemeIcon(letter)) {
                return `${color}+${letter.id}`;
            }
            else {
                return `${color}/${letter}`;
            }
        }
    }
    static { this._classNamesPrefix = 'monaco-decoration'; }
    constructor(themeService, data, key) {
        this.themeService = themeService;
        this._refCounter = 0;
        this.data = data;
        const suffix = hash(key).toString(36);
        this.itemColorClassName = `${DecorationRule._classNamesPrefix}-itemColor-${suffix}`;
        this.itemBadgeClassName = `${DecorationRule._classNamesPrefix}-itemBadge-${suffix}`;
        this.bubbleBadgeClassName = `${DecorationRule._classNamesPrefix}-bubbleBadge-${suffix}`;
        this.iconBadgeClassName = `${DecorationRule._classNamesPrefix}-iconBadge-${suffix}`;
    }
    acquire() {
        this._refCounter += 1;
    }
    release() {
        return --this._refCounter === 0;
    }
    appendCSSRules(element) {
        if (!Array.isArray(this.data)) {
            this._appendForOne(this.data, element);
        }
        else {
            this._appendForMany(this.data, element);
        }
    }
    _appendForOne(data, element) {
        const { color, letter } = data;
        // label
        createCSSRule(`.${this.itemColorClassName}`, `color: ${getColor(color)};`, element);
        if (ThemeIcon.isThemeIcon(letter)) {
            this._createIconCSSRule(letter, color, element);
        }
        else if (letter) {
            createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letter}"; color: ${getColor(color)};`, element);
        }
    }
    _appendForMany(data, element) {
        // label
        const { color } = data.find(d => !!d.color) ?? data[0];
        createCSSRule(`.${this.itemColorClassName}`, `color: ${getColor(color)};`, element);
        // badge or icon
        const letters = [];
        let icon;
        for (const d of data) {
            if (ThemeIcon.isThemeIcon(d.letter)) {
                icon = d.letter;
                break;
            }
            else if (d.letter) {
                letters.push(d.letter);
            }
        }
        if (icon) {
            this._createIconCSSRule(icon, color, element);
        }
        else {
            if (letters.length) {
                createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letters.join(', ')}"; color: ${getColor(color)};`, element);
            }
            // bubble badge
            // TODO @misolori update bubble badge to adopt letter: ThemeIcon instead of unicode
            createCSSRule(`.${this.bubbleBadgeClassName}::after`, `content: "\uea71"; color: ${getColor(color)}; font-family: codicon; font-size: 14px; margin-right: 14px; opacity: 0.4;`, element);
        }
    }
    _createIconCSSRule(icon, color, element) {
        const modifier = ThemeIcon.getModifier(icon);
        if (modifier) {
            icon = ThemeIcon.modify(icon, undefined);
        }
        const iconContribution = getIconRegistry().getIcon(icon.id);
        if (!iconContribution) {
            return;
        }
        const definition = this.themeService.getProductIconTheme().getIcon(iconContribution);
        if (!definition) {
            return;
        }
        createCSSRule(`.${this.iconBadgeClassName}::after`, `content: '${definition.fontCharacter}';
			color: ${icon.color ? getColor(icon.color.id) : getColor(color)};
			font-family: ${cssValue.stringValue(definition.font?.id ?? 'codicon')};
			font-size: 16px;
			margin-right: 14px;
			font-weight: normal;
			${modifier === 'spin' ? 'animation: codicon-spin 1.5s steps(30) infinite; font-style: normal !important; transform-origin: center center;' : ''};
			`, element);
    }
    removeCSSRules(element) {
        removeCSSRulesContainingSelector(this.itemColorClassName, element);
        removeCSSRulesContainingSelector(this.itemBadgeClassName, element);
        removeCSSRulesContainingSelector(this.bubbleBadgeClassName, element);
        removeCSSRulesContainingSelector(this.iconBadgeClassName, element);
    }
}
class DecorationStyles {
    constructor(_themeService) {
        this._themeService = _themeService;
        this._dispoables = new DisposableStore();
        this._styleElement = createStyleSheet(undefined, undefined, this._dispoables);
        this._decorationRules = new Map();
    }
    dispose() {
        this._dispoables.dispose();
    }
    asDecoration(data, onlyChildren) {
        // sort by weight
        data.sort((a, b) => (b.weight || 0) - (a.weight || 0));
        const key = DecorationRule.keyOf(data);
        let rule = this._decorationRules.get(key);
        if (!rule) {
            // new css rule
            rule = new DecorationRule(this._themeService, data, key);
            this._decorationRules.set(key, rule);
            rule.appendCSSRules(this._styleElement);
        }
        rule.acquire();
        const labelClassName = rule.itemColorClassName;
        let badgeClassName = rule.itemBadgeClassName;
        const iconClassName = rule.iconBadgeClassName;
        let tooltip = distinct(data.filter(d => !isFalsyOrWhitespace(d.tooltip)).map(d => d.tooltip)).join(' • ');
        const strikethrough = data.some(d => d.strikethrough);
        if (onlyChildren) {
            // show items from its children only
            badgeClassName = rule.bubbleBadgeClassName;
            tooltip = localize('bubbleTitle', "Contains emphasized items");
        }
        return {
            labelClassName,
            badgeClassName,
            iconClassName,
            strikethrough,
            tooltip,
            dispose: () => {
                if (rule?.release()) {
                    this._decorationRules.delete(key);
                    rule.removeCSSRules(this._styleElement);
                    rule = undefined;
                }
            }
        };
    }
}
class FileDecorationChangeEvent {
    constructor(all) {
        this._data = TernarySearchTree.forUris(_uri => true); // events ignore all path casings
        this._data.fill(true, asArray(all));
    }
    affectsResource(uri) {
        return this._data.hasElementOrSubtree(uri);
    }
}
class DecorationDataRequest {
    constructor(source, thenable) {
        this.source = source;
        this.thenable = thenable;
    }
}
function getColor(color) {
    return color ? asCssVariable(color) : 'inherit';
}
let DecorationsService = class DecorationsService {
    constructor(uriIdentityService, themeService) {
        this._store = new DisposableStore();
        this._onDidChangeDecorationsDelayed = this._store.add(new DebounceEmitter({ merge: all => all.flat() }));
        this._onDidChangeDecorations = this._store.add(new Emitter());
        this.onDidChangeDecorations = this._onDidChangeDecorations.event;
        this._provider = new LinkedList();
        this._decorationStyles = new DecorationStyles(themeService);
        this._data = TernarySearchTree.forUris(key => uriIdentityService.extUri.ignorePathCasing(key));
        this._store.add(this._onDidChangeDecorationsDelayed.event(event => { this._onDidChangeDecorations.fire(new FileDecorationChangeEvent(event)); }));
    }
    dispose() {
        this._store.dispose();
        this._data.clear();
    }
    registerDecorationsProvider(provider) {
        const rm = this._provider.unshift(provider);
        this._onDidChangeDecorations.fire({
            // everything might have changed
            affectsResource() { return true; }
        });
        // remove everything what came from this provider
        const removeAll = () => {
            const uris = [];
            for (const [uri, map] of this._data) {
                if (map.delete(provider)) {
                    uris.push(uri);
                }
            }
            if (uris.length > 0) {
                this._onDidChangeDecorationsDelayed.fire(uris);
            }
        };
        const listener = provider.onDidChange(uris => {
            if (!uris) {
                // flush event -> drop all data, can affect everything
                removeAll();
            }
            else {
                // selective changes -> drop for resource, fetch again, send event
                for (const uri of uris) {
                    const map = this._ensureEntry(uri);
                    this._fetchData(map, uri, provider);
                }
            }
        });
        return toDisposable(() => {
            rm();
            listener.dispose();
            removeAll();
        });
    }
    _ensureEntry(uri) {
        let map = this._data.get(uri);
        if (!map) {
            // nothing known about this uri
            map = new Map();
            this._data.set(uri, map);
        }
        return map;
    }
    getDecoration(uri, includeChildren) {
        const all = [];
        let containsChildren = false;
        const map = this._ensureEntry(uri);
        for (const provider of this._provider) {
            let data = map.get(provider);
            if (data === undefined) {
                // sets data if fetch is sync
                data = this._fetchData(map, uri, provider);
            }
            if (data && !(data instanceof DecorationDataRequest)) {
                // having data
                all.push(data);
            }
        }
        if (includeChildren) {
            // (resolved) children
            const iter = this._data.findSuperstr(uri);
            if (iter) {
                for (const tuple of iter) {
                    for (const data of tuple[1].values()) {
                        if (data && !(data instanceof DecorationDataRequest)) {
                            if (data.bubble) {
                                all.push(data);
                                containsChildren = true;
                            }
                        }
                    }
                }
            }
        }
        return all.length === 0
            ? undefined
            : this._decorationStyles.asDecoration(all, containsChildren);
    }
    _fetchData(map, uri, provider) {
        // check for pending request and cancel it
        const pendingRequest = map.get(provider);
        if (pendingRequest instanceof DecorationDataRequest) {
            pendingRequest.source.cancel();
            map.delete(provider);
        }
        const cts = new CancellationTokenSource();
        const dataOrThenable = provider.provideDecorations(uri, cts.token);
        if (!isThenable(dataOrThenable)) {
            // sync -> we have a result now
            cts.dispose();
            return this._keepItem(map, provider, uri, dataOrThenable);
        }
        else {
            // async -> we have a result soon
            const request = new DecorationDataRequest(cts, Promise.resolve(dataOrThenable).then(data => {
                if (map.get(provider) === request) {
                    this._keepItem(map, provider, uri, data);
                }
            }).catch(err => {
                if (!isCancellationError(err) && map.get(provider) === request) {
                    map.delete(provider);
                }
            }).finally(() => {
                cts.dispose();
            }));
            map.set(provider, request);
            return null;
        }
    }
    _keepItem(map, provider, uri, data) {
        const deco = data ? data : null;
        const old = map.get(provider);
        map.set(provider, deco);
        if (deco || old) {
            // only fire event when something changed
            this._onDidChangeDecorationsDelayed.fire(uri);
        }
        return deco;
    }
};
DecorationsService = __decorate([
    __param(0, IUriIdentityService),
    __param(1, IThemeService)
], DecorationsService);
export { DecorationsService };
registerSingleton(IDecorationsService, DecorationsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbnNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2RlY29yYXRpb25zL2Jyb3dzZXIvZGVjb3JhdGlvbnNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbkYsT0FBTyxFQUFFLG1CQUFtQixFQUFzRixNQUFNLDBCQUEwQixDQUFDO0FBQ25KLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pGLE9BQU8sRUFBZSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0gsT0FBTyxLQUFLLFFBQVEsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQXFCLGlCQUFpQixF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