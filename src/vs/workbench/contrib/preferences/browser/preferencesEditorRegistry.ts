/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export namespace Extensions {
	export const PreferencesEditorPane = 'workbench.registry.preferences.editorPanes';
}

export interface IPreferencesEditorPane extends IDisposable {

	getDomNode(): HTMLElement;

	layout(dimension: DOM.Dimension): void;

	search(text: string): void;

}

export interface IPreferencesEditorPaneDescriptor {

	/**
	 * The id of the view container
	 */
	readonly id: string;

	/**
	 * The title of the view container
	 */
	readonly title: string;

	/**
	 * Icon representation of the View container
	 */
	readonly icon?: ThemeIcon | URI;

	/**
	 * Order of the view container.
	 */
	readonly order: number;

	/**
	 * IViewPaneContainer Ctor to instantiate
	 */
	readonly ctorDescriptor: SyncDescriptor<IPreferencesEditorPane>;

	/**
	 * Storage id to use to store the view container state.
	 * If not provided, it will be derived.
	 */
	readonly storageId?: string;
}

export interface IPreferencesEditorPaneRegistry {
	readonly onDidRegisterPreferencesEditorPanes: Event<IPreferencesEditorPaneDescriptor[]>;
	readonly onDidDeregisterPreferencesEditorPanes: Event<IPreferencesEditorPaneDescriptor[]>;

	registerPreferencesEditorPane(descriptor: IPreferencesEditorPaneDescriptor): IDisposable;

	getPreferencesEditorPanes(): readonly IPreferencesEditorPaneDescriptor[];
}

class PreferencesEditorPaneRegistryImpl extends Disposable implements IPreferencesEditorPaneRegistry {

	private readonly descriptors = new Map<string, IPreferencesEditorPaneDescriptor>();

	private readonly _onDidRegisterPreferencesEditorPanes = this._register(new Emitter<IPreferencesEditorPaneDescriptor[]>());
	readonly onDidRegisterPreferencesEditorPanes = this._onDidRegisterPreferencesEditorPanes.event;

	private readonly _onDidDeregisterPreferencesEditorPanes = this._register(new Emitter<IPreferencesEditorPaneDescriptor[]>());
	readonly onDidDeregisterPreferencesEditorPanes = this._onDidDeregisterPreferencesEditorPanes.event;

	constructor() {
		super();
	}

	registerPreferencesEditorPane(descriptor: IPreferencesEditorPaneDescriptor): IDisposable {
		if (this.descriptors.has(descriptor.id)) {
			throw new Error(`PreferencesEditorPane with id ${descriptor.id} already registered`);
		}
		this.descriptors.set(descriptor.id, descriptor);
		this._onDidRegisterPreferencesEditorPanes.fire([descriptor]);
		return {
			dispose: () => {
				if (this.descriptors.delete(descriptor.id)) {
					this._onDidDeregisterPreferencesEditorPanes.fire([descriptor]);
				}
			}
		};
	}

	getPreferencesEditorPanes(): readonly IPreferencesEditorPaneDescriptor[] {
		return [...this.descriptors.values()].sort((a, b) => a.order - b.order);
	}

}

Registry.add(Extensions.PreferencesEditorPane, new PreferencesEditorPaneRegistryImpl());
