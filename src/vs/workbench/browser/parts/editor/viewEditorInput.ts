/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IViewEditorRegistry, ViewEditorExtensions } from './viewEditorRegistry.js';

/**
 * An editor input that shows a view, created by the view editor
 * registered for its {@link viewType}. It shows in one group only:
 * opening it again reveals it.
 */
export class ViewEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.viewEditor';

	private _rendersTitle = true;

	constructor(
		readonly viewType: string,
		private readonly viewResource: URI | undefined
	) {
		super();
	}

	override get typeId(): string {
		return ViewEditorInput.ID;
	}

	override get resource(): URI | undefined {
		return this.viewResource;
	}

	override get capabilities(): EditorInputCapabilities {
		const providesTitle = Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).get(this.viewType)?.providesTitle;
		return EditorInputCapabilities.Singleton | (providesTitle ? EditorInputCapabilities.ProvidesTitle : 0);
	}

	/**
	 * Whether the view of an editor that provides its title renders it for now ({@link setRendersTitle}): while it does
	 * not, its group shows its title area, such as its tab, also while it is the only editor of its group.
	 */
	get rendersTitle(): boolean {
		return this._rendersTitle;
	}

	/**
	 * Lets its view stop, and start again, rendering its title for now, such as while it shows something without a title.
	 * Its capabilities stay the same, so other editors opened from its group still go elsewhere; their change event fires,
	 * so its group updates its title area.
	 */
	setRendersTitle(rendersTitle: boolean): void {
		if (this._rendersTitle !== rendersTitle) {
			this._rendersTitle = rendersTitle;
			this._onDidChangeCapabilities.fire();
		}
	}

	override getName(): string {
		return Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).get(this.viewType)?.name ?? this.viewType;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}

		return otherInput instanceof ViewEditorInput && otherInput.viewType === this.viewType && isEqual(otherInput.resource, this.resource);
	}
}
