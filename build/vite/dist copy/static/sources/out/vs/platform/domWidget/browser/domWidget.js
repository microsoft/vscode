/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isHotReloadEnabled } from '../../../base/common/hotReload.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableValue } from '../../../base/common/observable.js';
/**
 * The DomWidget class provides a standard to define reusable UI components.
 * It is disposable and defines a single root element of type HTMLElement.
 * It also provides static helper methods to create and append widgets to the DOM,
 * with support for hot module replacement during development.
*/
export class DomWidget extends Disposable {
    /**
     * Appends the widget to the provided DOM element.
    */
    static createAppend(dom, store, ...params) {
        if (!isHotReloadEnabled()) {
            const widget = new this(...params);
            dom.appendChild(widget.element);
            store.add(widget);
            return;
        }
        const observable = this.createObservable(store, ...params);
        store.add(autorun((reader) => {
            const widget = observable.read(reader);
            dom.appendChild(widget.element);
            reader.store.add(toDisposable(() => widget.element.remove()));
            reader.store.add(widget);
        }));
    }
    /**
     * Creates the widget in a new div element with "display: contents".
    */
    static createInContents(store, ...params) {
        const div = document.createElement('div');
        div.style.display = 'contents';
        this.createAppend(div, store, ...params);
        return div;
    }
    /**
     * Creates an observable instance of the widget.
     * The observable will change when hot module replacement occurs.
    */
    static createObservable(store, ...params) {
        if (!isHotReloadEnabled()) {
            return constObservable(new this(...params));
        }
        const id = this[_hotReloadId];
        const observable = id ? hotReloadedWidgets.get(id) : undefined;
        if (!observable) {
            return constObservable(new this(...params));
        }
        return derived(reader => {
            const Ctor = observable.read(reader);
            return new Ctor(...params);
        });
    }
    /**
     * Appends the widget to the provided DOM element.
    */
    static instantiateAppend(instantiationService, dom, store, ...params) {
        if (!isHotReloadEnabled()) {
            const widget = instantiationService.createInstance(this, ...params);
            dom.appendChild(widget.element);
            store.add(widget);
            return;
        }
        const observable = this.instantiateObservable(instantiationService, store, ...params);
        let lastWidget = undefined;
        store.add(autorun((reader) => {
            const widget = observable.read(reader);
            if (lastWidget) {
                lastWidget.element.replaceWith(widget.element);
            }
            else {
                dom.appendChild(widget.element);
            }
            lastWidget = widget;
            reader.delayedStore.add(widget);
        }));
    }
    /**
     * Creates the widget in a new div element with "display: contents".
     * If possible, prefer `instantiateAppend`, as it avoids an extra div in the DOM.
    */
    static instantiateInContents(instantiationService, store, ...params) {
        const div = document.createElement('div');
        div.style.display = 'contents';
        this.instantiateAppend(instantiationService, div, store, ...params);
        return div;
    }
    /**
     * Creates an observable instance of the widget.
     * The observable will change when hot module replacement occurs.
    */
    static instantiateObservable(instantiationService, store, ...params) {
        if (!isHotReloadEnabled()) {
            return constObservable(instantiationService.createInstance(this, ...params));
        }
        const id = this[_hotReloadId];
        const observable = id ? hotReloadedWidgets.get(id) : undefined;
        if (!observable) {
            return constObservable(instantiationService.createInstance(this, ...params));
        }
        return derived(reader => {
            const Ctor = observable.read(reader);
            return instantiationService.createInstance(Ctor, ...params);
        });
    }
    /**
     * @deprecated Do not call manually! Only for use by the hot reload system (a vite plugin will inject calls to this method in dev mode).
    */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static registerWidgetHotReplacement(id) {
        if (!isHotReloadEnabled()) {
            return;
        }
        let observable = hotReloadedWidgets.get(id);
        if (!observable) {
            observable = observableValue(id, this);
            hotReloadedWidgets.set(id, observable);
        }
        else {
            observable.set(this, undefined);
        }
        this[_hotReloadId] = id;
    }
}
const _hotReloadId = Symbol('DomWidgetHotReloadId');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hotReloadedWidgets = new Map();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZG9tV2lkZ2V0L2Jyb3dzZXIvZG9tV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxVQUFVLEVBQW1CLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlGLE9BQU8sRUFBb0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFHMUk7Ozs7O0VBS0U7QUFDRixNQUFNLE9BQWdCLFNBQVUsU0FBUSxVQUFVO0lBQ2pEOztNQUVFO0lBQ0ssTUFBTSxDQUFDLFlBQVksQ0FBOEUsR0FBZ0IsRUFBRSxLQUFzQixFQUFFLEdBQUcsTUFBYTtRQUNqSyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDO1lBQzNCLE1BQU0sTUFBTSxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7WUFDbkMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQztRQUMzRCxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQzVCLE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMs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