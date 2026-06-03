/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IAutomationSessionTypeChoice, IAutomationSessionTypeProvider } from '../../../../workbench/contrib/chat/common/automations/automationSessionTypes.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

/**
 * Sessions-layer implementation of {@link IAutomationSessionTypeProvider}.
 * Wraps {@link ISessionsManagementService.getSessionTypesForFolder} to
 * expose the live session-type list to the Automations create/edit
 * dialog without forcing the workbench-side UI to depend on the
 * Sessions layer directly.
 *
 * When more than one provider can serve the same session type id for a
 * folder (e.g. two remote agent hosts both offering Copilot CLI) the
 * provider label is surfaced as a description so the user can tell
 * them apart in the dropdown.
 */
export class SessionsAutomationSessionTypeProvider implements IAutomationSessionTypeProvider {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) { }

	getSessionTypesForFolder(folderUri: URI): readonly IAutomationSessionTypeChoice[] {
		const provided = this.sessionsManagementService.getSessionTypesForFolder(folderUri);
		const providersForType = new Map<string, number>();
		for (const entry of provided) {
			providersForType.set(entry.sessionType.id, (providersForType.get(entry.sessionType.id) ?? 0) + 1);
		}
		const providers = this.sessionsProvidersService.getProviders();
		const providerLabel = (id: string): string | undefined => providers.find(p => p.id === id)?.label;
		return provided.map(entry => {
			const needsDescription = (providersForType.get(entry.sessionType.id) ?? 0) > 1;
			return {
				providerId: entry.providerId,
				sessionTypeId: entry.sessionType.id,
				label: entry.sessionType.label,
				description: needsDescription ? providerLabel(entry.providerId) : undefined,
			};
		});
	}
}
