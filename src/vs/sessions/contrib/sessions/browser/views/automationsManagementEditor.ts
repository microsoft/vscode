/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorPaneRegistry } from '../../../../../workbench/browser/editor.js';
import { EditorExtensions, EditorInputCapabilities, IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { CHAT_AUTOMATIONS_LAYOUT_SETTING, toAutomationsLayout } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID, AUTOMATIONS_MANAGEMENT_EDITOR_INPUT_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { AutomationsLayoutWidget } from './automationsLayoutWidget.js';
import { AutomationBlueprintDropTarget, AutomationsHistoryWidget } from './automationsView.js';

/** The singleton input of the modal Automations editor, used by the experimental `modal` layout. */
export class AutomationsManagementEditorInput extends EditorInput implements IModalEditorOptionsProvider {

	static readonly ID = AUTOMATIONS_MANAGEMENT_EDITOR_INPUT_ID;

	private static instance: AutomationsManagementEditorInput | undefined;

	static getOrCreate(): AutomationsManagementEditorInput {
		if (!AutomationsManagementEditorInput.instance || AutomationsManagementEditorInput.instance.isDisposed()) {
			AutomationsManagementEditorInput.instance = new AutomationsManagementEditorInput();
		}
		return AutomationsManagementEditorInput.instance;
	}

	readonly resource = undefined;

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override get typeId(): string {
		return AutomationsManagementEditorInput.ID;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof AutomationsManagementEditorInput;
	}

	override getName(): string {
		return localize('automationsManagementEditorName', "Automations");
	}

	override getIcon(): ThemeIcon {
		return Codicon.calendar;
	}

	getModalEditorOptions(): IModalEditorOptions {
		return { compactHeader: true, canMoveToEditorArea: false };
	}

	override async resolve(): Promise<null> {
		return null;
	}
}

export class AutomationsManagementEditor extends EditorPane {

	static readonly ID = 'workbench.editor.sessions.automationsManagement';

	private widget: AutomationsLayoutWidget | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(AutomationsManagementEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const container = DOM.append(parent, DOM.$('.automations-management-editor'));
		this.widget = this._register(this.instantiationService.createInstance(AutomationsLayoutWidget, {
			variant: 'modal',
			close: () => this.close(),
			createHistory: options => this.instantiationService.createInstance(AutomationsHistoryWidget, options),
			registerDropTarget: element => this.instantiationService.createInstance(AutomationBlueprintDropTarget, element),
		}));
		container.appendChild(this.widget.element);
	}

	override layout(dimension: DOM.Dimension): void {
		this.widget?.layout(dimension.width, dimension.height);
	}

	override focus(): void {
		super.focus();
		this.widget?.focus();
	}

	private async close(): Promise<void> {
		if (this.input) {
			await this.group.closeEditor(this.input);
		}
	}
}

/** Opens Automations where the `chat.automations.layout` setting puts them: the modal, or the page. */
export async function openAutomations(configurationService: IConfigurationService, editorService: IEditorService, customViewService: ICustomViewService): Promise<void> {
	if (toAutomationsLayout(configurationService.getValue(CHAT_AUTOMATIONS_LAYOUT_SETTING)) === 'modal') {
		const input = AutomationsManagementEditorInput.getOrCreate();
		// The isolated mobile entry keeps the baseline page and does not register this editor.
		if (Registry.as<IEditorPaneRegistry | null>(EditorExtensions.EditorPane)?.getEditorPane(input)) {
			await editorService.openEditor(input, { pinned: true });
			return;
		}
	}
	customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
}
