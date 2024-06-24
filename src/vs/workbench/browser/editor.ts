/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { EditorResourceAccessor, EditorExtensions, SideBySideEditor, IEditorDescriptor as ICommonEditorDescriptor, EditorCloseContext, IWillInstantiateEditorPaneEvent } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IConstructorSignature, IInstantiationService, BrandedService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Promises } from 'vs/base/common/async';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Iterable } from 'vs/base/common/iterator';
import { Emitter } from 'vs/base/common/event';

//#region Editor Pane Registry

export interface IEditorPaneDescriptor extends ICommonEditorDescriptor<EditorPane> { }

export interface IEditorPaneRegistry {

	/**
	 * Registers an editor pane to the platform for the given editor type. The second parameter also supports an
	 * array of input classes to be passed in. If the more than one editor is registered for the same editor
	 * input, the input itself will be asked which editor it prefers if this method is provided. Otherwise
	 * the first editor in the list will be returned.
	 *
	 * @param editorDescriptors A set of constructor functions that return an instance of `EditorInput` for which the
	 * registered editor should be used for.
	 */
	registerEditorPane(editorPaneDescriptor: IEditorPaneDescriptor, editorDescriptors: readonly SyncDescriptor<EditorInput>[]): IDisposable;

	/**
	 * Returns the editor pane descriptor for the given editor or `undefined` if none.
	 */
	getEditorPane(editor: EditorInput): IEditorPaneDescriptor | undefined;
}

/**
 * A lightweight descriptor of an editor pane. The descriptor is deferred so that heavy editor
 * panes can load lazily in the workbench.
 */
export class EditorPaneDescriptor implements IEditorPaneDescriptor {

	private static readonly instantiatedEditorPanes = new Set<string>();
	static didInstantiateEditorPane(typeId: string): boolean {
		return EditorPaneDescriptor.instantiatedEditorPanes.has(typeId);
	}

	private static readonly _onWillInstantiateEditorPane = new Emitter<IWillInstantiateEditorPaneEvent>();
	static readonly onWillInstantiateEditorPane = EditorPaneDescriptor._onWillInstantiateEditorPane.event;

	static create<Services extends BrandedService[]>(
		ctor: { new(group: IEditorGroup, ...services: Services): EditorPane },
		typeId: string,
		name: string
	): EditorPaneDescriptor {
		return new EditorPaneDescriptor(ctor as IConstructorSignature<EditorPane, [IEditorGroup]>, typeId, name);
	}

	private constructor(
		private readonly ctor: IConstructorSignature<EditorPane, [IEditorGroup]>,
		readonly typeId: string,
		readonly name: string
	) { }

	instantiate(instantiationService: IInstantiationService, group: IEditorGroup): EditorPane {
		EditorPaneDescriptor._onWillInstantiateEditorPane.fire({ typeId: this.typeId });

		const pane = instantiationService.createInstance(this.ctor, group);
		EditorPaneDescriptor.instantiatedEditorPanes.add(this.typeId);

		return pane;
	}

	describes(editorPane: EditorPane): boolean {
		return editorPane.getId() === this.typeId;
	}
}

export class EditorPaneRegistry implements IEditorPaneRegistry {

	private readonly mapEditorPanesToEditors = new Map<EditorPaneDescriptor, readonly SyncDescriptor<EditorInput>[]>();

	registerEditorPane(editorPaneDescriptor: EditorPaneDescriptor, editorDescriptors: readonly SyncDescriptor<EditorInput>[]): IDisposable {
		this.mapEditorPanesToEditors.set(editorPaneDescriptor, editorDescriptors);

		return toDisposable(() => {
			this.mapEditorPanesToEditors.delete(editorPaneDescriptor);
		});
	}

	getEditorPane(editor: EditorInput): EditorPaneDescriptor | undefined {
		const descriptors = this.findEditorPaneDescriptors(editor);

		if (descriptors.length === 0) {
			return undefined;
		}

		if (descriptors.length === 1) {
			return descriptors[0];
		}

		return editor.prefersEditorPane(descriptors);
	}

	private findEditorPaneDescriptors(editor: EditorInput, byInstanceOf?: boolean): EditorPaneDescriptor[] {
		const matchingEditorPaneDescriptors: EditorPaneDescriptor[] = [];

		for (const editorPane of this.mapEditorPanesToEditors.keys()) {
			const editorDescriptors = this.mapEditorPanesToEditors.get(editorPane) || [];
			for (const editorDescriptor of editorDescriptors) {
				const editorClass = editorDescriptor.ctor;

				// Direct check on constructor type (ignores prototype chain)
				if (!byInstanceOf && editor.constructor === editorClass) {
					matchingEditorPaneDescriptors.push(editorPane);
					break;
				}

				// Normal instanceof check
				else if (byInstanceOf && editor instanceof editorClass) {
					matchingEditorPaneDescriptors.push(editorPane);
					break;
				}
			}
		}

		// If no descriptors found, continue search using instanceof and prototype chain
		if (!byInstanceOf && matchingEditorPaneDescriptors.length === 0) {
			return this.findEditorPaneDescriptors(editor, true);
		}

		return matchingEditorPaneDescriptors;
	}

