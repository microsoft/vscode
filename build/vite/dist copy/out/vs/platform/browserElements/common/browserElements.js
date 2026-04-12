/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const INativeBrowserElementsService = createDecorator('nativeBrowserElementsService');
/**
 * Extract a display name from outer HTML (e.g., "div#myId.myClass1.myClass2")
 */
export function getDisplayNameFromOuterHTML(outerHTML) {
    const firstElementMatch = outerHTML.match(/^<([^ >]+)([^>]*?)>/);
    if (!firstElementMatch) {
        throw new Error('No outer element found');
    }
    const tagName = firstElementMatch[1];
    const idMatch = firstElementMatch[2].match(/\s+id\s*=\s*["']([^"']+)["']/i);
    const id = idMatch ? `#${idMatch[1]}` : '';
    const classMatch = firstElementMatch[2].match(/\s+class\s*=\s*["']([^"']+)["']/i);
    const className = classMatch ? `.${classMatch[1].replace(/\s+/g, '.')}` : '';
    return `${tagName}${id}${className}`;
}
/**
 * Format an array of element ancestors into a CSS-selector-like path string.
 */
export function formatElementPath(ancestors) {
    if (!ancestors || ancestors.length === 0) {
        return undefined;
    }
    return ancestors
        .map(ancestor => {
        const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join('.')}` : '';
        const id = ancestor.id ? `#${ancestor.id}` : '';
        return `${ancestor.tagName}${id}${classes}`;
    })
        .join(' > ');
}
/**
 * Collapse margin-top/right/bottom/left or padding-top/right/bottom/left
 * into a single shorthand value, removing the individual entries from the map.
 */
function createBoxShorthand(entries, propertyName) {
    const topKey = `${propertyName}-top`;
    const rightKey = `${propertyName}-right`;
    const bottomKey = `${propertyName}-bottom`;
    const leftKey = `${propertyName}-left`;
    const top = entries.get(topKey);
    const right = entries.get(rightKey);
    const bottom = entries.get(bottomKey);
    const left = entries.get(leftKey);
    if (top === undefined || right === undefined || bottom === undefined || left === undefined) {
        return undefined;
    }
    entries.delete(topKey);
    entries.delete(rightKey);
    entries.delete(bottomKey);
    entries.delete(leftKey);
    return `${top} ${right} ${bottom} ${left}`;
}
/**
 * Format a key-value record into a markdown-style list,
 * collapsing margin/padding into shorthand values.
 */
export function formatElementMap(entries) {
    if (!entries || Object.keys(entries).length === 0) {
        return undefined;
    }
    const normalizedEntries = new Map(Object.entries(entries));
    const lines = [];
    const marginShorthand = createBoxShorthand(normalizedEntries, 'margin');
    if (marginShorthand) {
        lines.push(`- margin: ${marginShorthand}`);
    }
    const paddingShorthand = createBoxShorthand(normalizedEntries, 'padding');
    if (paddingShorthand) {
        lines.push(`- padding: ${paddingShorthand}`);
    }
    for (const [name, value] of Array.from(normalizedEntries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`- ${name}: ${value}`);
    }
    return lines.join('\n');
}
/**
 * Build a structured text representation of element data for use as chat context.
 */
export function createElementContextValue(elementData, displayName, attachCss) {
    const sections = [];
    sections.push('Attached Element Context from Integrated Browser');
    sections.push(`Element: ${displayName}`);
    const htmlPath = formatElementPath(elementData.ancestors);
    if (htmlPath) {
        sections.push(`HTML Path:\n${htmlPath}`);
    }
    const attributeTable = formatElementMap(elementData.attributes);
    if (attributeTable) {
        sections.push(`Attributes:\n${attributeTable}`);
    }
    if (attachCss) {
        const computedStyleTable = formatElementMap(elementData.computedStyles);
        if (computedStyleTable) {
            sections.push(`Computed Styles:\n${computedStyleTable}`);
        }
    }
    if (elementData.dimensions) {
        const { top, left, width, height } = elementData.dimensions;
        sections.push(`Dimensions:\n- top: ${Math.round(top)}px\n- left: ${Math.round(left)}px\n- width: ${Math.round(width)}px\n- height: ${Math.round(height)}px`);
    }
    const innerText = elementData.innerText?.trim();
    if (innerText) {
        sections.push(`Inner Text:\n\`\`\`text\n${innerText}\n\`\`\``);
    }
    sections.push(`Outer HTML:\n\`\`\`html\n${elementData.outerHTML}\n\`\`\``);
    if (attachCss) {
        sections.push(`Full Computed CSS:\n\`\`\`css\n${elementData.computedStyle}\n\`\`\``);
    }
    return sections.join('\n\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVsZW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYnJvd3NlckVsZW1lbnRzL2NvbW1vbi9icm93c2VyRWxlbWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzlFLE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLGVBQWUsQ0FBZ0MsOEJBQThCLENBQUMsQ0FBQztBQTBENUg7O0dBRUc7QUFDSCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsU0FBaUI7SUFDNUQsTUFBTSxpQkFBaUIsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDakUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDeEIsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyQyxNQUFNLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUM1RSxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUMzQyxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNsRixNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FB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