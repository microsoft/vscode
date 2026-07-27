/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { agentHostSettingsUri, AGENT_HOST_SETTINGS_SCHEME, AgentHostSettingsFileSystemProvider, AgentHostSettingsSchemaRegistrar } from './agentHostSettingsFileSystemProvider.js';

/**
 * Registers the {@link AgentHostSettingsFileSystemProvider} with the
 * {@link IFileService} and contributes the "Open Host Settings" action for
 * the editor window. Desktop editor-window-only: loading this from a shared
 * chat entry point would register a second `agent-host-settings` provider in
 * the agent (sessions) window, which owns its own provider-keyed editors.
 */
class AgentHostSettingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.agentHostSettingsEditor';

	constructor(
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		const schemaRegistrar = this._register(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
		const provider = this._register(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));
		this._register(fileService.registerProvider(AGENT_HOST_SETTINGS_SCHEME, provider));

		this._register(labelService.registerFormatter({
			scheme: AGENT_HOST_SETTINGS_SCHEME,
			formatting: {
				label: localize('agentHostSettings.label', "Host Settings"),
				separator: '/',
			},
		}));
	}
}

registerWorkbenchContribution2(AgentHostSettingsContribution.ID, AgentHostSettingsContribution, WorkbenchPhase.AfterRestored);

/** Matches local agent-host session types (e.g. `agent-host-copilotcli`), excluding `remote-*` targets which this ambient-only command does not support. */
const LOCAL_AGENT_HOST_SESSION_TYPE_RE = /^agent-host-/;

const agentHostSettingsPrecondition = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	AGENT_HOST_ENABLED_CONTEXT_KEY,
);

registerAction2(class OpenAgentHostSettingsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.openAgentHostSettings',
			title: localize2('openAgentHostSettings', "Open Host Settings"),
			f1: true,
			precondition: agentHostSettingsPrecondition,
			menu: [{
				id: MenuId.AgentSessionsContext,
				group: '3_settings',
				order: 1,
				when: ContextKeyExpr.and(
					agentHostSettingsPrecondition,
					ContextKeyExpr.regex(ChatContextKeys.agentSessionType.key, LOCAL_AGENT_HOST_SESSION_TYPE_RE),
				),
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: agentHostSettingsUri(), options: { pinned: true } });
	}
});
