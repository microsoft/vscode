/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, IDiscoveredDevContainer } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { RemotesEditorInput } from '../browser/remotesEditorInput.js';
import { RemotesModel } from '../browser/remotesModel.js';
import { RemotesWidget } from '../browser/remotesWidget.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../chat/common/constants.js';

export const RemotesEditorFocusedContext = new RawContextKey<boolean>('remotesEditorFocused', false);

export class RemotesEditor extends EditorPane {
	static readonly ID = 'sessions.editor.remotes';

	private container: HTMLElement | undefined;
	private content: HTMLElement | undefined;
	private disabledMessage: HTMLElement | undefined;
	private scopedContext: IScopedContextKeyService | undefined;
	private widgetInstantiationService: IInstantiationService | undefined;
	private readonly widget = this._register(new MutableDisposable<RemotesWidget>());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService,
	) {
		super(RemotesEditor.ID, group, telemetryService, themeService, storageService);
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || event.affectsConfiguration('chat.disableAIFeatures') || event.affectsConfiguration(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING) || event.affectsConfiguration(ENVIRONMENT_PICKER_SETTING)) {
				this.updateWidget();
			}
		}));
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this.scopedContext;
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, dom.$('.remotes-editor'));
		this.content = dom.append(this.container, dom.$('.remotes-editor-content'));
		this.disabledMessage = dom.append(this.container, dom.$('p.remotes-editor-disabled', { role: 'status', tabindex: '0' }));
		this.disabledMessage.textContent = localize('remotes.editorDisabled', "Remote agent hosts are disabled.");
		this.disabledMessage.hidden = true;
		this.scopedContext = this._register(this.contextKeyService.createScoped(this.container));
		RemotesEditorFocusedContext.bindTo(this.scopedContext).set(true);
		this.widgetInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContext])));
	}

	override async setInput(input: RemotesEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested) {
			this.updateWidget();
		}
	}

	protected override setEditorVisible(visible: boolean): void {
		this.widget.value?.setVisible(visible);
	}

	override clearInput(): void {
		this.widget.clear();
		super.clearInput();
	}

	private updateWidget(): void {
		if (!this.content || !this.disabledMessage || !this.widgetInstantiationService || !this.input) {
			return;
		}
		const managementEnabled = this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
		const environmentPickerEnabled = this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING);
		const enabled = managementEnabled && environmentPickerEnabled && this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
			&& !this.configurationService.getValue<boolean>('chat.disableAIFeatures');
		this.disabledMessage.textContent = managementEnabled
			? environmentPickerEnabled ? localize('remotes.editorDisabled', "Remote agent hosts are disabled.")
				: localize('remotes.environmentPickerDisabled', "The Environment picker is disabled.")
			: localize('remotes.managementDisabled', "Remote Environments management is disabled.");
		this.disabledMessage.hidden = enabled;
		this.content.hidden = !enabled;
		if (!enabled) {
			this.widget.clear();
			return;
		}
		if (!this.widget.value) {
			const channel = this.sharedProcessService.getChannel(DEV_CONTAINER_AGENT_HOST_CHANNEL);
			const model = this.widgetInstantiationService.createInstance(RemotesModel, token => channel.call<readonly IDiscoveredDevContainer[]>('listDevContainers', undefined, token));
			this.widget.value = this.widgetInstantiationService.createInstance(RemotesWidget, this.content, model, OS);
		}
		this.widget.value.setVisible(this.isVisible());
		this.widget.value.layout();
	}

	getAccessibilityContent(): string {
		return this.widget.value?.getAccessibilityContent() ?? this.disabledMessage?.textContent ?? '';
	}

	override focus(): void {
		super.focus();
		if (this.widget.value) {
			this.widget.value.focus();
		} else {
			this.disabledMessage?.focus();
		}
	}

	layout(dimension: dom.Dimension): void {
		if (this.container) {
			dom.size(this.container, dimension.width, dimension.height);
			this.widget.value?.layout();
		}
	}
}
