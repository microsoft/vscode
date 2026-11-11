/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import type { IEditorPaneTitleMenu } from './editor.js';
import type { ViewEditorInput } from './viewEditorInput.js';

/**
 * A view that shows as an editor through a {@link ViewEditorInput}.
 */
export interface IViewEditorView extends IDisposable {

	/**
	 * The root element of the view.
	 */
	readonly element: HTMLElement;

	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;

	/**
	 * Fired when the size constraints of the view change.
	 */
	readonly onDidChange: Event<{ width: number; height: number } | undefined>;

	/**
	 * Whether the view renders its own title row. A group that holds only
	 * this view then does not show its title area, and the view shows its
	 * title; see {@link setProvidedTitleVisible}.
	 */
	readonly providesTitle: boolean;

	/**
	 * Called, for a view that renders its own title, as the group of its
	 * editor shows its title area, such as its tabs, as it holds other
	 * editors too, and as it hides it again: `visible` is false while the
	 * group shows its title, and the view then does not show its own.
	 */
	setProvidedTitleVisible?(visible: boolean): void;

	/**
	 * The menu of the view's own actions, such as those of the title it
	 * renders, which the tab bar of its group shows while its editor is
	 * active.
	 */
	readonly titleMenu?: IEditorPaneTitleMenu;

	/**
	 * An element of the view, such as its title row, that drags the view's
	 * editor the way its tab would.
	 */
	readonly dragHandle?: HTMLElement;

	layout(width: number, height: number, top: number, left: number): void;

	focus(): void;

	/**
	 * Saves the state of the view, such as its scroll position, when its
	 * editor is about to leave the pane: before it moves to another group,
	 * where the view is created again before this one is disposed, and
	 * before the pane clears its input.
	 */
	saveViewState?(): void;

	/**
	 * Called as the view hides while its editor stays in its group, such
	 * as while another editor of the group shows as a tab, and as it shows
	 * again: a hidden view should not render or act as if seen.
	 */
	setVisible?(visible: boolean): void;
}

/**
 * Describes a type of view that can show as an editor.
 */
export interface IViewEditorDescriptor {

	/**
	 * The type of view, as used by {@link ViewEditorInput.viewType}.
	 */
	readonly viewType: string;

	/**
	 * The name of the view, used as the name of its editor.
	 */
	readonly name: string;

	/**
	 * Whether its views render their own title, as {@link IViewEditorView.providesTitle} says: its editors then have the
	 * `ProvidesTitle` capability.
	 */
	readonly providesTitle?: boolean;

	/**
	 * Creates the view for the input. The instantiation service opens
	 * other editors in the main part of the window the view shows in.
	 */
	createView(instantiationService: IInstantiationService, input: ViewEditorInput): IViewEditorView;
}

export interface IViewEditorRegistry {

	/**
	 * Registers a type of view that can show as an editor.
	 */
	register(descriptor: IViewEditorDescriptor): IDisposable;

	/**
	 * Returns the descriptor for a type of view, if registered.
	 */
	get(viewType: string): IViewEditorDescriptor | undefined;
}

class ViewEditorRegistry implements IViewEditorRegistry {

	private readonly descriptors = new Map<string, IViewEditorDescriptor>();

	register(descriptor: IViewEditorDescriptor): IDisposable {
		if (this.descriptors.has(descriptor.viewType)) {
			throw new Error(`A view editor for '${descriptor.viewType}' is already registered.`);
		}

		this.descriptors.set(descriptor.viewType, descriptor);

		return toDisposable(() => {
			if (this.descriptors.get(descriptor.viewType) === descriptor) {
				this.descriptors.delete(descriptor.viewType);
			}
		});
	}

	get(viewType: string): IViewEditorDescriptor | undefined {
		return this.descriptors.get(viewType);
	}
}

export const ViewEditorExtensions = {
	ViewEditors: 'workbench.contributions.viewEditors'
};

Registry.add(ViewEditorExtensions.ViewEditors, new ViewEditorRegistry());
