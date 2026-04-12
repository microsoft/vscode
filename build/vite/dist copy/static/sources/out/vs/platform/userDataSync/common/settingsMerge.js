/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct } from '../../../base/common/arrays.js';
import { parse, visit } from '../../../base/common/json.js';
import { applyEdits, setProperty, withFormatting } from '../../../base/common/jsonEdit.js';
import { getEOL } from '../../../base/common/jsonFormatter.js';
import * as objects from '../../../base/common/objects.js';
import * as contentUtil from './content.js';
import { getDisallowedIgnoredSettings } from './userDataSync.js';
export function getIgnoredSettings(defaultIgnoredSettings, configurationService, settingsContent) {
    let value = [];
    if (settingsContent) {
        value = getIgnoredSettingsFromContent(settingsContent);
    }
    else {
        value = getIgnoredSettingsFromConfig(configurationService);
    }
    const added = [], removed = [...getDisallowedIgnoredSettings()];
    if (Array.isArray(value)) {
        for (const key of value) {
            if (key.startsWith('-')) {
                removed.push(key.substring(1));
            }
            else {
                added.push(key);
            }
        }
    }
    return distinct([...defaultIgnoredSettings, ...added,].filter(setting => !removed.includes(setting)));
}
function getIgnoredSettingsFromConfig(configurationService) {
    let userValue = configurationService.inspect('settingsSync.ignoredSettings').userValue;
    if (userValue !== undefined) {
        return userValue;
    }
    userValue = configurationService.inspect('sync.ignoredSettings').userValue;
    if (userValue !== undefined) {
        return userValue;
    }
    return configurationService.getValue('settingsSync.ignoredSettings') || [];
}
function getIgnoredSettingsFromContent(settingsContent) {
    const parsed = parse(settingsContent);
    return parsed ? parsed['settingsSync.ignoredSettings'] || parsed['sync.ignoredSettings'] || [] : [];
}
export function removeComments(content, formattingOptions) {
    const source = parse(content) || {};
    let result = '{}';
    for (const key of Object.keys(source)) {
        const edits = setProperty(result, [key], source[key], formattingOptions);
        result = applyEdits(result, edits);
    }
    return result;
}
export function updateIgnoredSettings(targetContent, sourceContent, ignoredSettings, formattingOptions) {
    if (ignoredSettings.length) {
        const sourceTree = parseSettings(sourceContent);
        const source = parse(sourceContent) || {};
        const target = parse(targetContent);
        if (!target) {
            return targetContent;
        }
        const settingsToAdd = [];
        for (const key of ignoredSettings) {
            const sourceValue = source[key];
            const targetValue = target[key];
            // Remove in target
            if (sourceValue === undefined) {
                targetContent = contentUtil.edit(targetContent, [key], undefined, formattingOptions);
            }
            // Update in target
            else if (targetValue !== undefined) {
                targetContent = contentUtil.edit(targetContent, [key], sourceValue, formattingOptions);
            }
            else {
                settingsToAdd.push(findSettingNode(key, sourceTree));
            }
        }
        settingsToAdd.sort((a, b) => a.startOffset - b.startOffset);
        settingsToAdd.forEach(s => targetContent = addSetting(s.setting.key, sourceContent, targetContent, formattingOptions));
    }
    return targetContent;
}
export function merge(originalLocalContent, originalRemoteContent, baseContent, ignoredSettings, resolvedConflicts, formattingOptions) {
    const localContentWithoutIgnoredSettings = updateIgnoredSettings(originalLocalContent, originalRemoteContent, ignoredSettings, formattingOptions);
    const localForwarded = baseContent !== localContentWithoutIgnoredSettings;
    const remoteForwarded = baseContent !== originalRemoteContent;
    /* no changes */
    if (!localForwarded && !remoteForwarded) {
        return { conflictsSettings: [], localContent: null, remoteContent: null, hasConflicts: false };
    }
    /* local has changed and remote has not */
    if (localForwarded && !remoteForwarded) {
        return { conflictsSettings: [], localContent: null, remoteContent: localContentWithoutIgnoredSettings, hasConflicts: false };
    }
    /* remote has changed and local has not */
    if (remoteForwarded && !localForwarded) {
        return { conflictsSettings: [], localContent: updateIgnoredSettings(originalRemoteContent, originalLocalContent, ignoredSettings, formattingOptions), remoteContent: null, hasConflicts: false };
    }
    /* local is empty and not synced before */
    if (baseContent === null && isEmpty(originalLocalContent)) {
        const localContent = areSame(originalLocalContent, originalRemoteContent, ignoredSettings) ? null : updateIgnoredSettings(originalRemoteContent, originalLocalContent, ignoredSettings, formattingOptions);
        return { conflictsSettings: [], localContent, remoteContent: null, hasConflicts: false };
    }
    /* remote and local has changed */
    let localContent = originalLocalContent;
    let remoteContent = originalRemoteContent;
    const local = parse(originalLocalContent);
    const remote = parse(originalRemoteContent);
    const base = baseContent ? parse(baseContent) : null;
    const ignored = ignoredSettings.reduce((set, key) => { set.add(key); return set; }, new Set());
    const localToRemote = compare(local, remote, ignored);
    const baseToLocal = compare(base, local, ignored);
    const baseToRemote = compare(base, remote, ignored);
    const conflicts = new Map();
    const handledConflicts = new Set();
    const handleConflict = (conflictKey) => {
        handledConflicts.add(conflictKey);
        const resolvedConflict = resolvedConflicts.filter(({ key }) => key === conflictKey)[0];
        if (resolvedConflict) {
            localContent = contentUtil.edit(localContent, [conflictKey], resolvedConflict.value, formattingOptions);
            remoteContent = contentUtil.edit(remoteContent, [conflictKey], resolvedConflict.value, formattingOptions);
        }
        else {
            conflicts.set(conflictKey, { key: conflictKey, localValue: local[conflictKey], remoteValue: remote[conflictKey] });
        }
    };
    // Removed settings in Local
    for (const key of baseToLocal.removed.values()) {
        // Conflict - Got updated in remote.
        if (baseToRemote.updated.has(key)) {
            handleConflict(key);
        }
        // Also remove in remote
        else {
            remoteContent = contentUtil.edit(remoteContent, [key], undefined, formattingOptions);
        }
    }
    // Removed settings in Remote
    for (const key of baseToRemote.removed.values()) {
        if (handledConflicts.has(key)) {
            continue;
        }
        // Conflict - Got updated in local
        if (baseToLocal.updated.has(key)) {
            handleConflict(key);
        }
        // Also remove in locals
        else {
            localContent = contentUtil.edit(localContent, [key], undefined, formattingOptions);
        }
    }
    // Updated settings in Local
    for (const key of baseToLocal.updated.values()) {
        if (handledConflicts.has(key)) {
            continue;
        }
        // Got updated in remote
        if (baseToRemote.updated.has(key)) {
            // Has different value
            if (localToRemote.updated.has(key)) {
                handleConflict(key);
            }
        }
        else {
            remoteContent = contentUtil.edit(remoteContent, [key], local[key], formattingOptions);
        }
    }
    // Updated settings in Remote
    for (const key of baseToRemote.updated.values()) {
        if (handledConflicts.has(key)) {
            continue;
        }
        // Got updated in local
        if (baseToLocal.updated.has(key)) {
            // Has different value
            if (localToRemote.updated.has(key)) {
                handleConflict(key);
            }
        }
        else {
            localContent = contentUtil.edit(localContent, [key], remote[key], formattingOptions);
        }
    }
    // Added settings in Local
    for (const key of baseToLocal.added.values()) {
        if (handledConflicts.has(key)) {
            continue;
        }
        // Got added in remote
        if (baseToRemote.added.has(key)) {
            // Has different value
            if (localToRemote.updated.has(key)) {
                handleConflict(key);
            }
        }
        else {
            remoteContent = addSetting(key, localContent, remoteContent, formattingOptions);
        }
    }
    // Added settings in remote
    for (const key of baseToRemote.added.values()) {
        if (handledConflicts.has(key)) {
            continue;
        }
        // Got added in local
        if (baseToLocal.added.has(key)) {
            // Has different value
            if (localToRemote.updated.has(key)) {
                handleConflict(key);
            }
        }
        else {
            localContent = addSetting(key, remoteContent, localContent, formattingOptions);
        }
    }
    const hasConflicts = conflicts.size > 0 || !areSame(localContent, remoteContent, ignoredSettings);
    const hasLocalChanged = hasConflicts || !areSame(localContent, originalLocalContent, []);
    const hasRemoteChanged = hasConflicts || !areSame(remoteContent, originalRemoteContent, []);
    return { localContent: hasLocalChanged ? localContent : null, remoteContent: hasRemoteChanged ? remoteContent : null, conflictsSettings: [...conflicts.values()], hasConflicts };
}
function areSame(localContent, remoteContent, ignoredSettings) {
    if (localContent === remoteContent) {
        return true;
    }
    const local = parse(localContent);
    const remote = parse(remoteContent);
    const ignored = ignoredSettings.reduce((set, key) => { set.add(key); return set; }, new Set());
    const localTree = parseSettings(localContent).filter(node => !(node.setting && ignored.has(node.setting.key)));
    const remoteTree = parseSettings(remoteContent).filter(node => !(node.setting && ignored.has(node.setting.key)));
    if (localTree.length !== remoteTree.length) {
        return false;
    }
    for (let index = 0; index < localTree.length; index++) {
        const localNode = localTree[index];
        const remoteNode = remoteTree[index];
        if (localNode.setting && remoteNode.setting) {
            if (localNode.setting.key !== remoteNode.setting.key) {
                return false;
            }
            if (!objects.equals(local[localNode.setting.key], remote[localNode.setting.key])) {
                return false;
            }
        }
        else if (!localNode.setting && !remoteNode.setting) {
            if (localNode.value !== remoteNode.value) {
                return false;
            }
        }
        else {
            return false;
        }
    }
    return true;
}
export function isEmpty(content) {
    if (content) {
        const nodes = parseSettings(content);
        return nodes.length === 0;
    }
    return true;
}
function compare(from, to, ignored) {
    const fromKeys = from ? Object.keys(from).filter(key => !ignored.has(key)) : [];
    const toKeys = Object.keys(to).filter(key => !ignored.has(key));
    const added = toKeys.filter(key => !fromKeys.includes(key)).reduce((r, key) => { r.add(key); return r; }, new Set());
    const removed = fromKeys.filter(key => !toKeys.includes(key)).reduce((r, key) => { r.add(key); return r; }, new Set());
    const updated = new Set();
    if (from) {
        for (const key of fromKeys) {
            if (removed.has(key)) {
                continue;
            }
            const value1 = from[key];
            const value2 = to[key];
            if (!objects.equals(value1, value2)) {
                updated.add(key);
            }
        }
    }
    return { added, removed, updated };
}
export function addSetting(key, sourceContent, targetContent, formattingOptions) {
    const source = parse(sourceContent);
    const sourceTree = parseSettings(sourceContent);
    const targetTree = parseSettings(targetContent);
    const insertLocation = getInsertLocation(key, sourceTree, targetTree);
    return insertAtLocation(targetContent, key, source[key], insertLocation, targetTree, formattingOptions);
}
function getInsertLocation(key, sourceTree, targetTree) {
    const sourceNodeIndex = sourceTree.findIndex(node => node.setting?.key === key);
    const sourcePreviousNode = sourceTree[sourceNodeIndex - 1];
    if (sourcePreviousNode) {
        /*
            Previous node in source is a setting.
            Find the same setting in the target.
            Insert it after that setting
        */
        if (sourcePreviousNode.setting) {
            const targetPreviousSetting = findSettingNode(sourcePreviousNode.setting.key, targetTree);
            if (targetPreviousSetting) {
                /* Insert after target's previous setting */
                return { index: targetTree.indexOf(targetPreviousSetting), insertAfter: true };
            }
        }
        /* Previous node in source is a comment */
        else {
            const sourcePreviousSettingNode = findPreviousSettingNode(sourceNodeIndex, sourceTree);
            /*
                Source has a setting defined before the setting to be added.
                Find the same previous setting in the target.
                If found, insert before its next setting so that comments are retrieved.
                Otherwise, insert at the end.
            */
            if (sourcePreviousSettingNode) {
                const targetPreviousSetting = findSettingNode(sourcePreviousSettingNode.setting.key, targetTree);
                if (targetPreviousSetting) {
                    const targetNextSetting = findNextSettingNode(targetTree.indexOf(targetPreviousSetting), targetTree);
                    const sourceCommentNodes = findNodesBetween(sourceTree, sourcePreviousSettingNode, sourceTree[sourceNodeIndex]);
                    if (targetNextSetting) {
                        const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetNextSetting);
                        const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes, targetCommentNodes);
                        if (targetCommentNode) {
                            return { index: targetTree.indexOf(targetCommentNode), insertAfter: true }; /* Insert after comment */
                        }
                        else {
                            return { index: targetTree.indexOf(targetNextSetting), insertAfter: false }; /* Insert before target next setting */
                        }
                    }
                    else {
                        const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetTree[targetTree.length - 1]);
                        const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes, targetCommentNodes);
                        if (targetCommentNode) {
                            return { index: targetTree.indexOf(targetCommentNode), insertAfter: true }; /* Insert after comment */
                        }
                        else {
                            return { index: targetTree.length - 1, insertAfter: true }; /* Insert at the end */
                        }
                    }
                }
            }
        }
        const sourceNextNode = sourceTree[sourceNodeIndex + 1];
        if (sourceNextNode) {
            /*
                Next node in source is a setting.
                Find the same setting in the target.
                Insert it before that setting
            */
            if (sourceNextNode.setting) {
                const targetNextSetting = findSettingNode(sourceNextNode.setting.key, targetTree);
                if (targetNextSetting) {
                    /* Insert before target's next setting */
                    return { index: targetTree.indexOf(targetNextSetting), insertAfter: false };
                }
            }
            /* Next node in source is a comment */
            else {
                const sourceNextSettingNode = findNextSettingNode(sourceNodeIndex, sourceTree);
                /*
                    Source has a setting defined after the setting to be added.
                    Find the same next setting in the target.
                    If found, insert after its previous setting so that comments are retrieved.
                    Otherwise, insert at the beginning.
                */
                if (sourceNextSettingNode) {
                    const targetNextSetting = findSettingNode(sourceNextSettingNode.setting.key, targetTree);
                    if (targetNextSetting) {
                        const targetPreviousSetting = findPreviousSettingNode(targetTree.indexOf(targetNextSetting), targetTree);
                        const sourceCommentNodes = findNodesBetween(sourceTree, sourceTree[sourceNodeIndex], sourceNextSettingNode);
                        if (targetPreviousSetting) {
                            const targetCommentNodes = findNodesBetween(targetTree, targetPreviousSetting, targetNextSetting);
                            const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes.reverse(), targetCommentNodes.reverse());
                            if (targetCommentNode) {
                                return { index: targetTree.indexOf(targetCommentNode), insertAfter: false }; /* Insert before comment */
                            }
                            else {
                                return { index: targetTree.indexOf(targetPreviousSetting), insertAfter: true }; /* Insert after target previous setting */
                            }
                        }
                        else {
                            const targetCommentNodes = findNodesBetween(targetTree, targetTree[0], targetNextSetting);
                            const targetCommentNode = findLastMatchingTargetCommentNode(sourceCommentNodes.reverse(), targetCommentNodes.reverse());
                            if (targetCommentNode) {
                                return { index: targetTree.indexOf(targetCommentNode), insertAfter: false }; /* Insert before comment */
                            }
                            else {
                                return { index: 0, insertAfter: false }; /* Insert at the beginning */
                            }
                        }
                    }
                }
            }
        }
    }
    /* Insert at the end */
    return { index: targetTree.length - 1, insertAfter: true };
}
function insertAtLocation(content, key, value, location, tree, formattingOptions) {
    let edits;
    /* Insert at the end */
    if (location.index === -1) {
        edits = setProperty(content, [key], value, formattingOptions);
    }
    else {
        edits = getEditToInsertAtLocation(content, key, value, location, tree, formattingOptions).map(edit => withFormatting(content, edit, formattingOptions)[0]);
    }
    return applyEdits(content, edits);
}
function getEditToInsertAtLocation(content, key, value, location, tree, formattingOptions) {
    const newProperty = `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    const eol = getEOL(formattingOptions, content);
    const node = tree[location.index];
    if (location.insertAfter) {
        const edits = [];
        /* Insert after a setting */
        if (node.setting) {
            edits.push({ offset: node.endOffset, length: 0, content: ',' + newProperty });
        }
        /* Insert after a comment */
        else {
            const nextSettingNode = findNextSettingNode(location.index, tree);
            const previousSettingNode = findPreviousSettingNode(location.index, tree);
            const previousSettingCommaOffset = previousSettingNode?.setting?.commaOffset;
            /* If there is a previous setting and it does not has comma then add it */
            if (previousSettingNode && previousSettingCommaOffset === undefined) {
                edits.push({ offset: previousSettingNode.endOffset, length: 0, content: ',' });
            }
            const isPreviouisSettingIncludesComment = previousSettingCommaOffset !== undefined && previousSettingCommaOffset > node.endOffset;
            edits.push({
                offset: isPreviouisSettingIncludesComment ? previousSettingCommaOffset + 1 : node.endOffset,
                length: 0,
                content: nextSettingNode ? eol + newProperty + ',' : eol + newProperty
            });
        }
        return edits;
    }
    else {
        /* Insert before a setting */
        if (node.setting) {
            return [{ offset: node.startOffset, length: 0, content: newProperty + ',' }];
        }
        /* Insert before a comment */
        const content = (tree[location.index - 1] && !tree[location.index - 1].setting /* previous node is comment */ ? eol : '')
            + newProperty
            + (findNextSettingNode(location.index, tree) ? ',' : '')
            + eol;
        return [{ offset: node.startOffset, length: 0, content }];
    }
}
function findSettingNode(key, tree) {
    return tree.filter(node => node.setting?.key === key)[0];
}
function findPreviousSettingNode(index, tree) {
    for (let i = index - 1; i >= 0; i--) {
        if (tree[i].setting) {
            return tree[i];
        }
    }
    return undefined;
}
function findNextSettingNode(index, tree) {
    for (let i = index + 1; i < tree.length; i++) {
        if (tree[i].setting) {
            return tree[i];
        }
    }
    return undefined;
}
function findNodesBetween(nodes, from, till) {
    const fromIndex = nodes.indexOf(from);
    const tillIndex = nodes.indexOf(till);
    return nodes.filter((node, index) => fromIndex < index && index < tillIndex);
}
function findLastMatchingTargetCommentNode(sourceComments, targetComments) {
    if (sourceComments.length && targetComments.length) {
        let index = 0;
        for (; index < targetComments.length && index < sourceComments.length; index++) {
            if (sourceComments[index].value !== targetComments[index].value) {
                return targetComments[index - 1];
            }
        }
        return targetComments[index - 1];
    }
    return undefined;
}
function parseSettings(content) {
    const nodes = [];
    let hierarchyLevel = -1;
    let startOffset;
    let key;
    const visitor = {
        onObjectBegin: (offset) => {
            hierarchyLevel++;
        },
        onObjectProperty: (name, offset, length) => {
            if (hierarchyLevel === 0) {
                // this is setting key
                startOffset = offset;
                key = name;
            }
        },
        onObjectEnd: (offset, length) => {
            hierarchyLevel--;
            if (hierarchyLevel === 0) {
                nodes.push({
                    startOffset,
                    endOffset: offset + length,
                    value: content.substring(startOffset, offset + length),
                    setting: {
                        key,
                        commaOffset: undefined
                    }
                });
            }
        },
        onArrayBegin: (offset, length) => {
            hierarchyLevel++;
        },
        onArrayEnd: (offset, length) => {
            hierarchyLevel--;
            if (hierarchyLevel === 0) {
                nodes.push({
                    startOffset,
                    endOffset: offset + length,
                    value: content.substring(startOffset, offset + length),
                    setting: {
                        key,
                        commaOffset: undefined
                    }
                });
            }
        },
        onLiteralValue: (value, offset, length) => {
            if (hierarchyLevel === 0) {
                nodes.push({
                    startOffset,
                    endOffset: offset + length,
                    value: content.substring(startOffset, offset + length),
                    setting: {
                        key,
                        commaOffset: undefined
                    }
                });
            }
        },
        onSeparator: (sep, offset, length) => {
            if (hierarchyLevel === 0) {
                if (sep === ',') {
                    let index = nodes.length - 1;
                    for (; index >= 0; index--) {
                        if (nodes[index].setting) {
                            break;
                        }
                    }
                    const node = nodes[index];
                    if (node) {
                        nodes.splice(index, 1, {
                            startOffset: node.startOffset,
                            endOffset: node.endOffset,
                            value: node.value,
                            setting: {
                                key: node.setting.key,
                                commaOffset: offset
                            }
                        });
                    }
                }
            }
        },
        onComment: (offset, length) => {
            if (hierarchyLevel === 0) {
                nodes.push({
                    startOffset: offset,
                    endOffset: offset + length,
                    value: content.substring(offset, offset + length),
                });
            }
        }
    };
    visit(content, visitor);
    return nodes;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NNZXJnZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vc2V0dGluZ3NNZXJnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUQsT0FBTyxFQUFlLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRixPQUFPLEVBQTJCLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hGLE9BQU8sS0FBSyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFFM0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxjQUFjLENBQUM7QUFDNUMsT0FBTyxFQUFFLDRCQUE0QixFQUFvQixNQUFNLG1CQUFtQixDQUFDO0FBU25GLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxzQkFBZ0MsRUFBRSxvQkFBMkMsRUFBRSxlQUF3QjtJQUN6SSxJQUFJLEtBQUssR0FBMEIsRUFBRSxDQUFDO0lBQ3RDLElBQUksZUFBZSxFQUFFLENBQUM7UUFDckIsS0FBSyxHQUFHLDZCQUE2QixDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ3hELENBQUM7U0FBTSxDQUFDO1FBQ1AsS0FBSyxHQUFHLDRCQUE0QixDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFhLEVBQUUsRUFBRSxPQUFPLEdBQWEsQ0FBQyxHQUFHLDRCQUE0QixFQUFFLENBQUMsQ0FBQztJQUNwRixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQixLQUFLLE1BQU0sR0FBRyxJQUFJ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LEVBQUUsRUFBMEIsRUFBRSxPQUFvQjtJQUNyRyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUNoRixNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQVUsQ0FBQyxDQUFDO0lBQzdILE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQVUsQ0FBQyxDQUFDO0lBQy9ILE1BQU0sT0FBTyxHQUFnQixJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRS9DLElBQUksSUFBSSxFQUFFLENBQUM7UUFDVixLQUFLLE1BQU0s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