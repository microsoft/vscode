/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { isCopilotCliSessionType } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';
import { CopilotCanvasesWidget } from './copilotCustomizationsWidget.js';

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Canvases,
	label: localize('copilotCanvases.sectionLabel', "Canvases"),
	icon: Codicon.preview,
	description: localize('copilotCanvases.sectionDescription', "Review canvases registered for visible Copilot chats."),
	enablementSettings: [CanvasesEnabledSettingId],
	supportsHarness: isCopilotCliSessionType,
	create: (instantiationService, container) => instantiationService.createInstance(CopilotCanvasesWidget, container),
});