	//#region Used for tests only

	getEditorPaneByType(typeId: string): EditorPaneDescriptor | undefined {
		return Iterable.find(this.mapEditorPanesToEditors.keys(), editor => editor.typeId === typeId);
	}

	getEditorPanes(): readonly EditorPaneDescriptor[] {
		return Array.from(this.mapEditorPanesToEditors.keys());
	}

	getEditors(): SyncDescriptor<EditorInput>[] {
		const editorClasses: SyncDescriptor<EditorInput>[] = [];
		for (const editorPane of this.mapEditorPanesToEditors.keys()) {
			const editorDescriptors = this.mapEditorPanesToEditors.get(editorPane);
			if (editorDescriptors) {
				editorClasses.push(...editorDescriptors.map(editorDescriptor => editorDescriptor.ctor));
			}
		}

		return editorClasses;
	}

	//#endregion
}

Registry.add(EditorExtensions.EditorPane, new EditorPaneRegistry());

//#endregion

//#region Editor Close Tracker

export function whenEditorClosed(accessor: ServicesAccessor, resources: URI[]): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const uriIdentityService = accessor.get(IUriIdentityService);
	const workingCopyService = accessor.get(IWorkingCopyService);

	return new Promise(resolve => {
		let remainingResources = [...resources];

		// Observe any editor closing from this moment on
		const listener = editorService.onDidCloseEditor(async event => {
			if (event.context === EditorCloseContext.MOVE) {
				return; // ignore move events where the editor will open in another group
			}

			let primaryResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			let secondaryResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.SECONDARY });

			// Specially handle an editor getting replaced: if the new active editor
			// matches any of the resources from the closed editor, ignore those
			// resources because they were actually not closed, but replaced.
			// (see https://github.com/microsoft/vscode/issues/134299)
			if (event.context === EditorCloseContext.REPLACE) {
				const newPrimaryResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
				const newSecondaryResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY });

				if (uriIdentityService.extUri.isEqual(primaryResource, newPrimaryResource)) {
					primaryResource = undefined;
				}

				if (uriIdentityService.extUri.isEqual(secondaryResource, newSecondaryResource)) {
					secondaryResource = undefined;
				}
			}

			// Remove from resources to wait for being closed based on the
			// resources from editors that got closed
			remainingResources = remainingResources.filter(resource => {

				// Closing editor matches resource directly: remove from remaining
				if (uriIdentityService.extUri.isEqual(resource, primaryResource) || uriIdentityService.extUri.isEqual(resource, secondaryResource)) {
					return false;
				}

				// Closing editor is untitled with associated resource
				// that matches resource directly: remove from remaining
				// but only if the editor was not replaced, otherwise
				// saving an untitled with associated resource would
				// release the `--wait` call.
				// (see https://github.com/microsoft/vscode/issues/141237)
				if (event.context !== EditorCloseContext.REPLACE) {
					if (
						(primaryResource?.scheme === Schemas.untitled && uriIdentityService.extUri.isEqual(resource, primaryResource.with({ scheme: resource.scheme }))) ||
						(secondaryResource?.scheme === Schemas.untitled && uriIdentityService.extUri.isEqual(resource, secondaryResource.with({ scheme: resource.scheme })))
					) {
						return false;
					}
				}

				// Editor is not yet closed, so keep it in waiting mode
				return true;
			});

			// All resources to wait for being closed are closed
			if (remainingResources.length === 0) {

				// If auto save is configured with the default delay (1s) it is possible
				// to close the editor while the save still continues in the background. As such
				// we have to also check if the editors to track for are dirty and if so wait
				// for them to get saved.
				const dirtyResources = resources.filter(resource => workingCopyService.isDirty(resource));
				if (dirtyResources.length > 0) {
					await Promises.settled(dirtyResources.map(async resource => await new Promise<void>(resolve => {
						if (!workingCopyService.isDirty(resource)) {
							return resolve(); // return early if resource is not dirty
						}

						// Otherwise resolve promise when resource is saved
						const listener = workingCopyService.onDidChangeDirty(workingCopy => {
							if (!workingCopy.isDirty() && uriIdentityService.extUri.isEqual(resource, workingCopy.resource)) {
								listener.dispose();

								return resolve();
							}
						});
					})));
				}

				listener.dispose();

				return resolve();
			}
		});
	});
}

//#endregion

//#region ARIA

export function computeEditorAriaLabel(input: EditorInput, index: number | undefined, group: IEditorGroup | undefined, groupCount: number | undefined): string {
	let ariaLabel = input.getAriaLabel();
	if (group && !group.isPinned(input)) {
		ariaLabel = localize('preview', "{0}, preview", ariaLabel);
	}

	if (group?.isSticky(index ?? input)) {
		ariaLabel = localize('pinned', "{0}, pinned", ariaLabel);
	}

	// Apply group information to help identify in
	// which group we are (only if more than one group
	// is actually opened)
	if (group && typeof groupCount === 'number' && groupCount > 1) {
		ariaLabel = `${ariaLabel}, ${group.ariaLabel}`;
	}

	return ariaLabel;
}

//#endregion
