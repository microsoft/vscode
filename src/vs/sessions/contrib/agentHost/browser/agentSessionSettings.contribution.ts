/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatSessionProviderIdContext } from '../../../common/contextkeys.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { SessionItemContextMenuId } from '../../sessions/browser/views/sessionsList.js';
import { agentSessionSettingsUri, AGENT_SESSION_SETTINGS_SCHEME, AgentSessionSettingsFileSystemProvider, AgentSessionSettingsSchemaRegistrar } from './agentSessionSettingsFileSystemProvider.js';

/**
 * Registers the {@link AgentSessionSettingsFileSystemProvider} with the
 * {@link IFileService} and contributes the "Open Session Settings" action.
 */
class AgentSessionSettingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentSessionSettingsContribution';

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

registerAction2(class OpenSessionSettingsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.openSessionSettings',
			title: localize2('openSessionSettings', "Open Session Settings"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '2_settings',
				order: 1,
				when: ContextKeyExpr.regex(ChatSessionProviderIdContext.key, /^(local-agent-host|agenthost-)/),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session) {
			return;
		}
		const editorService = accessor.get(IEditorService);
		const resource = agentSessionSettingsUri(session);
		await editorService.openEditor({ resource, options: { pinned: true } });
	}
});
