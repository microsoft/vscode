/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { EditorExtensions, IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { AUTOMATIONS_MODAL_SETTING, AutomationsEditorInput } from './automationsEditorInput.js';
import { AutomationCommands } from './automationCommands.js';
import { AutomationsModalWidget } from './automationsModalWidget.js';

const AutomationsEditorFocusedContext = new RawContextKey<boolean>('automationsEditorFocused', false);

export class AutomationsEditor extends EditorPane {
	static readonly ID = 'sessions.editor.automations';
	private container: HTMLElement | undefined;
	private scopedContext: IScopedContextKeyService | undefined;
	private widgetInstantiationService: IInstantiationService | undefined;
	private readonly widget = this._register(new MutableDisposable<AutomationsModalWidget>());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ILogService private readonly logService: ILogService,
	) {
		super(AutomationsEditor.ID, group, telemetryService, themeService, storageService);
		this._register(configurationService.onDidChangeConfiguration(event => {
			if ([AUTOMATIONS_MODAL_SETTING, CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAIDisabledSettingId].some(key => event.affectsConfiguration(key))) {
				this.updateWidget();
				if (!this.isEnabled() && this.input) {
					void this.editorService.closeEditor({ editor: this.input, groupId: this.group.id }).catch(error => {
						this.logService.error('[AutomationsEditor] Failed to close disabled modal', error);
					});
				}
			}
		}));
	}

	override get scopedContextKeyService(): IContextKeyService | undefined { return this.scopedContext; }

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, dom.$('.automations-modal-editor'));
		this.scopedContext = this._register(this.contextKeyService.createScoped(this.container));
		AutomationsEditorFocusedContext.bindTo(this.scopedContext).set(true);
		this.widgetInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContext])));
	}

	override async setInput(input: AutomationsEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested) {
			this.updateWidget();
		}
	}

	protected override setEditorVisible(visible: boolean): void {
		if (visible) {
			this.updateWidget();
		} else {
			this.widget.clear();
		}
	}

	override clearInput(): void {
		this.widget.clear();
		super.clearInput();
	}

	private updateWidget(): void {
		if (!this.container || !this.widgetInstantiationService || !this.input) {
			return;
		}
		if (!this.isEnabled() || !this.isVisible()) {
			this.widget.clear();
			return;
		}
		if (!this.widget.value) {
			this.widget.value = this.widgetInstantiationService.createInstance(AutomationsModalWidget, this.container, async () => {
				if (this.input) {
					await this.editorService.closeEditor({ editor: this.input, groupId: this.group.id });
				}
				await this.commandService.executeCommand(AutomationCommands.createWithAgent.id, { skipIntroduction: true });
			}, async resource => {
				if (this.input) {
					await this.editorService.closeEditor({ editor: this.input, groupId: this.group.id });
				}
				await this.sessionsService.openSession(resource, { preserveFocus: false, source: 'automation' });
			});
		}
		this.widget.value.layout();
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AUTOMATIONS_MODAL_SETTING) === true
			&& this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
			&& !this.configurationService.getValue<boolean>(ChatAIDisabledSettingId);
	}

	override focus(): void {
		super.focus();
		this.widget.value?.focus();
	}

	getAccessibilityContent(): string { return this.widget.value?.getAccessibilityContent() ?? ''; }

	layout(dimension: dom.Dimension): void {
		if (this.container) {
			dom.size(this.container, dimension.width, dimension.height);
			this.widget.value?.layout();
		}
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(AutomationsEditor, AutomationsEditor.ID, localize('automations.modal.name', "Automations")),
	[new SyncDescriptor(AutomationsEditorInput)],
);

class AutomationsModalAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'automations-modal';
	readonly when = AutomationsEditorFocusedContext;
	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AutomationsEditor)) {
			return undefined;
		}
		const focused = dom.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Automations,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('automations.modal.help.overview', "You are in the Automations modal. It uses the same provider-owned automations as the default view. Closing the modal does not stop automations."),
				localize('automations.modal.help.navigation', "Use Tab and Shift+Tab to reach categories, search, state filter, Sort By, creation controls, and the table. Use Down Arrow from Search to enter the table, then Up and Down Arrow to navigate. Enter opens the selected automation's details. Close Details returns focus to the table. Escape closes the modal and returns focus to its opener."),
				localize('automations.modal.help.actions', "Use Sort By to choose a column and sort direction. The On column contains enable checkboxes. Right-click a row or press Shift+F10 on the focused row to edit, run, enable, disable, or delete that automation. Edit opens the automation dialog with its saved values. Save applies your changes; Cancel or Escape leaves it unchanged and returns to the modal. Run requests execution from the automation's provider; Last run updates when the provider publishes progress. Delete asks for confirmation before removing the automation, its run history, and associated sessions. Escape dismisses the menu and returns focus to the table. Unavailable providers cannot be changed. Create with Agent starts a new draft. Create Manually opens a separate automation dialog; its dropdown offers Import Automation. Escape closes only the top dialog. View options offers Refresh cloud automations and, when available, Show automations created by others."),
				localize('automations.modal.help.history', "The details pane includes run history for only the selected automation. Tab into the sessions list, use Up and Down Arrow to navigate, and press Enter to open a run. Opening a run closes the modal and opens that exact session. History updates as providers publish runs and sessions become available. Loading and unavailable messages mean history may be incomplete. Closing details stops observing that history."),
				localize('automations.modal.help.historyPages', "History initially shows the ten most recent entries, plus sessions that are running or need input. Activate Show More to reveal twenty more entries and focus the first newly shown entry. No history is deleted."),
				localize('automations.modal.help.moreActions', "The row context menu also offers Open on GitHub, Duplicate, Export, and Remove end date when applicable. Run remains unavailable while its request is pending or waiting for history. At narrow widths, categories, catalogue and details are stacked vertically; scroll to reach details."),
				localize('automations.modal.help.scope', "The default Automations view also offers history across all automations and templates. Turn off chat.automations.modal to return to that view."),
			].join('\n') : editor.getAccessibilityContent(),
			() => { if (dom.isHTMLElement(focused) && focused.isConnected) { focused.focus(); } else { editor.focus(); } },
			AccessibilityVerbositySettingId.Automations,
		);
	}
}

AccessibleViewRegistry.register(new AutomationsModalAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new AutomationsModalAccessibleView(AccessibleViewType.View));
