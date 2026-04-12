/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asCssVariableName, getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariableName as asSizeCssVariableName, getSizeRegistry, sizeValueToCss } from '../../../../platform/theme/common/sizeRegistry.js';
/**
 * Generates CSS content (variables + theming participant rules) for a color theme.
 * Pure function - no DOM side effects.
 *
 * @param theme The color theme to generate CSS for
 * @param scopeSelector CSS selector to scope the rules (e.g. '.monaco-workbench')
 * @param themingParticipants Functions that contribute additional CSS rules (optional)
 * @param environmentService Passed to theming participants (required if themingParticipants is non-empty)
 */
export function generateColorThemeCSS(theme, scopeSelector, themingParticipants, environmentService) {
    const cssRules = new Set();
    const ruleCollector = {
        addRule: (rule) => {
            if (!cssRules.has(rule)) {
                cssRules.add(rule);
            }
        }
    };
    // Base rule
    ruleCollector.addRule(`${scopeSelector} { forced-color-adjust: none; }`);
    // Theming participant rules
    if (themingParticipants && environmentService) {
        for (const participant of themingParticipants) {
            participant(theme, ruleCollector, environmentService);
        }
    }
    // Color CSS variables
    const variables = [];
    for (const item of getColorRegistry().getColors()) {
        const color = theme.getColor(item.id, true);
        if (color) {
            variables.push(`${asCssVariableName(item.id)}: ${color.toString()};`);
        }
    }
    // Size CSS variables
    for (const item of getSizeRegistry().getSizes()) {
        const sizeValue = getSizeRegistry().resolveDefaultSize(item.id, theme);
        if (sizeValue) {
            variables.push(`${asSizeCssVariableName(item.id)}: ${sizeValueToCss(sizeValue)};`);
        }
    }
    ruleCollector.addRule(`${scopeSelector} { ${variables.join('\n')} }`);
    return new CSSValue([...cssRules].join('\n'));
}
/**
 * A typed wrapper for CSS content
 */
export class CSSValue {
    constructor(code) {
        this.code = code;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JUaGVtZUNzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvYnJvd3Nlci9jb2xvclRoZW1lQ3NzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsSUFBSSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHaEo7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUscUJBQXFCLENBQ3BDLEtBQWtCLEVBQ2xCLGFBQXFCLEVBQ3JCLG1CQUFvRCxFQUNwRCxrQkFBd0M7SUFFeEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUNuQyxNQUFNLGFBQWEsR0FBdUI7UUFDekMsT0FBTyxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUU7WUFDekIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDekIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQixDQUFDO1FBQ0YsQ0FBQztLQUNELENBQUM7SUFFRixZQUFZO0lBQ1osYUFBYSxDQUFDLE9BQU8sQ0FBQyxHQUFHLGFBQWEsaUNBQWlDLENBQUMsQ0FBQztJQUV6RSw0QkFBNEI7SUFDNUIsSUFBSSxtQkFBbUIsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQy9DLEtBQUssTUFBTSxXQUFXLElBQUksbUJBQW1CLEVBQUUsQ0FBQztZQUMvQyxXQUFXLENBQUMsS0FBSyxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7SUFDRixDQUFDO0lBRUQsc0JBQXNCO0lBQ3RCLE1BQU0sU0FBUyxHQUFhLEVBQUUsQ0FBQztJQUMvQixLQUFLLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixFQUFFLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQztRQUNuRCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxDQUFDO0lBQ0YsQ0FBQztJQUVELHFCQUFxQjtJQUNyQixLQUFLLE1BQU0sSUFBSSxJQUFJLGVBQWUsRUFBRSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7UUFDakQsTUFBTSxTQUFTLEdBQUcsZUFBZSxFQUFFLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxjQUFjLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQU8sQ0FBQyxHQUFHLGFBQWEsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUV0RSxPQUFPLElBQUksUUFBUSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUMvQyxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sUUFBUTtJQUNwQixZQUFxQixJQUFZO1FBQVosU0FBSSxHQUFKLElBQUksQ0FBUTtJQUFJLENBQUM7Q0FDdEMifQ==