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
import { IAgentSession, IMarshalledAgentSessionContext, isAgentSession, isMarshalledAgentSessionContext } from '../agentSessionsModel.js';
import { agentSessionSettingsUri, AGENT_SESSION_SETTINGS_SCHEME, AgentSessionSettingsFileSystemProvider, AgentSessionSettingsSchemaRegistrar } from './agentSessionSettingsFileSystemProvider.js';
import { toAgentHostBackendSessionUri } from './agentHostSessionUri.js';

/**
 * Registers the {@link AgentSessionSettingsFileSystemProvider} with the
 * {@link IFileService} and contributes the context-menu-only "Open Session
 * Settings" action for the editor window. Desktop editor-window-only:
 * loading this from a shared chat entry point would register a second
 * `agent-session-settings` provider in the agent (sessions) window, which
 * owns its own provider-keyed per-session settings editor.
 */
class AgentSessionSettingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.agentSessionSettingsEditor';

	constructor(
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		const schemaRegistrar = this._register(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
		const provider = this._register(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));
		this._register(fileService.registerProvider(AGENT_SESSION_SETTINGS_SCHEME, provider));

		this._register(labelService.registerFormatter({
			scheme: AGENT_SESSION_SETTINGS_SCHEME,
			formatting: {
				label: localize('agentSessionSettings.label', "Session Settings"),
				separator: '/',
			},
		}));
	}
}

registerWorkbenchContribution2(AgentSessionSettingsContribution.ID, AgentSessionSettingsContribution, WorkbenchPhase.AfterRestored);

/** Matches local agent-host session types (e.g. `agent-host-copilotcli`), excluding `remote-*` targets which this ambient-only editor does not support. */
const LOCAL_AGENT_HOST_SESSION_TYPE_RE = /^agent-host-/;

const agentSessionSettingsPrecondition = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	AGENT_HOST_ENABLED_CONTEXT_KEY,
);

/**
 * Resolves the single selected session from the action's marshalled
 * agent-session context. Deliberately does not fall back to a
 * last-focused/active session; this action is context-menu-only and always
 * requires an explicit selection.
 */
function resolveSelectedSession(context: IAgentSession | IMarshalledAgentSessionContext | undefined): IAgentSession | undefined {
	if (isMarshalledAgentSessionContext(context)) {
		return context.session;
	}
	if (isAgentSession(context)) {
		return context;
	}
	return undefined;
}

registerAction2(class OpenAgentSessionSettingsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.openAgentSessionSettings',
			title: localize2('openAgentSessionSettings', "Open Session Settings"),
			menu: [{
				id: MenuId.AgentSessionsContext,
				group: '3_settings',
				order: 2,
				when: ContextKeyExpr.and(
					agentSessionSettingsPrecondition,
					ContextKeyExpr.regex(ChatContextKeys.agentSessionType.key, LOCAL_AGENT_HOST_SESSION_TYPE_RE),
				),
			}],
		});
	}

	async run(accessor: ServicesAccessor, context?: IAgentSession | IMarshalledAgentSessionContext): Promise<void> {
		const session = resolveSelectedSession(context);
		if (!session) {
			return;
		}
		const backendSession = toAgentHostBackendSessionUri(session.resource);
		if (!backendSession) {
			return;
		}
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: agentSessionSettingsUri(backendSession), options: { pinned: true } });
	}
});
