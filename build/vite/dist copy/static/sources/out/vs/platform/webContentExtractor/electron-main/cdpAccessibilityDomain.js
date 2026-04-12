/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//#region Types
import { URI } from '../../../base/common/uri.js';
/**
 * Creates a forest of node trees from the given AXNodes.
 * When nodes come from multiple frames (e.g., main frame + iframes),
 * each frame has its own RootWebArea, resulting in multiple trees.
 */
function createNodeTrees(nodes) {
    if (nodes.length === 0) {
        return [];
    }
    // Create a map of node IDs to their corresponding nodes for quick lookup
    const nodeLookup = new Map();
    for (const node of nodes) {
        nodeLookup.set(node.nodeId, node);
    }
    // Helper function to get all non-ignored descendants of a node
    function getNonIgnoredDescendants(nodeId) {
        const node = nodeLookup.get(nodeId);
        if (!node || !node.childIds) {
            return [];
        }
        const result = [];
        for (const childId of node.childIds) {
            const childNode = nodeLookup.get(childId);
            if (!childNode) {
                continue;
            }
            if (childNode.ignored) {
                // If child is ignored, add its non-ignored descendants instead
                result.push(...getNonIgnoredDescendants(childId));
            }
            else {
                // Otherwise, add the child itself
                result.push(childId);
            }
        }
        return result;
    }
    // Create tree nodes only for non-ignored nodes
    const nodeMap = new Map();
    for (const node of nodes) {
        if (!node.ignored) {
            nodeMap.set(node.nodeId, { node, children: [], parent: null });
        }
    }
    // Establish parent-child relationships, bypassing ignored nodes
    for (const node of nodes) {
        if (node.ignored) {
            continue;
        }
        const treeNode = nodeMap.get(node.nodeId);
        if (node.childIds) {
            for (const childId of node.childIds) {
                const childNode = nodeLookup.get(childId);
                if (!childNode) {
                    continue;
                }
                if (childNode.ignored) {
                    // If child is ignored, connect its non-ignored descendants to this node
                    const nonIgnoredDescendants = getNonIgnoredDescendants(childId);
                    for (const descendantId of nonIgnoredDescendants) {
                        const descendantTreeNode = nodeMap.get(descendantId);
                        if (descendantTreeNode) {
                            descendantTreeNode.parent = treeNode;
                            treeNode.children.push(descendantTreeNode);
                        }
                    }
                }
                else {
                    // Normal case: add non-ignored child directly
                    const childTreeNode = nodeMap.get(childId);
                    if (childTreeNode) {
                        childTreeNode.parent = treeNode;
                        treeNode.children.push(childTreeNode);
                    }
                }
            }
        }
    }
    // Find all root nodes (nodes without a parent)
    // When nodes come from multiple frames, each frame has its own root
    const roots = [];
    for (const node of nodeMap.values()) {
        if (!node.parent) {
            roots.push(node);
        }
    }
    return roots;
}
/**
 * When possible, we will make sure lines are no longer than 80. This is to help
 * certain pieces of software that can't handle long lines.
 */
const LINE_MAX_LENGTH = 80;
/**
 * Converts an accessibility tree represented by AXNode objects into a markdown string.
 * Handles multiple root nodes (e.g., from main frame + iframes) by processing each tree
 * and combining the results.
 *
 * @param uri The URI of the document
 * @param axNodes The array of AXNode objects representing the accessibility tree
 * @returns A markdown representation of the accessibility tree
 */
