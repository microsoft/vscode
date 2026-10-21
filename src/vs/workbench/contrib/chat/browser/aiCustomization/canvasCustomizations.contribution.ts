/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICanvasCustomizationService } from '../../common/canvasCustomizations.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';
import { CanvasListWidget } from './canvasListWidget.js';
import { MockCanvasCustomizationService } from './mockCanvasCustomizationService.js';

// PROTOTYPE: Replace with an Agent Host-backed ICanvasCustomizationService.
registerSingleton(ICanvasCustomizationService, MockCanvasCustomizationService, InstantiationType.Delayed);

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Canvases,
	label: localize('canvasesSection', "Canvases"),
	icon: Codicon.preview,
	description: localize('canvasesSectionDescription', "Interactive panels that Copilot Extensions can open beside a chat."),
	enablementSettings: [CanvasesEnabledSettingId],
	supportsHarness: harnessId => harnessId === SessionType.AgentHostCopilot,
	itemCount: accessor => accessor.get(ICanvasCustomizationService).rows.map(rows => rows.length),
	create: (instantiationService, container) => instantiationService.createInstance(CanvasListWidget, container),
});
