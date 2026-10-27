/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, extname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator, QuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, GroupIdentifier, isEditorInputWithOptionsAndGroup, isResourceDiffEditorInput, isResourceSideBySideEditorInput, IUntypedEditorInput, SideBySideEditor } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IEditorGroupsService } from '../common/editorGroupsService.js';
import { IEditorResolverService, priorityToRank, RegisteredEditorInfo } from '../common/editorResolverService.js';

export interface IOpenWithEditorPickerOptions {

	/**
	 * Asks the user for a new default editor for the resource and persists the choice.
	 */
	readonly configureDefault?: boolean;
}

/**
 * Lets the user pick which of the editors registered with the {@link IEditorResolverService}
 * to open an editor with.
 */
export class OpenWithEditorPicker {

	private static readonly configureDefaultID = 'promptOpenWith.configureDefault';
	private static readonly configureDefaultDiffID = 'promptOpenWith.configureDefaultDiff';

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IExtensionService private readonly extensionService: IExtensionService
	) { }

	/**
	 * Shows a picker of the editors that can open the given editor.
	 * @returns The options to open the editor with, where `override` is the picked editor,
	 * or `undefined` if the picker was cancelled.
	 */
	async pick(editor: IUntypedEditorInput, options?: IOpenWithEditorPickerOptions): Promise<IEditorOptions | undefined> {

		// Side by side editors resolve both sides independently and do not use an override
		if (isResourceSideBySideEditorInput(editor)) {
			return { ...editor.options };
		}

		// Make sure editors contributed by extensions are part of the picker
		await this.extensionService.whenInstalledExtensionsRegistered();

		return this.doPick(editor, options?.configureDefault);
	}

	private async doPick(editor: IUntypedEditorInput, showDefaultPicker: boolean | undefined, updateDiffEditorDefault?: boolean): Promise<IEditorOptions | undefined> {

		type EditorPick = {
			readonly item: IQuickPickItem;
			readonly openInBackground: boolean;
		};

		let resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (resource === undefined) {
			resource = URI.from({ scheme: Schemas.untitled });
		}
		const isDiffEditor = isResourceDiffEditorInput(editor);
		// Which setting the default picker should write to. Defaults to the resource's association type
		// so that the per-item gear button keeps writing to the matching setting, but the "Configure
		// default editor" entries can target a specific setting (general vs. diff-only).
		const isDiffEditorDefault = updateDiffEditorDefault ?? isDiffEditor;
		const defaultRule = this.editorResolverService.getEditorMatches(resource, { isDiffEditor: isDiffEditorDefault }).defaultRule;

		// Persists the picked editor as the default for this resource's glob. When the user configures
		// the general default from a diff context, any diff-only override for the same glob is cleared
		// so that the general default also takes effect for diffs.
		const persistDefaultAssociation = (editorID: string) => {
			const associationPattern = defaultRule.associationPattern;
			this.editorResolverService.setDefaultEditor(resource, editorID, isDiffEditorDefault);
			if (!isDiffEditorDefault && isDiffEditor) {
				this.editorResolverService.removeDiffEditorAssociation(resource, associationPattern);
			}
		};

		// Get all the editors for the resource as quickpick entries
		const editorPicks = this.getEditorPicks(resource, showDefaultPicker, isDiffEditor, isDiffEditorDefault);

		// Create the editor picker
		const disposables = new DisposableStore();
		const editorPicker = disposables.add(this.quickInputService.createQuickPick<IQuickPickItem>({ useSeparators: true }));
		const placeHolderMessage = showDefaultPicker ?
			(isDiffEditorDefault ?
				localize('promptOpenWith.updateDefaultDiffPlaceHolder', "Select new default editor (diff only) for '{0}'", defaultRule.associationPattern) :
				localize('promptOpenWith.updateDefaultPlaceHolder', "Select new default editor for '{0}'", defaultRule.associationPattern)) :
			localize('promptOpenWith.placeHolder', "Select editor for '{0}'", basename(resource));
		editorPicker.placeholder = placeHolderMessage;
		editorPicker.canAcceptInBackground = true;
		editorPicker.items = editorPicks;
		const firstItem = editorPicker.items.find(item => item.type === 'item') as IQuickPickItem | undefined;
		if (firstItem) {
			editorPicker.selectedItems = [firstItem];
		}

		// Prompt the user to select an editor
		const picked: EditorPick | undefined = await new Promise<EditorPick | undefined>(resolve => {
			disposables.add(editorPicker.onDidAccept(e => {
				let result: EditorPick | undefined = undefined;

				if (editorPicker.selectedItems.length === 1) {
					result = {
						item: editorPicker.selectedItems[0],
						openInBackground: e.inBackground
					};
				}

				// If asked to always update the setting then update it even if the gear isn't clicked
				if (showDefaultPicker && result?.item.id) {
					persistDefaultAssociation(result.item.id);
				}

				resolve(result);
			}));

			disposables.add(editorPicker.onDidHide(() => {
				disposables.dispose();
				resolve(undefined);
			}));

			disposables.add(editorPicker.onDidTriggerItemButton(e => {

				// Trigger opening and close picker
				resolve({ item: e.item, openInBackground: false });

				// Persist setting
				if (e.item?.id) {
					persistDefaultAssociation(e.item.id);
				}
			}));

			editorPicker.show();
		});

		// Close picker
		editorPicker.dispose();

		// If the user picked an editor, look at how the picker was
		// used (e.g. open in background) and create the options to use accordingly
		if (picked) {

			// If the user selected to configure default we trigger this picker again and tell it to show the default picker
			if (picked.item.id === OpenWithEditorPicker.configureDefaultID) {
				return this.doPick(editor, true, false);
			}
			// The diff-only variant writes to `diffEditorAssociations` so it does not change how the
			// resource opens as a normal editor.
			if (picked.item.id === OpenWithEditorPicker.configureDefaultDiffID) {
				return this.doPick(editor, true, true);
			}

			return {
				...editor.options,
				override: picked.item.id,
				preserveFocus: picked.openInBackground || editor.options?.preserveFocus,
			};
		}

		return undefined;
	}

	private getEditorPicks(resource: URI, showDefaultPicker: boolean | undefined, isDiffEditor: boolean, isDiffEditorDefault: boolean): QuickPickItem[] {
		const currentEditor = this.editorGroupsService.activeGroup.findEditors(resource).at(0);
		// If untitled, we want all registered editors
		const registeredEditors = resource.scheme === Schemas.untitled
			? this.editorResolverService.getEditors({ excludeExclusiveEditors: true, isDiffEditor })
			: this.editorResolverService.getEditorMatches(resource, { isDiffEditor }).matches.map(match => match.editor);
		const defaultRule = this.editorResolverService.getEditorMatches(resource, { isDiffEditor: isDiffEditorDefault }).defaultRule;
		const getPriority = (editor: RegisteredEditorInfo) => isDiffEditor ? editor.priority.diff : editor.priority.editor;
		// Not the most efficient way to do this, but we want to ensure the text editor is at the top of the quickpick
		registeredEditors.sort((a, b) => {
			if (a.id === DEFAULT_EDITOR_ASSOCIATION.id) {
				return -1;
			} else if (b.id === DEFAULT_EDITOR_ASSOCIATION.id) {
				return 1;
			} else {
				return priorityToRank(getPriority(b)) - priorityToRank(getPriority(a));
			}
		});
		const quickPickEntries: QuickPickItem[] = [];
		const currentlyActiveLabel = localize('promptOpenWith.currentlyActive', "Active");
		const currentDefaultLabel = localize('promptOpenWith.currentDefault', "Default");
		const currentDefaultAndActiveLabel = localize('promptOpenWith.currentDefaultAndActive', "Active and Default");
		// Map the editors to quickpick entries
		for (const editor of registeredEditors) {
			const currentViewType = currentEditor?.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id;
			const isActive = currentEditor ? editor.id === currentViewType : false;
			const isDefault = editor.id === defaultRule.editor.id;
			quickPickEntries.push({
				id: editor.id,
				label: editor.label,
				description: isActive && isDefault ? currentDefaultAndActiveLabel : isActive ? currentlyActiveLabel : isDefault ? currentDefaultLabel : undefined,
				detail: editor.detail ?? editor.priority.editor,
			});
		}
		if (!showDefaultPicker && extname(resource) !== '') {
			const separator: IQuickPickSeparator = { type: 'separator' };
			quickPickEntries.push(separator);
			const editorDefault = this.editorResolverService.getEditorMatches(resource).defaultRule;
			quickPickEntries.push({
				id: OpenWithEditorPicker.configureDefaultID,
				label: localize('promptOpenWith.configureDefault', "Configure default editor for '{0}'...", editorDefault.associationPattern),
			});
			// For diffs, additionally offer to configure a diff-only default so the choice does not
			// affect how the resource opens as a normal editor (writes to `diffEditorAssociations`).
			if (isDiffEditor) {
				const diffEditorDefault = this.editorResolverService.getEditorMatches(resource, { isDiffEditor: true }).defaultRule;
				quickPickEntries.push({
					id: OpenWithEditorPicker.configureDefaultDiffID,
					label: localize('promptOpenWith.configureDefaultDiff', "Configure default editor (diff only) for '{0}'...", diffEditorDefault.associationPattern),
				});
			}
		}
		return quickPickEntries;
	}
}