export function convertAXTreeToMarkdown(uri, axNodes) {
    const trees = createNodeTrees(axNodes);
    if (trees.length === 0) {
        return ''; // Return empty string for empty tree
    }
    // Process each tree and collect main content and navigation links
    const allMainContent = [];
    const allNavLinks = [];
    for (const tree of trees) {
        const mainContent = extractMainContent(uri, tree);
        const navLinks = collectNavigationLinks(tree);
        if (mainContent.trim().length > 0) {
            allMainContent.push(mainContent);
        }
        allNavLinks.push(...navLinks);
    }
    // Combine all main content from all trees
    const combinedMainContent = allMainContent.join('\n\n');
    // Combine main content and navigation links
    return combinedMainContent + (allNavLinks.length > 0 ? '\n\n## Additional Links\n' + allNavLinks.join('\n') : '');
}
function extractMainContent(uri, tree) {
    const contentBuffer = [];
    processNode(uri, tree, contentBuffer, 0, true);
    return contentBuffer.join('');
}
function processNode(uri, node, buffer, depth, allowWrap) {
    const role = getNodeRole(node.node);
    switch (role) {
        case 'navigation':
            return; // Skip navigation nodes
        case 'heading':
            processHeadingNode(uri, node, buffer, depth);
            return;
        case 'paragraph':
            processParagraphNode(uri, node, buffer, depth, allowWrap);
            return;
        case 'list':
            buffer.push('\n');
            for (const descChild of node.children) {
                processNode(uri, descChild, buffer, depth + 1, true);
            }
            buffer.push('\n');
            return;
        case 'ListMarker':
            // TODO: Should we normalize these ListMarkers to `-` and normal lists?
            buffer.push(getNodeText(node.node, allowWrap));
            return;
        case 'listitem': {
            const tempBuffer = [];
            // Process the children of the list item
            for (const descChild of node.children) {
                processNode(uri, descChild, tempBuffer, depth + 1, true);
            }
            const indent = getLevel(node.node) > 1 ? ' '.repeat(getLevel(node.node)) : '';
            buffer.push(`${indent}${tempBuffer.join('').trim()}\n`);
            return;
        }
        case 'link':
            if (!isNavigationLink(node)) {
                const linkText = getNodeText(node.node, allowWrap);
                const url = getLinkUrl(node.node);
                if (!isSameUriIgnoringQueryAndFragment(uri, node.node)) {
                    buffer.push(`[${linkText}](${url})`);
                }
                else {
                    buffer.push(linkText);
                }
            }
            return;
        case 'StaticText': {
            const staticText = getNodeText(node.node, allowWrap);
            if (staticText) {
                buffer.push(staticText);
            }
            break;
        }
        case 'image': {
            const altText = getNodeText(node.node, allowWrap) || 'Image';
            const imageUrl = getImageUrl(node.node);
            if (imageUrl) {
                buffer.push(`![${altText}](${imageUrl})\n\n`);
            }
            else {
                buffer.push(`[Image: ${altText}]\n\n`);
            }
            break;
        }
        case 'DescriptionList':
            processDescriptionListNode(uri, node, buffer, depth);
            return;
        case 'blockquote':
            buffer.push('> ' + getNodeText(node.node, allowWrap).replace(/\n/g, '\n> ') + '\n\n');
            break;
        // TODO: Is this the correct way to handle the generic role?
        case 'generic':
            buffer.push(' ');
            break;
        case 'code': {
            processCodeNode(uri, node, buffer, depth);
            return;
        }
        case 'pre':
            buffer.push('```\n' + getNodeText(node.node, false) + '\n```\n\n');
            break;
        case 'table':
            processTableNode(node, buffer);
            return;
    }
    // Process children if not already handled in specific cases
    for (const child of node.children) {
        processNode(uri, child, buffer, depth + 1, allowWrap);
    }
}
function getNodeRole(node) {
    return node.role?.value || '';
}
function getNodeText(node, allowWrap) {
    const text = node.name?.value || node.value?.value || '';
    if (!allowWrap) {
        return text;
    }
    if (text.length <= LINE_MAX_LENGTH) {
        return text;
    }
    const chars = text.split('');
    let lastSpaceIndex = -1;
    for (let i = 1; i < chars.length; i++) {
        if (chars[i] === ' ') {
            lastSpaceIndex = i;
        }
        // Check if we reached the line max length, try to break at the last space
        // before the line max length
        if (i % LINE_MAX_LENGTH === 0 && lastSpaceIndex !== -1) {
            // replace the space with a new line
            chars[lastSpaceIndex] = '\n';
            lastSpaceIndex = i;
        }
    }
    return chars.join('');
}
function getLevel(node) {
    const levelProp = node.properties?.find(p => p.name === 'level');
    return levelProp ? Math.min(Number(levelProp.value.value) || 1, 6) : 1;
}
function getLinkUrl(node) {
    // Find URL in properties
    const urlProp = node.properties?.find(p => p.name === 'url');
    return urlProp?.value.value || '#';
}
function getImageUrl(node) {
    // Find URL in properties
    const urlProp = node.properties?.find(p => p.name === 'url');
    return urlProp?.value.value || null;
}
function isNavigationLink(node) {
    // Check if this link is part of navigation
    let current = node;
    while (current) {
        const role = getNodeRole(current.node);
        if (['navigation', 'menu', 'menubar'].includes(role)) {
            return true;
        }
        current = current.parent;
    }
    return false;
}
function isSameUriIgnoringQueryAndFragment(uri, node) {
    // Check if this link is an anchor link
    const link = getLinkUrl(node);
    try {
        const parsed = URI.parse(link);
        return parsed.scheme === uri.scheme && parsed.authority === uri.authority && parsed.path === uri.path;
    }
    catch (e) {
        return false;
    }
}
function processParagraphNode(uri, node, buffer, depth, allowWrap) {
    buffer.push('\n');
    // Process the children of the paragraph
    for (const child of node.children) {
        processNode(uri, child, buffer, depth + 1, allowWrap);
    }
    buffer.push('\n\n');
}
function processHeadingNode(uri, node, buffer, depth) {
    buffer.push('\n');
    const level = getLevel(node.node);
    buffer.push(`${'#'.repeat(level)} `);
    // Process children nodes of the heading
    for (const child of node.children) {
        if (getNodeRole(child.node) === 'StaticText') {
            buffer.push(getNodeText(child.node, false));
        }
        else {
            processNode(uri, child, buffer, depth + 1, false);
        }
    }
    buffer.push('\n\n');
}
function processDescriptionListNode(uri, node, buffer, depth) {
    buffer.push('\n');
    // Process each child of the description list
    for (const child of node.children) {
        if (getNodeRole(child.node) === 'term') {
            buffer.push('- **');
            // Process term nodes
            for (const termChild of child.children) {
                processNode(uri, termChild, buffer, depth + 1, true);
            }
            buffer.push('** ');
        }
        else if (getNodeRole(child.node) === 'definition') {
            // Process description nodes
            for (const descChild of child.children) {
                processNode(uri, descChild, buffer, depth + 1, true);
            }
            buffer.push('\n');
        }
    }
    buffer.push('\n');
}
function isTableCell(role) {
    // Match cell, gridcell, columnheader, rowheader roles
    return role === 'cell' || role === 'gridcell' || role === 'columnheader' || role === 'rowheader';
}
function processTableNode(node, buffer) {
    buffer.push('\n');
    // Find rows
    const rows = node.children.filter(child => getNodeRole(child.node).includes('row'));
    if (rows.length > 0) {
        // First row as header
        const headerCells = rows[0].children.filter(cell => isTableCell(getNodeRole(cell.node)));
        // Generate header row
        const headerContent = headerCells.map(cell => getNodeText(cell.node, false) || ' ');
        buffer.push('| ' + headerContent.join(' | ') + ' |\n');
        // Generate separator row
        buffer.push('| ' + headerCells.map(() => '---').join(' | ') + ' |\n');
        // Generate data rows
        for (let i = 1; i < rows.length; i++) {
            const dataCells = rows[i].children.filter(cell => isTableCell(getNodeRole(cell.node)));
            const rowContent = dataCells.map(cell => getNodeText(cell.node, false) || ' ');
            buffer.push('| ' + rowContent.join(' | ') + ' |\n');
        }
    }
    buffer.push('\n');
}
function processCodeNode(uri, node, buffer, depth) {
    const tempBuffer = [];
    // Process the children of the code node
    for (const child of node.children) {
        processNode(uri, child, tempBuffer, depth + 1, false);
    }
    const isCodeblock = tempBuffer.some(text => text.includes('\n'));
    if (isCodeblock) {
        buffer.push('\n```\n');
        // Append the processed text to the buffer
        buffer.push(tempBuffer.join(''));
        buffer.push('\n```\n');
    }
    else {
        buffer.push('`');
        let characterCount = 0;
        // Append the processed text to the buffer
        for (const tempItem of tempBuffer) {
            characterCount += tempItem.length;
            if (characterCount > LINE_MAX_LENGTH) {
                buffer.push('\n');
                characterCount = 0;
            }
            buffer.push(tempItem);
            buffer.push('`');
        }
    }
}
function collectNavigationLinks(tree) {
    const links = [];
    collectLinks(tree, links);
    return links;
}
function collectLinks(node, links) {
    const role = getNodeRole(node.node);
    if (role === 'link' && isNavigationLink(node)) {
        const linkText = getNodeText(node.node, true);
        const url = getLinkUrl(node.node);
        const description = node.node.description?.value || '';
        links.push(`- [${linkText}](${url})${description ? ' - ' + description : ''}`);
    }
    // Process children
    for (const child of node.children) {
        collectLinks(child, links);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RwQWNjZXNzaWJpbGl0eURvbWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvZWxlY3Ryb24tbWFpbi9jZHBBY2Nlc3NpYmlsaXR5RG9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLGVBQWU7QUFFZixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUF3RGxEOzs7O0dBSUc7QUFDSCxTQUFTLGVBQWUsQ0FBQyxLQUFlO0lBQ3ZDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN4QixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCx5RUFBeUU7SUFDekUsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7SUFDN0MsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUMxQixVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELCtEQUErRDtJQUMvRCxTQUFTLHdCQUF3QixDQUFDLE1BQWM7UUFDL0MsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzdCLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztRQUM1QixLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNyQyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzFDLElBQUksQ0FBQyxT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