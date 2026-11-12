/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';
import { cornerRadiusLarge, spacingSize40 } from './baseSizes.js';

const cornerRadiusCustomization = { minimum: 0, maximum: 8 };

export const panelsCornerRadius = registerSize('panels.cornerRadius', cornerRadiusLarge,
	localize('panels.cornerRadius', "Shared corner radius for side bars, the editor area, the tools panel, and Agents chat areas and pages. Individual areas can override this value. Controls, pop-ups, and the app window corners are unchanged."), undefined, cornerRadiusCustomization);

export const agentsPanelsCornerRadius = registerSize('agentsWindow.panels.cornerRadius', panelsCornerRadius,
	localize('agentsWindow.panels.cornerRadius', "Shared corner radius for panel areas in the Agents window only. Inherits panels.cornerRadius unless overridden. Individual Agents areas can override this value."), undefined, cornerRadiusCustomization);

export const toolsPanelCornerRadius = registerSize('toolsPanel.cornerRadius', panelsCornerRadius,
	localize('toolsPanel.cornerRadius', "Corner radius for the panel containing Terminal, Output, Problems, and Debug Console, wherever it is positioned. Inherits panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const primarySideBarCornerRadius = registerSize('primarySideBar.cornerRadius', panelsCornerRadius,
	localize('primarySideBar.cornerRadius', "Corner radius for the editor window's Primary Side Bar, where Explorer, Search, and Source Control normally appear. Inherits panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const secondarySideBarCornerRadius = registerSize('secondarySideBar.cornerRadius', panelsCornerRadius,
	localize('secondarySideBar.cornerRadius', "Corner radius for the editor window's Secondary Side Bar, often used for Chat. Inherits panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const editorAreaCornerRadius = registerSize('editorArea.cornerRadius', panelsCornerRadius,
	localize('editorArea.cornerRadius', "Corner radius for the area containing file editors and their tabs. Does not change individual tab corners. Inherits panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const activityBarCornerRadius = registerSize('activityBar.cornerRadius', primarySideBarCornerRadius,
	localize('activityBar.cornerRadius', "Corner radius for the Activity Bar containing the Explorer, Search, and Source Control icons. Does not change the icons or their buttons. Inherits primarySideBar.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const agentsChatPanelsCornerRadius = registerSize('agentsWindow.chatPanels.cornerRadius', agentsPanelsCornerRadius,
	localize('agentsWindow.chatPanels.cornerRadius', "Corner radius of the outer panel frames containing conversations in the Agents window. Does not change individual messages, message bubbles, or the chat input. This does not affect the Chat side bar in the editor window; customize that side bar instead. Inherits agentsWindow.panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const agentsEditorAreaCornerRadius = registerSize('agentsWindow.editorArea.cornerRadius', agentsPanelsCornerRadius,
	localize('agentsWindow.editorArea.cornerRadius', "Corner radius for the file editor area in the Agents window only. Inherits agentsWindow.panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const agentsToolsPanelCornerRadius = registerSize('agentsWindow.toolsPanel.cornerRadius', agentsPanelsCornerRadius,
	localize('agentsWindow.toolsPanel.cornerRadius', "Corner radius for the Terminal, Output, Problems, and Debug Console panel in the Agents window only. Inherits agentsWindow.panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const agentsSecondarySideBarCornerRadius = registerSize('agentsWindow.secondarySideBar.cornerRadius', agentsPanelsCornerRadius,
	localize('agentsWindow.secondarySideBar.cornerRadius', "Corner radius for Files, Changes, and other side views in the Agents window only. Inherits agentsWindow.panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

const panelSpacingCustomization = { minimum: 0, maximum: 16 };

export const panelsSpacing = registerSize('panels.spacing', spacingSize40,
	localize('panels.spacing', "Space between panel areas in pixels, from 0 to 16. Applies to Modern UI editor windows and, unless overridden, the Agents window. Window-edge gutters and spacing inside controls are unchanged. Compact layouts remain gapless."), undefined, panelSpacingCustomization);

export const agentsPanelsSpacing = registerSize('agentsWindow.panels.spacing', panelsSpacing,
	localize('agentsWindow.panels.spacing', "Space between panel areas and between split chats in the Agents window only, in pixels from 0 to 16. Inherits panels.spacing unless overridden. Compact and phone layouts remain gapless; window-edge gutters are unchanged."), undefined, panelSpacingCustomization);