/**
 * Internal command used by the {@link IEditorResolverService} when a resource has conflicting
 * default editors: asks the user for a new default editor and replaces `currentEditor` with it.
 */
export const CONFIGURE_DEFAULT_EDITOR_COMMAND_ID = '_workbench.editor.configureDefaultEditor';

CommandsRegistry.registerCommand(CONFIGURE_DEFAULT_EDITOR_COMMAND_ID, async (accessor, untypedEditor: IUntypedEditorInput, currentEditor: EditorInput, groupId: GroupIdentifier) => {
	const editorResolverService = accessor.get(IEditorResolverService);
	const editorGroupsService = accessor.get(IEditorGroupsService);

	const picked = await accessor.get(IInstantiationService).createInstance(OpenWithEditorPicker).pick(untypedEditor, { configureDefault: true });
	const group = editorGroupsService.getGroup(groupId);
	if (!picked || !group) {
		return;
	}

	const replacementEditor = await editorResolverService.resolveEditor({ ...untypedEditor, options: picked }, group);
	if (!isEditorInputWithOptionsAndGroup(replacementEditor)) {
		return;
	}

	// Replace the current editor with the picked one
	await group.replaceEditors([{
		editor: currentEditor,
		replacement: replacementEditor.editor,
		options: replacementEditor.options ?? picked
	}]);
});
