/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerColor, foreground, editorInfoForeground, editorWarningForeground, errorForeground, badgeBackground, badgeForeground, listDeemphasizedForeground, contrastBorder, inputBorder, toolbarHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Color } from '../../../../base/common/color.js';
import { localize } from '../../../../nls.js';
import * as icons from './debugIcons.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
export const debugToolBarBackground = registerColor('debugToolBar.background', {
    dark: '#333333',
    light: '#F3F3F3',
    hcDark: '#000000',
    hcLight: '#FFFFFF'
}, localize('debugToolBarBackground', "Debug toolbar background color."));
export const debugToolBarBorder = registerColor('debugToolBar.border', null, localize('debugToolBarBorder', "Debug toolbar border color."));
export const debugIconStartForeground = registerColor('debugIcon.startForeground', {
    dark: '#89D185',
    light: '#388A34',
    hcDark: '#89D185',
    hcLight: '#388A34'
}, localize('debugIcon.startForeground', "Debug toolbar icon for start debugging."));
export function registerColors() {
    const debugTokenExpressionName = registerColor('debugTokenExpression.name', { dark: '#c586c0', light: '#9b46b0', hcDark: foreground, hcLight: foreground }, 'Foreground color for the token names shown in the debug views (ie. the Variables or Watch view).');
    const debugTokenExpressionType = registerColor('debugTokenExpression.type', { dark: '#4A90E2', light: '#4A90E2', hcDark: foreground, hcLight: foreground }, 'Foreground color for the token types shown in the debug views (ie. the Variables or Watch view).');
    const debugTokenExpressionValue = registerColor('debugTokenExpression.value', { dark: '#cccccc99', light: '#6c6c6ccc', hcDark: foreground, hcLight: foreground }, 'Foreground color for the token values shown in the debug views (ie. the Variables or Watch view).');
    const debugTokenExpressionString = registerColor('debugTokenExpression.string', { dark: '#ce9178', light: '#a31515', hcDark: '#f48771', hcLight: '#a31515' }, 'Foreground color for strings in the debug views (ie. the Variables or Watch view).');
    const debugTokenExpressionBoolean = registerColor('debugTokenExpression.boolean', { dark: '#4e94ce', light: '#0000ff', hcDark: '#75bdfe', hcLight: '#0000ff' }, 'Foreground color for booleans in the debug views (ie. the Variables or Watch view).');
    const debugTokenExpressionNumber = registerColor('debugTokenExpression.number', { dark: '#b5cea8', light: '#098658', hcDark: '#89d185', hcLight: '#098658' }, 'Foreground color for numbers in the debug views (ie. the Variables or Watch view).');
    const debugTokenExpressionError = registerColor('debugTokenExpression.error', { dark: '#f48771', light: '#e51400', hcDark: '#f48771', hcLight: '#e51400' }, 'Foreground color for expression errors in the debug views (ie. the Variables or Watch view) and for error logs shown in the debug console.');
    const debugViewExceptionLabelForeground = registerColor('debugView.exceptionLabelForeground', { dark: foreground, light: '#FFF', hcDark: foreground, hcLight: foreground }, 'Foreground color for a label shown in the CALL STACK view when the debugger breaks on an exception.');
    const debugViewExceptionLabelBackground = registerColor('debugView.exceptionLabelBackground', { dark: '#6C2022', light: '#A31515', hcDark: '#6C2022', hcLight: '#A31515' }, 'Background color for a label shown in the CALL STACK view when the debugger breaks on an exception.');
    const debugViewStateLabelForeground = registerColor('debugView.stateLabelForeground', foreground, 'Foreground color for a label in the CALL STACK view showing the current session\'s or thread\'s state.');
    const debugViewStateLabelBackground = registerColor('debugView.stateLabelBackground', '#88888844', 'Background color for a label in the CALL STACK view showing the current session\'s or thread\'s state.');
    const debugViewValueChangedHighlight = registerColor('debugView.valueChangedHighlight', '#569CD6', 'Color used to highlight value changes in the debug views (ie. in the Variables view).');
    const debugConsoleInfoForeground = registerColor('debugConsole.infoForeground', { dark: editorInfoForeground, light: editorInfoForeground, hcDark: foreground, hcLight: foreground }, 'Foreground color for info messages in debug REPL console.');
    const debugConsoleWarningForeground = registerColor('debugConsole.warningForeground', { dark: editorWarningForeground, light: editorWarningForeground, hcDark: '#008000', hcLight: editorWarningForeground }, 'Foreground color for warning messages in debug REPL console.');
    const debugConsoleErrorForeground = registerColor('debugConsole.errorForeground', errorForeground, 'Foreground color for error messages in debug REPL console.');
    const debugConsoleSourceForeground = registerColor('debugConsole.sourceForeground', foreground, 'Foreground color for source filenames in debug REPL console.');
    const debugConsoleInputIconForeground = registerColor('debugConsoleInputIcon.foreground', foreground, 'Foreground color for debug console input marker icon.');
    const debugIconPauseForeground = registerColor('debugIcon.pauseForeground', {
        dark: '#75BEFF',
        light: '#007ACC',
        hcDark: '#75BEFF',
        hcLight: '#007ACC'
    }, localize('debugIcon.pauseForeground', "Debug toolbar icon for pause."));
    const debugIconStopForeground = registerColor('debugIcon.stopForeground', {
        dark: '#F48771',
        light: '#A1260D',
        hcDark: '#F48771',
        hcLight: '#A1260D'
    }, localize('debugIcon.stopForeground', "Debug toolbar icon for stop."));
    const debugIconDisconnectForeground = registerColor('debugIcon.disconnectForeground', {
        dark: '#F48771',
        light: '#A1260D',
        hcDark: '#F48771',
        hcLight: '#A1260D'
    }, localize('debugIcon.disconnectForeground', "Debug toolbar icon for disconnect."));
    const debugIconRestartForeground = registerColor('debugIcon.restartForeground', {
        dark: '#89D185',
        light: '#388A34',
        hcDark: '#89D185',
        hcLight: '#388A34'
    }, localize('debugIcon.restartForeground', "Debug toolbar icon for restart."));
    const debugIconStepOverForeground = registerColor('debugIcon.stepOverForeground', {
        dark: '#75BEFF',
        light: '#007ACC',
        hcDark: '#75BEFF',
        hcLight: '#007ACC'
    }, localize('debugIcon.stepOverForeground', "Debug toolbar icon for step over."));
    const debugIconStepIntoForeground = registerColor('debugIcon.stepIntoForeground', {
        dark: '#75BEFF',
        light: '#007ACC',
        hcDark: '#75BEFF',
        hcLight: '#007ACC'
    }, localize('debugIcon.stepIntoForeground', "Debug toolbar icon for step into."));
    const debugIconStepOutForeground = registerColor('debugIcon.stepOutForeground', {
        dark: '#75BEFF',
        light: '#007ACC',
        hcDark: '#75BEFF',
        hcLight: '#007ACC'
    }, localize('debugIcon.stepOutForeground', "Debug toolbar icon for step over."));
    const debugIconContinueForeground = registerColor('debugIcon.continueForeground', {
        dark: '#75BEFF',
        light: '#007ACC',
        hcDark: '#75BEFF',
        hcLight: '#007ACC'
    }, localize('debugIcon.continueForeground', "Debug toolbar icon for continue."));
    const debugIconStepBackForeground = registerColor('debugIcon.stepBackForeground', {
        dark: '#75BEFF',
        light: '#007ACC',
        hcDark: '#75BEFF',
        hcLight: '#007ACC'
    }, localize('debugIcon.stepBackForeground', "Debug toolbar icon for step back."));
    registerThemingParticipant((theme, collector) => {
        // All these colours provide a default value so they will never be undefined, hence the `!`
        const badgeBackgroundColor = theme.getColor(badgeBackground);
        const badgeForegroundColor = theme.getColor(badgeForeground);
        const listDeemphasizedForegroundColor = theme.getColor(listDeemphasizedForeground);
        const debugViewExceptionLabelForegroundColor = theme.getColor(debugViewExceptionLabelForeground);
        const debugViewExceptionLabelBackgroundColor = theme.getColor(debugViewExceptionLabelBackground);
        const debugViewStateLabelForegroundColor = theme.getColor(debugViewStateLabelForeground);
        const debugViewStateLabelBackgroundColor = theme.getColor(debugViewStateLabelBackground);
        const debugViewValueChangedHighlightColor = theme.getColor(debugViewValueChangedHighlight);
        const toolbarHoverBackgroundColor = theme.getColor(toolbarHoverBackground);
        collector.addRule(`
			/* Text colour of the call stack row's filename */
			.debug-pane .debug-call-stack .monaco-list-row:not(.selected) .stack-frame > .file .file-name {
				color: ${listDeemphasizedForegroundColor}
			}

			/* Line & column number "badge" for selected call stack row */
			.debug-pane .monaco-list-row.selected .line-number {
				background-color: ${badgeBackgroundColor};
				color: ${badgeForegroundColor};
			}

			/* Line & column number "badge" for unselected call stack row (basically all other rows) */
			.debug-pane .line-number {
				background-color: ${badgeBackgroundColor.transparent(0.6)};
				color: ${badgeForegroundColor.transparent(0.6)};
			}

			/* State "badge" displaying the active session's current state.
			* Only visible when there are more active debug sessions/threads running.
			*/
			.debug-pane .debug-call-stack .thread > .state.label,
			.debug-pane .debug-call-stack .session > .state.label {
				background-color: ${debugViewStateLabelBackgroundColor};
				color: ${debugViewStateLabelForegroundColor};
			}

			/* State "badge" displaying the active session's current state.
			* Only visible when there are more active debug sessions/threads running
			* and thread paused due to a thrown exception.
			*/
			.debug-pane .debug-call-stack .thread > .state.label.exception,
			.debug-pane .debug-call-stack .session > .state.label.exception {
				background-color: ${debugViewExceptionLabelBackgroundColor};
				color: ${debugViewExceptionLabelForegroundColor};
			}

			/* Info "badge" shown when the debugger pauses due to a thrown exception. */
			.debug-pane .call-stack-state-message > .label.exception {
				background-color: ${debugViewExceptionLabelBackgroundColor};
				color: ${debugViewExceptionLabelForegroundColor};
			}

			/* Animation of changed values in Debug viewlet */
			@keyframes debugViewletValueChanged {
				0%   { background-color: ${debugViewValueChangedHighlightColor.transparent(0)} }
				5%   { background-color: ${debugViewValueChangedHighlightColor.transparent(0.9)} }
				100% { background-color: ${debugViewValueChangedHighlightColor.transparent(0.3)} }
			}

			.debug-pane .monaco-list-row .expression .value.changed {
				background-color: ${debugViewValueChangedHighlightColor.transparent(0.3)};
				animation-name: debugViewletValueChanged;
				animation-duration: 1s;
				animation-fill-mode: forwards;
			}

			.monaco-list-row .expression .lazy-button:hover {
				background-color: ${toolbarHoverBackgroundColor}
			}
		`);
        const contrastBorderColor = theme.getColor(contrastBorder);
        if (contrastBorderColor) {
            collector.addRule(`
			.debug-pane .line-number {
				border: 1px solid ${contrastBorderColor};
			}
			`);
        }
        // Use fully-opaque colors for line-number badges
        if (isHighContrast(theme.type)) {
            collector.addRule(`
			.debug-pane .line-number {
				background-color: ${badgeBackgroundColor};
				color: ${badgeForegroundColor};
			}`);
        }
        const tokenNameColor = theme.getColor(debugTokenExpressionName);
        const tokenTypeColor = theme.getColor(debugTokenExpressionType);
        const tokenValueColor = theme.getColor(debugTokenExpressionValue);
        const tokenStringColor = theme.getColor(debugTokenExpressionString);
        const tokenBooleanColor = theme.getColor(debugTokenExpressionBoolean);
        const tokenErrorColor = theme.getColor(debugTokenExpressionError);
        const tokenNumberColor = theme.getColor(debugTokenExpressionNumber);
        collector.addRule(`
			.monaco-workbench .monaco-list-row .expression .name {
				color: ${tokenNameColor};
			}

			.monaco-workbench .monaco-list-row .expression .type {
				color: ${tokenTypeColor};
			}

			.monaco-workbench .monaco-list-row .expression .value,
			.monaco-workbench .debug-hover-widget .value {
				color: ${tokenValueColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.string,
			.monaco-workbench .debug-hover-widget .value.string {
				color: ${tokenStringColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.boolean,
			.monaco-workbench .debug-hover-widget .value.boolean {
				color: ${tokenBooleanColor};
			}

			.monaco-workbench .monaco-list-row .expression .error,
			.monaco-workbench .debug-hover-widget .error,
			.monaco-workbench .debug-pane .debug-variables .scope .error {
				color: ${tokenErrorColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.number,
			.monaco-workbench .debug-hover-widget .value.number {
				color: ${tokenNumberColor};
			}
		`);
        const debugConsoleInputBorderColor = theme.getColor(inputBorder) || Color.fromHex('#80808060');
        const debugConsoleInfoForegroundColor = theme.getColor(debugConsoleInfoForeground);
        const debugConsoleWarningForegroundColor = theme.getColor(debugConsoleWarningForeground);
        const debugConsoleErrorForegroundColor = theme.getColor(debugConsoleErrorForeground);
        const debugConsoleSourceForegroundColor = theme.getColor(debugConsoleSourceForeground);
        const debugConsoleInputIconForegroundColor = theme.getColor(debugConsoleInputIconForeground);
        collector.addRule(`
			.repl .repl-input-wrapper {
				border-top: 1px solid ${debugConsoleInputBorderColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.info {
				color: ${debugConsoleInfoForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.warn {
				color: ${debugConsoleWarningForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.error {
				color: ${debugConsoleErrorForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .source {
				color: ${debugConsoleSourceForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .monaco-tl-contents .arrow {
				color: ${debugConsoleInputIconForegroundColor};
			}
		`);
        if (!theme.defines(debugConsoleInputIconForeground)) {
            collector.addRule(`
				.monaco-workbench.vs .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 0.25;
				}

				.monaco-workbench.vs-dark .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 0.4;
				}

				.monaco-workbench.hc-black .repl .repl-tree .monaco-tl-contents .arrow,
				.monaco-workbench.hc-light .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 1;
				}
			`);
        }
        const debugIconStartColor = theme.getColor(debugIconStartForeground);
        if (debugIconStartColor) {
            collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStart)} { color: ${debugIconStartColor}; }`);
        }
        const debugIconPauseColor = theme.getColor(debugIconPauseForeground);
        if (debugIconPauseColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugPause)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugPause)} { color: ${debugIconPauseColor}; }`);
        }
        const debugIconStopColor = theme.getColor(debugIconStopForeground);
        if (debugIconStopColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStop)},.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStop)} { color: ${debugIconStopColor}; }`);
        }
        const debugIconDisconnectColor = theme.getColor(debugIconDisconnectForeground);
        if (debugIconDisconnectColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugDisconnect)},.monaco-workbench .debug-view-content ${ThemeIcon.asCSSSelector(icons.debugDisconnect)}, .monaco-workbench .debug-toolbar ${ThemeIcon.asCSSSelector(icons.debugDisconnect)}, .monaco-workbench .command-center-center ${ThemeIcon.asCSSSelector(icons.debugDisconnect)} { color: ${debugIconDisconnectColor}; }`);
        }
        const debugIconRestartColor = theme.getColor(debugIconRestartForeground);
        if (debugIconRestartColor) {
            collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugRestart)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugRestartFrame)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugRestart)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugRestartFrame)} { color: ${debugIconRestartColor}; }`);
        }
        const debugIconStepOverColor = theme.getColor(debugIconStepOverForeground);
        if (debugIconStepOverColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOver)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepOver)} { color: ${debugIconStepOverColor}; }`);
        }
        const debugIconStepIntoColor = theme.getColor(debugIconStepIntoForeground);
        if (debugIconStepIntoColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepInto)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepInto)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepInto)} { color: ${debugIconStepIntoColor}; }`);
        }
        const debugIconStepOutColor = theme.getColor(debugIconStepOutForeground);
        if (debugIconStepOutColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOut)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOut)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepOut)} { color: ${debugIconStepOutColor}; }`);
        }
        const debugIconContinueColor = theme.getColor(debugIconContinueForeground);
        if (debugIconContinueColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugContinue)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugContinue)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugReverseContinue)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugReverseContinue)} { color: ${debugIconContinueColor}; }`);
        }
        const debugIconStepBackColor = theme.getColor(debugIconStepBackForeground);
        if (debugIconStepBackColor) {
            collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepBack)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepBack)} { color: ${debugIconStepBackColor}; }`);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdDb2xvcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnQ29sb3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLG9CQUFvQixFQUFFLHVCQUF1QixFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLDBCQUEwQixFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsUixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEtBQUssS0FBSyxNQUFNLGlCQUFpQixDQUFDO0FBQ3pDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUU1RSxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxhQUFhLENBQUMseUJBQXlCLEVBQUU7SUFDOUUsSUFBSSxFQUFFLFNBQVM7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixNQUFNLEVBQUUsU0FBUztJQUNqQixPQUFPLEVBQUUsU0FBUztDQUNsQixFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7QUFFMUUsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsYUFBYSxDQUFDLHFCQUFxQixFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO0FBRTVJLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGFBQWEsQ0FBQywyQkFBMkIsRUFBRTtJQUNsRixJQUFJLEVBQUUsU0FBUztJQUNmLEtBQUssRUFBRSxTQUFTO0lBQ2hCLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLE9BQU8sRUFBRSxTQUFTO0NBQ2xCLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLHlDQUF5QyxDQUFDLENBQUMsQ0FBQztBQUVyRixNQUFNLFVBQVUsY0FBYztJQUU3QixNQUFNLHdCQUF3QixHQUFHLGFBQWEsQ0FBQywyQkFBMkIsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsRUFBRSxrR0FBa0csQ0FBQyxDQUFDO0lBQ2hRLE1BQU0sd0JBQXdCLEdBQUcsYUFBYSxDQUFDLDJCQUEyQixFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxFQUFFLGtHQUFrRyxDQUFDLENBQUM7SUFDaFEsTUFBTSx5QkFBeUIsR0FBRyxhQUFhLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEVBQUUsbUdBQW1HLENBQUMsQ0FBQztJQUN2USxNQUFNLDBCQUEwQixHQUFHLGFBQWEsQ0FBQyw2QkFBNkIsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFBRSxvRkFBb0YsQ0FBQyxDQUFDO0lBQ3BQLE1BQU0sMkJBQTJCLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLHFGQUFxRixDQUFDLENBQUM7SUFDdlAsTUFBTSwwQkFBMEIsR0FBRyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsb0ZBQW9GLENBQUMsQ0FBQztJQUNwUCxNQUFNLHlCQUF5QixHQUFHLGFBQWEsQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFBRSw0SUFBNEksQ0FBQyxDQUFDO0lBRTFTLE1BQU0saUNBQWlDLEdBQUcsYUFBYSxDQUFDLG9DQUFvQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxFQUFFLHFHQUFxRyxDQUFDLENBQUM7SUFDblIsTUFBTSxpQ0FBaUMsR0FBRyxhQUFhLENBQUMsb0NBQW9DLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUscUdBQXFHLENBQUMsQ0FBQztJQUNuUixNQUFNLDZCQUE2QixHQUFHLGFBQWEsQ0FBQyxnQ0FBZ0MsRUFBRSxVQUFVLEVBQUUsd0dBQXdHLENBQUMsQ0FBQztJQUM1TSxNQUFNLDZCQUE2QixHQUFHLGFBQWEsQ0FBQyxnQ0FBZ0MsRUFBRSxXQUFXLEVBQUUsd0dBQXdHLENBQUMsQ0FBQztJQUM3TSxNQUFNLDhCQUE4QixHQUFHLGFBQWEsQ0FBQyxpQ0FBaUMsRUFBRSxTQUFTLEVBQUUsdUZBQXVGLENBQUMsQ0FBQztJQUU1TCxNQUFNLDBCQUEwQixHQUFHLGFBQWEsQ0FBQyw2QkFBNkIsRUFBRSxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEVBQUUsMkRBQTJELENBQUMsQ0FBQztJQUNuUCxNQUFNLDZCQUE2QixHQUFHLGFBQWEsQ0FBQyxnQ0FBZ0MsRUFBRSxFQUFFLElBQUksRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsRUFBRSw4REFBOEQsQ0FBQyxDQUFDO0lBQzlRLE1BQU0sMkJBQTJCLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFLGVBQWUsRUFBRSw0REFBNEQsQ0FBQyxDQUFDO0lBQ2pLLE1BQU0sNEJBQTRCLEdBQUcsYUFBYSxDQUFDLCtCQUErQixFQUFFLFVBQVUsRUFBRSw4REFBOEQsQ0FBQyxDQUFDO0lBQ2hLLE1BQU0sK0JBQStCLEdBQUcsYUFBYSxDQUFDLGtDQUFrQyxFQUFFLFVBQVUsRUFBRSx1REFBdUQsQ0FBQyxDQUFDO0lBRS9KLE1BQU0sd0JBQXdCLEdBQUcsYUFBYSxDQUFDLDJCQUEyQixFQUFFO1FBQzNFLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsMkJBQTJCLEVBQUUsK0JBQStCLENBQUMsQ0FBQyxDQUFDO0lBRTNFLE1BQU0sdUJBQXVCLEdBQUcsYUFBYSxDQUFDLDBCQUEwQixFQUFFO1FBQ3pFLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsOEJBQThCLENBQUMsQ0FBQyxDQUFDO0lBRXpFLE1BQU0sNkJBQTZCLEdBQUcsYUFBYSxDQUFDLGdDQUFnQyxFQUFFO1FBQ3JGLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsb0NBQW9DLENBQUMsQ0FBQyxDQUFDO0lBRXJGLE1BQU0sMEJBQTBCLEdBQUcsYUFBYSxDQUFDLDZCQUE2QixFQUFFO1FBQy9FLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQyxDQUFDO0lBRS9FLE1BQU0sMkJBQTJCLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFO1FBQ2pGLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO0lBRWxGLE1BQU0sMkJBQTJCLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFO1FBQ2pGLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO0lBRWxGLE1BQU0sMEJBQTBCLEdBQUcsYUFBYSxDQUFDLDZCQUE2QixFQUFFO1FBQy9FLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO0lBRWpGLE1BQU0sMkJBQTJCLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFO1FBQ2pGLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO0lBRWpGLE1BQU0sMkJBQTJCLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFO1FBQ2pGLElBQUksRUFBRSxTQUFTO1FBQ2YsS0FBSyxFQUFFLFNBQVM7UUFDaEIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFNBQVM7S0FDbEIsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO0lBRWxGLDBCQUEwQixDQUFDLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxFQUFFO1FBQy9DLDJGQUEyRjtRQUMzRixNQUFNLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFFLENBQUM7UUFDOUQsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBRSxDQUFDO1FBQzlELE1BQU0sK0JBQStCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBRSxDQUFDO1FBQ3BGLE1BQU0sc0NBQXNDLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBRSxDQUFDO1FBQ2xHLE1BQU0sc0NBQXNDLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBRSxDQUFDO1FBQ2xHLE1BQU0sa0NBQWtDLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBRSxDQUFDO1FBQzFGLE1BQU0sa0NBQWtDLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBRSxDQUFDO1FBQzFGLE1BQU0sbUNBQW1DLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsQ0FBRSxDQUFDO1FBQzVGLE1BQU0sMkJBQTJCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBRTNFLFNBQVMsQ0FBQyxPQUFPLENBQUM7OzthQUdQLCtCQUErQjs7Ozs7d0JBS3BCLG9CQUFvQjthQUMvQixvQkFBb0I7Ozs7O3dCQUtULG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUM7YUFDaEQsb0JBQW9CLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQzs7Ozs7Ozs7d0JBUTFCLGtDQUFrQzthQUM3QyxrQ0FBa0M7Ozs7Ozs7Ozt3QkFTdkIsc0NBQXNDO2FBQ2pELHNDQUFzQzs7Ozs7d0JBSzNCLHNDQUFzQzthQUNqRCxzQ0FBc0M7Ozs7OytCQUtwQixtQ0FBbUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDOytCQUNsRCxtQ0FBbUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDOytCQUNwRCxtQ0FBbUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDOzs7O3dCQUkzRCxtQ0FBbUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDOzs7Ozs7O3dCQU9wRCwyQkFBMkI7O0dBRWhELENBQUMsQ0FBQztRQUVILE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUUzRCxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsU0FBUyxDQUFDLE9BQU8sQ0FBQzs7d0JBRUcsbUJBQW1COztJQUV2QyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsaURBQWlEO1FBQ2pELElBQUksY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hDLFNBQVMsQ0FBQyxPQUFPLENBQUM7O3dCQUVHLG9CQUFvQjthQUMvQixvQkFBb0I7S0FDNUIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUUsQ0FBQztRQUNqRSxNQUFNLGNBQWMsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFFLENBQUM7UUFDakUsTUFBTSxlQUFlLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBRSxDQUFDO1FBQ25FLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBRSxDQUFDO1FBQ3JFLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBRSxDQUFDO1FBQ3ZFLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUUsQ0FBQztRQUNuRSxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsMEJBQTBCLENBQUUsQ0FBQztRQUVyRSxTQUFTLENBQUMsT0FBTyxDQUFDOzthQUVQLGNBQWM7Ozs7YUFJZCxjQUFjOzs7OzthQUtkLGVBQWU7Ozs7O2FBS2YsZ0JBQWdCOzs7OzthQUtoQixpQkFBaUI7Ozs7OzthQU1qQixlQUFlOzs7OzthQUtmLGdCQUFnQjs7R0FFMUIsQ0FBQyxDQUFDO1FBRUgsTUFBTSw0QkFBNEIsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDL0YsTUFBTSwrQkFBK0IsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFFLENBQUM7UUFDcEYsTUFBTSxrQ0FBa0MsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFFLENBQUM7UUFDMUYsTUFBTSxnQ0FBZ0MsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFFLENBQUM7UUFDdEYsTUFBTSxpQ0FBaUMsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDRCQUE0QixDQUFFLENBQUM7UUFDeEYsTUFBTSxvQ0FBb0MsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLCtCQUErQixDQUFFLENBQUM7UUFFOUYsU0FBUyxDQUFDLE9BQU8sQ0FBQzs7NEJBRVEsNEJBQTRCOzs7O2FBSTNDLCtCQUErQjs7OzthQUkvQixrQ0FBa0M7Ozs7YUFJbEMsZ0NBQWdDOzs7O2FBSWhDLGlDQUFpQzs7OzthQUlqQyxvQ0FBb0M7O0dBRTlDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLCtCQUErQixDQUFDLEVBQUUsQ0FBQztZQUNyRCxTQUFTLENBQUMsT0FBTyxDQUFDOzs7Ozs7Ozs7Ozs7O0lBYWpCLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNyRSxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsU0FBUyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWEsbUJBQW1CLEtBQUssQ0FBQyxDQUFDO1FBQ3hILENBQUM7UUFFRCxNQUFNLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNyRSxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsU0FBUyxDQUFDLE9BQU8sQ0FBQyxrRUFBa0UsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLHVCQUF1QixTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsYUFBYSxtQkFBbUIsS0FBSyxDQUFDLENBQUM7UUFDck8sQ0FBQztRQUVELE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ25FLElBQUksa0JBQWtCLEVBQUUsQ0FBQztZQUN4QixTQUFTLENBQUMsT0FBTyxDQUFDLGtFQUFrRSxTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsc0JBQXNCLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLGtCQUFrQixLQUFLLENBQUMsQ0FBQztRQUNqTyxDQUFDO1FBRUQsTUFBTSx3QkFBd0IsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDL0UsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1lBQzlCLFNBQVMsQ0FBQyxPQUFPLENBQUMsa0VBQWtFLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQywwQ0FBMEMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLHNDQUFzQyxTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsOENBQThDLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxhQUFhLHdCQUF3QixLQUFLLENBQUMsQ0FBQztRQUN2YixDQUFDO1FBRUQsTUFBTSxxQkFBcUIsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDekUsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO1lBQzNCLFNBQVMsQ0FBQyxPQUFPLENBQUMscUJBQXFCLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyx1QkFBdUIsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsb0VBQW9FLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxvRUFBb0UsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsYUFBYSxxQkFBcUIsS0FBSyxDQUFDLENBQUM7UUFDdGEsQ0FBQztRQUVELE1BQU0sc0JBQXNCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzNFLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUM1QixTQUFTLENBQUMsT0FBTyxDQUFDLGtFQUFrRSxTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsdUJBQXVCLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxhQUFhLHNCQUFzQixLQUFLLENBQUMsQ0FBQztRQUM5TyxDQUFDO1FBRUQsTUFBTSxzQkFBc0IsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDM0UsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQzVCLFNBQVMsQ0FBQyxPQUFPLENBQUMsa0VBQWtFLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxvRUFBb0UsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLHVCQUF1QixTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsYUFBYSxzQkFBc0IsS0FBSyxDQUFDLENBQUM7UUFDOVYsQ0FBQztRQUVELE1BQU0scUJBQXFCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3pFLElBQUkscUJBQXFCLEVBQUUsQ0FBQztZQUMzQixTQUFTLENBQUMsT0FBTyxDQUFDLGtFQUFrRSxTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsb0VBQW9FLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyx1QkFBdUIsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLGFBQWEscUJBQXFCLEtBQUssQ0FBQyxDQUFDO1FBQzFWLENBQUM7UUFFRCxNQUFNLHNCQUFzQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUMzRSxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDNUIsU0FBUyxDQUFDLE9BQU8sQ0FBQyxrRUFBa0UsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLHVCQUF1QixTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsb0VBQW9FLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLHVCQUF1QixTQUFTLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLHNCQUFzQixLQUFLLENBQUMsQ0FBQztRQUMvYSxDQUFDO1FBRUQsTUFBTSxzQkFBc0IsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDM0UsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQzVCLFNBQVMsQ0FBQyxPQUFPLENBQUMsa0VBQWtFLFNBQVMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsU0FBUyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLGFBQWEsc0JBQXNCLEtBQUssQ0FBQyxDQUFDO1FBQzlPLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMifQ==