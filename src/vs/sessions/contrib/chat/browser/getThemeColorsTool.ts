/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Color } from '../../../../base/common/color.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { descriptionForeground, focusBorder, foreground, textLinkForeground } from '../../../../platform/theme/common/colors/baseColors.js';
import { editorBackground, editorForeground } from '../../../../platform/theme/common/colors/editorColors.js';
import { buttonBackground, buttonForeground } from '../../../../platform/theme/common/colors/inputColors.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SIDE_BAR_FOREGROUND } from '../../../../workbench/common/theme.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsBackground, agentsChatInputBackground, agentsChatInputBorder, agentsChatInputFocusBorder, agentsChatInputForeground, agentsPanelBorder } from '../../../common/theme.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../common/constants.js';

export const GetThemeColorsToolId = 'vscode_getThemeColors';

const themeColorRoles = {
	windowBackground: agentsBackground,
	windowForeground: foreground,
	chatBackground: activeSessionViewBackground,
	chatForeground: activeSessionViewForeground,
	sidebarBackground: agentsBackground,
	sidebarForeground: SIDE_BAR_FOREGROUND,
	editorBackground,
	editorForeground,
	inputBackground: agentsChatInputBackground,
	inputForeground: agentsChatInputForeground,
	secondaryForeground: descriptionForeground,
	linkForeground: textLinkForeground,
	accent: buttonBackground,
	accentForeground: buttonForeground,
	border: agentsPanelBorder,
	focusBorder,
	inputBorder: agentsChatInputBorder,
	inputFocusBorder: agentsChatInputFocusBorder,
};

export class GetThemeColorsTool implements IToolImpl {

	constructor(
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	getToolData(): IToolData {
		return {
			id: GetThemeColorsToolId,
			toolReferenceName: 'getThemeColors',
			displayName: localize('getThemeColors.displayName', "Get Theme Colors"),
			userDescription: localize('getThemeColors.userDescription', "Read the current theme's prominent colors in the Agents window"),
			modelDescription: 'Read the current theme name, color scheme, and prominent colors in the Agents window. Use before generating or choosing a background or other visual content when matching the surrounding interface matters, or when the user asks about the current palette. Read-only: does not change the theme, background, or settings. Returns a snapshot of window, active chat, sidebar, editor, and input backgrounds and foregrounds, plus secondary text, links, accent, borders, and focus indicators. Each role includes its theme token ID and resolved CSS color, including user overrides and window tinting. Values preserve transparency; null means unavailable. These are theme tokens, not sampled background-image pixels or final composited colors of translucent surfaces and gradients. The palette is context, not a restriction on the user\'s requested style or colors. Read again if the appearance changes; no polling is needed.',
			source: ToolDataSource.Internal,
			icon: Codicon.symbolColor,
			when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}`, true)),
			runsInWorkspace: false,
			canBeReferencedInPrompt: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: {
				type: 'object',
				properties: {},
				additionalProperties: false,
			},
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('getThemeColors.invocation', "Reading the current theme colors"),
			pastTenseMessage: localize('getThemeColors.past', "Read the current theme colors"),
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.configurationService.getValue<boolean>(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING) !== true) {
			throw new Error(localize('getThemeColors.disabled', "Appearance tools are disabled by {0}.", AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING));
		}
		const theme = this.themeService.getColorTheme();
		const result = {
			theme: { name: theme.label, colorScheme: theme.type, isHighContrast: isHighContrast(theme.type) },
			colors: Object.fromEntries(Object.entries(themeColorRoles).map(([role, id]) => {
				const color = theme.getColor(id);
				return [role, { id, value: color ? Color.Format.CSS.formatHexA(color, true) : null }];
			})),
		};
		return {
			content: [{ kind: 'text', value: JSON.stringify(result) }],
			toolResultMessage: localize('getThemeColors.result', "Read the current theme colors"),
		};
	}
}

export class GetThemeColorsToolContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.getThemeColorsTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const tool = instantiationService.createInstance(GetThemeColorsTool);
		const enabled = observableConfigValue(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, true, configurationService);
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(toolsService.registerTool(tool.getToolData(), tool));
			}
		}));
	}
}
