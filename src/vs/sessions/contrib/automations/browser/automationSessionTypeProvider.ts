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
 * Decouples the workbench UI from the Sessions layer.
 * When multiple providers offer the same session type for a folder, adds a
 * provider label as description so the user can tell them apart.
 */
export class AutomationSessionTypeProvider implements IAutomationSessionTypeProvider {

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
