/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, isAncestor } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPartEmbeddedContext, IsAuxiliaryWindowContext } from '../../../common/contextkeys.js';
import { ICreateEditorPartOptions, IEditorGroup, IEmbeddedEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IEditorGroupView, IEditorGroupViewOptions, IEditorPartsView } from './editor.js';
import { IEditorPartUIState } from './editorPart.js';
import { OwnedEditorPart } from './ownedEditorPart.js';

export interface ICreateEmbeddedEditorPartResult {
	readonly part: EmbeddedEditorPart;
	readonly instantiationService: IInstantiationService;
	readonly disposables: DisposableStore;
}

/**
 * Creates {@link EmbeddedEditorPart}s that render into a container
 * provided by their owner.
 */
export class EmbeddedEditorPartFactory {

	constructor(
		private readonly editorPartsView: IEditorPartsView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService
	) { }

	create(options: ICreateEditorPartOptions): ICreateEmbeddedEditorPartResult {
		const disposables = new DisposableStore();
		const container = options.container as HTMLElement;

		const partInstantiationService = options.services ? disposables.add(this.instantiationService.createChild(options.services)) : this.instantiationService;
		const part = disposables.add(partInstantiationService.createInstance(EmbeddedEditorPart, getWindow(container).vscodeWindowId, this.editorPartsView, options));
		disposables.add(this.editorPartsView.registerPart(part));
		part.create(container);

		const instantiationService = disposables.add(part.scopedInstantiationService.createChild(new ServiceCollection(
			[IEditorService, this.editorService.createScoped(part, disposables)]
		)));

		// The owner closes the part; the part then releases everything registered for it
		disposables.add(Event.once(part.onWillClose)(() => disposables.dispose()));

		return { part, instantiationService, disposables };
	}
}

export class EmbeddedEditorPart extends OwnedEditorPart implements IEmbeddedEditorPart {

	private static COUNTER = 1;

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		private readonly createOptions: ICreateEditorPartOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		const id = EmbeddedEditorPart.COUNTER++;
		super(editorPartsView, `workbench.parts.embeddedEditor.${id}`, createOptions.label ?? localize('embeddedEditorPart', "Editor"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
	}

	get isPrimary(): boolean {
		return !!this.createOptions.primary;
	}

	override get isTransient(): boolean {
		return true;
	}

	override create(parent: HTMLElement, options?: object): void {
		super.create(parent, options);

		parent.setAttribute('role', 'region');
		parent.setAttribute('aria-label', this.createOptions.label ?? localize('embeddedEditorPart', "Editor"));
	}

	protected override handleContextKeys(): void {
		if (this.windowId !== mainWindow.vscodeWindowId) {
			IsAuxiliaryWindowContext.bindTo(this.scopedContextKeyService).set(true);
		}
		// Its owner lays out its groups and owns its editors: their groups are not locked or closed by the user, nor their
		// editors moved out of it into a window of their own.
		EditorPartEmbeddedContext.bindTo(this.scopedContextKeyService).set(true);

		super.handleContextKeys();
	}

	redirectEditor(editor: EditorInput, group: IEditorGroupView): IEditorGroup | undefined {
		const target = this.createOptions.redirectEditor?.(editor);
		if (!target || this.groups.some(candidate => candidate === target)) {
			return undefined;
		}

		// A group created for the editor, such as to the side of a group of the part or by a drop that splits one, does
		// not stay without editors: it goes once the editor opened in the other group, which takes its focus.
		if (group.isEmpty && this.count > 1) {
			queueMicrotask(() => {
				if (group.isEmpty && this.count > 1 && this.groups.includes(group)) {
					const hadFocus = isAncestor(group.element.ownerDocument.activeElement, group.element);
					this.removeGroup(group, true);
					if (hadFocus) {
						target.focus();
					}
				}
			});
		}

		return target;
	}

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {
		if (this.count === 1) {
			// Its owner closes it: emptied, such as by closing all editors with empty groups closing, its last group stays.
			return;
		}

		super.removeGroup(group, preserveFocus);
	}

	protected override getGroupViewOptions(): IEditorGroupViewOptions | undefined {
		return this.createOptions.groupViewOptions as IEditorGroupViewOptions | undefined;
	}

	protected override loadState(): IEditorPartUIState | undefined {
		return this.createOptions.state as IEditorPartUIState | undefined;
	}
}
