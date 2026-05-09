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
import { agentHostSettingsUri, AGENT_HOST_SETTINGS_SCHEME, AgentHostSettingsFileSystemProvider, AgentHostSettingsSchemaRegistrar } from './agentHostSettingsFileSystemProvider.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';

/**
 * Registers the {@link AgentHostSettingsFileSystemProvider} with the
 * {@link IFileService} and contributes the "Open Host Settings" action.
 */
class AgentHostSettingsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostSettingsContribution';

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

registerAction2(class OpenHostSettingsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.openHostSettings',
			title: localize2('openHostSettings', "Open Host Settings"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '2_settings',
				order: 2,
				when: ContextKeyExpr.regex(ChatSessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}]
		});
	}
	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (!session) {
			return;
		}
		const editorService = accessor.get(IEditorService);
		const resource = agentHostSettingsUri(session.providerId);
		await editorService.openEditor({ resource, options: { pinned: true } });
	}
});
