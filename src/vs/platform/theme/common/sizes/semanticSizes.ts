/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';
import { cornerRadiusLarge, cornerRadiusSmall, spacingSize40 } from './baseSizes.js';

const cornerRadiusCustomization = { minimum: 0, maximum: 8 };

export const controlsCornerRadius = registerSize('controls.cornerRadius', cornerRadiusSmall,
	localize('controls.cornerRadius', "Shared corner radius for standard buttons, toolbar actions, text inputs, selects, checkboxes, toggles, and radio controls in editor and Agents windows. Individual button and input values override this value. Does not change tabs, circular or pill-shaped controls, or hit areas."), undefined, cornerRadiusCustomization);

export const buttonsCornerRadius = registerSize('buttons.cornerRadius', controlsCornerRadius,
	localize('buttons.cornerRadius', "Corner radius for standard text buttons, toolbar and icon actions, and split buttons. Joined button edges stay square. Inherits controls.cornerRadius unless overridden; circular and pill-shaped buttons are unchanged."), undefined, cornerRadiusCustomization);

export const inputsCornerRadius = registerSize('inputs.cornerRadius', controlsCornerRadius,
	localize('inputs.cornerRadius', "Corner radius for standard text inputs, find inputs, and select controls. Does not change the chat composer. Inherits controls.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const popupsCornerRadius = registerSize('popups.cornerRadius', cornerRadiusLarge,
	localize('popups.cornerRadius', "Shared corner radius for custom menus, hovers, dialogs, and the Command Palette in editor and Agents windows, and for Modern UI editor pop-ups. Individual menu, hover, and dialog values override this value. Native operating system surfaces and notifications are unchanged."), undefined, cornerRadiusCustomization);

export const menusCornerRadius = registerSize('menus.cornerRadius', popupsCornerRadius,
	localize('menus.cornerRadius', "Corner radius for custom context menus, action pickers, and select-option pop-ups, including their backgrounds and clipping. Native menus are unchanged. Inherits popups.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const hoversCornerRadius = registerSize('hovers.cornerRadius', popupsCornerRadius,
	localize('hovers.cornerRadius', "Corner radius for editor and workbench hovers and tooltips. Inherits popups.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const dialogsCornerRadius = registerSize('dialogs.cornerRadius', popupsCornerRadius,
	localize('dialogs.cornerRadius', "Corner radius for custom dialogs inside editor and Agents windows. Native operating system dialogs are unchanged. Inherits popups.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

export const defaultCornerRadius = registerSize('default.cornerRadius', cornerRadiusLarge,
	localize('default.cornerRadius', "Default corner radius for panel areas, in pixels. More specific sizes override this value. Controls, pop-ups, and the app window corners are unchanged."), undefined, cornerRadiusCustomization);

export const panelsCornerRadius = registerSize('panels.cornerRadius', defaultCornerRadius,
	localize('panels.cornerRadius', "Shared corner radius for side bars, the editor area, the tools panel, and Agents chat areas and pages. Inherits default.cornerRadius unless overridden. Individual areas can override this value."), undefined, cornerRadiusCustomization);

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

export const pagesCornerRadius = registerSize('pages.cornerRadius', agentsPanelsCornerRadius,
	localize('pages.cornerRadius', "Corner radius for pages such as Automations that open in place of chats in the Agents window. Inherits agentsWindow.panels.cornerRadius unless overridden."), undefined, cornerRadiusCustomization);

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
