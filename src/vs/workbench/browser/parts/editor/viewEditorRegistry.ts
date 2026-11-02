/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
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
	 * this view then does not show its title area.
	 */
	readonly providesTitle: boolean;

	layout(width: number, height: number, top: number, left: number): void;

	focus(): void;

	/**
	 * Saves the state of the view, such as its scroll position, when its
	 * editor is about to leave the pane: before it moves to another group,
	 * where the view is created again before this one is disposed, and
	 * before the pane clears its input.
	 */
	saveViewState?(): void;
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
