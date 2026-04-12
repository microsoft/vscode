/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../widget/chatContentParts/media/chatInlineAnchorWidget.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { dirname } from '../../../../../base/common/resources.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { localize } from '../../../../../nls.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { InlineAnchorWidget } from '../widget/chatContentParts/chatInlineAnchorWidget.js';
import { setupCollapsibleToggle } from './chatDebugCollapsible.js';
const $ = DOM.$;
/**
 * Map a discovery type string to its corresponding settings key.
 */
function getSettingsKeyForDiscoveryType(discoveryType) {
    switch (discoveryType) {
        case 'prompt': return 'chat.promptFilesLocations';
        case 'instructions': return 'chat.instructionsFilesLocations';
        case 'agent': return 'chat.agentFilesLocations';
        case 'skill': return 'chat.agentSkillsLocations';
        case 'hook': return 'chat.hookFilesLocations';
        default: return undefined;
    }
}
/**
 * Get a display label for a file's location.
 * Extension files show the extension ID,
 * all other files show the relative (or tildified) parent folder path.
 */
function getFileLocationLabel(file, labelService, discoveryType) {
    if (file.extensionId) {
        return file.extensionId;
    }
    // Skills live inside individual skill folders (e.g. .github/skills/foo/SKILL.md),
    // so group by the parent of the skill folder for a more useful label.
    const parentDir = discoveryType === 'skill' ? dirname(dirname(file.uri)) : dirname(file.uri);
    return labelService.getUriLabel(parentDir, { relative: true });
}
/**
 * Create a file link element styled like the chat panel's InlineAnchorWidget.
 */
function createInlineFileLink(uri, displayText, fileKind, openerService, modelService, languageService, hoverService, labelService, disposables, hoverSuffix) {
    const link = $(`a.${InlineAnchorWidget.className}.show-file-icons`);
    link.tabIndex = -1;
    const iconEl = DOM.append(link, $('span.icon'));
    const iconClasses = getIconClasses(modelService, languageService, uri, fileKind);
    iconEl.classList.add(...iconClasses);
    DOM.append(link, $('span.icon-label', undefined, displayText));
    const relativeLabel = labelService.getUriLabel(uri, { relative: true });
    const hoverText = hoverSuffix ? `${relativeLabel} ${hoverSuffix}` : relativeLabel;
    disposables.add(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), link, hoverText));
    disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        openerService.open(uri);
    }));
    return link;
}
/**
 * Set up roving tabindex with arrow-key navigation on a list of rows.
 * The first row starts with tabIndex 0; the rest get -1.
 * Up/Down arrow keys move focus, Home/End jump to first/last.
 * Enter on a focused row activates the associated action.
 */
function setupFileListNavigation(listEl, rows, disposables) {
    if (rows.length === 0) {
        return;
    }
    for (let i = 0; i < rows.length; i++) {
        rows[i].element.tabIndex = i === 0 ? 0 : -1;
        rows[i].element.setAttribute('role', 'listitem');
    }
    disposables.add(DOM.addDisposableListener(listEl, DOM.EventType.KEY_DOWN, (e) => {
        const target = e.target;
        const index = rows.findIndex(r => r.element === target);
        if (index === -1) {
            return;
        }
        let nextIndex;
        switch (e.key) {
            case 'ArrowDown':
                nextIndex = Math.min(index + 1, rows.length - 1);
                break;
            case 'ArrowUp':
                nextIndex = Math.max(index - 1, 0);
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = rows.length - 1;
                break;
            case 'Enter': {
                rows[index].activate();
                e.preventDefault();
                return;
            }
        }
        if (nextIndex !== undefined && nextIndex !== index) {
            e.preventDefault();
            rows[index].element.tabIndex = -1;
            rows[nextIndex].element.tabIndex = 0;
            rows[nextIndex].element.focus();
        }
    }));
}
/**
 * Render a file list resolved content as a rich HTML element.
 */
export function renderCustomizationDiscoveryContent(content, openerService, modelService, languageService, hoverService, labelService, scrollable) {
    const disposables = new DisposableStore();
    const container = $('div.chat-debug-file-list');
    container.tabIndex = 0;
    const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
    DOM.append(container, $('div.chat-debug-file-list-title', undefined, localize('chatDebug.discoveryResults', "{0} Discovery Results", capitalizedType)));
    DOM.append(container, $('div.chat-debug-file-list-summary', undefined, localize('chatDebug.totalFiles', "Total files: {0}", content.files.length)));
    // Loaded files - grouped by source location
    const loaded = content.files.filter(f => f.status === 'loaded');
    if (loaded.length > 0) {
        const section = DOM.append(container, $('div.chat-debug-file-list-section'));
        DOM.append(section, $('div.chat-debug-file-list-section-title', undefined, localize('chatDebug.loadedFiles', "Loaded ({0})", loaded.length)));
        // Group files by location label (extension ID or folder path)
        const groups = new Map();
        for (const file of loaded) {
            const key = getFileLocationLabel(file, labelService, content.discoveryType);
            let group = groups.get(key);
            if (!group) {
                group = [];
                groups.set(key, group);
            }
            group.push(file);
        }
        const listEl = DOM.append(section, $('div.chat-debug-file-list-rows'));
        listEl.setAttribute('role', 'list');
        listEl.setAttribute('aria-label', localize('chatDebug.loadedFilesList', "Loaded files"));
        const rows = [];
        for (const [locationLabel, files] of groups) {
            // Group header - show the source location
            const groupHeader = DOM.append(listEl, $('div.chat-debug-file-list-group-header'));
            const firstFile = files[0];
            if (firstFile.extensionId) {
                const link = DOM.append(groupHeader, $('a.chat-debug-file-list-group-label.chat-debug-file-list-badge-link'));
                link.textContent = locationLabel;
                link.tabIndex = -1;
                disposables.add(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), link, localize('chatDebug.openExtension', "Open {0} in Extensions", firstFile.extensionId)));
                disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openerService.open(URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([firstFile.extensionId]))}`), { allowCommands: true });
                }));
            }
            else {
                DOM.append(groupHeader, $('span.chat-debug-file-list-group-label', undefined, locationLabel));
            }
            for (const file of files) {
                const row = DOM.append(listEl, $('div.chat-debug-file-list-row'));
                DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(Codicon.check)}`));
                row.appendChild(createInlineFileLink(file.uri, file.name ?? file.uri.path, FileKind.FILE, openerService, modelService, languageService, hoverService, labelService, disposables));
                const relativeLabel = labelService.getUriLabel(file.uri, { relative: true });
                row.setAttribute('aria-label', relativeLabel);
                const uri = file.uri;
                rows.push({ element: row, activate: () => openerService.open(uri) });
            }
        }
        setupFileListNavigation(listEl, rows, disposables);
    }
    // Skipped files - grouped by skip reason
    const skipped = content.files.filter(f => f.status === 'skipped');
    if (skipped.length > 0) {
        const section = DOM.append(container, $('div.chat-debug-file-list-section'));
        DOM.append(section, $('div.chat-debug-file-list-section-title', undefined, localize('chatDebug.skippedFiles', "Skipped ({0})", skipped.length)));
        // Group files by skip reason
        const groups = new Map();
        for (const file of skipped) {
            const key = file.skipReason ?? localize('chatDebug.unknown', "unknown");
            let group = groups.get(key);
            if (!group) {
                group = [];
                groups.set(key, group);
            }
            group.push(file);
        }
        const listEl = DOM.append(section, $('div.chat-debug-file-list-rows'));
        listEl.setAttribute('role', 'list');
        listEl.setAttribute('aria-label', localize('chatDebug.skippedFilesList', "Skipped files"));
        const rows = [];
        for (const [reasonLabel, files] of groups) {
            // Group header - show the skip reason
            const groupHeader = DOM.append(listEl, $('div.chat-debug-file-list-group-header'));
            DOM.append(groupHeader, $('span.chat-debug-file-list-group-label', undefined, reasonLabel));
            for (const file of files) {
                const row = DOM.append(listEl, $('div.chat-debug-file-list-row'));
                DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(Codicon.close)}`));
                // Build per-file detail (error message / duplicate info)
                let detail = '';
                if (file.errorMessage) {
                    detail += file.errorMessage;
                }
                if (file.duplicateOf) {
                    if (detail) {
                        detail += ', ';
                    }
                    detail += localize('chatDebug.duplicateOf', "duplicate of {0}", file.duplicateOf.path);
                }
                row.appendChild(createInlineFileLink(file.uri, file.name ?? file.uri.path, FileKind.FILE, openerService, modelService, languageService, hoverService, labelService, disposables));
                if (detail) {
                    DOM.append(row, $('span.chat-debug-file-list-detail', undefined, ` (${detail})`));
                }
                const relativeLabel = labelService.getUriLabel(file.uri, { relative: true });
                row.setAttribute('aria-label', relativeLabel);
                const uri = file.uri;
                rows.push({ element: row, activate: () => openerService.open(uri) });
            }
        }
        setupFileListNavigation(listEl, rows, disposables);
    }
    // Source folders (paths attempted) - collapsible, initially collapsed
    if (content.sourceFolders && content.sourceFolders.length > 0) {
        const sectionEl = DOM.append(container, $('div.chat-debug-message-section'));
        const header = DOM.append(sectionEl, $('div.chat-debug-message-section-header'));
        const chevron = DOM.append(header, $('span.chat-debug-message-section-chevron'));
        DOM.append(header, $('span.chat-debug-message-section-title', undefined, localize('chatDebug.sourceFolders', "Sources ({0})", content.sourceFolders.length)));
        // Settings gear button on the right side of the header
        const settingsKey = getSettingsKeyForDiscoveryType(content.discoveryType);
        if (settingsKey) {
            const gearBtn = disposables.add(new Button(header, {
                title: localize('chatDebug.openSettingsTooltip', "Configure locations"),
                ariaLabel: localize('chatDebug.configureLocations', "Configure locations"),
                hoverDelegate: getDefaultHoverDelegate('mouse'),
            }));
            gearBtn.icon = Codicon.settingsGear;
            gearBtn.element.classList.add('chat-debug-settings-gear');
            disposables.add(DOM.addDisposableListener(gearBtn.element, DOM.EventType.MOUSE_ENTER, () => {
                header.classList.add('chat-debug-settings-gear-header-passthrough');
            }));
            disposables.add(DOM.addDisposableListener(gearBtn.element, DOM.EventType.MOUSE_LEAVE, () => {
                header.classList.remove('chat-debug-settings-gear-header-passthrough');
            }));
            disposables.add(gearBtn.onDidClick((e) => {
                if (e) {
                    DOM.EventHelper.stop(e, true);
                }
                openerService.open(URI.parse(`command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify([`@id:${settingsKey}`]))}`), { allowCommands: true });
            }));
        }
        const contentEl = DOM.append(sectionEl, $('div.chat-debug-source-folder-content'));
        contentEl.tabIndex = 0;
        contentEl.setAttribute('role', 'region');
        contentEl.setAttribute('aria-label', localize('chatDebug.sourceFoldersContent', "Source folders"));
        const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
        const sourcesCaption = capitalizedType.endsWith('s') ? capitalizedType : capitalizedType + 's';
        DOM.append(contentEl, $('div.chat-debug-source-folder-note', undefined, localize('chatDebug.sourcesNote', "{0} were discovered by checking the following sources in order:", sourcesCaption)));
        for (let i = 0; i < content.sourceFolders.length; i++) {
            const folder = content.sourceFolders[i];
            const row = DOM.append(contentEl, $('div.chat-debug-source-folder-row'));
            DOM.append(row, $('span.chat-debug-source-folder-index', undefined, `${i + 1}.`));
            DOM.append(row, $('span.chat-debug-source-folder-label', undefined, folder.uri.path));
        }
        setupCollapsibleToggle(chevron, header, contentEl, disposables, /* initiallyCollapsed */ true, scrollable);
    }
    return { element: container, disposables };
}
/**
 * Convert a file list content to plain text for clipboard / editor output.
 */
export function fileListToPlainText(content) {
    const lines = [];
    const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
    lines.push(localize('chatDebug.plainText.discoveryResults', "{0} Discovery Results", capitalizedType));
    lines.push(localize('chatDebug.plainText.totalFiles', "Total files: {0}", content.files.length));
    lines.push('');
    const loaded = content.files.filter(f => f.status === 'loaded');
    const skipped = content.files.filter(f => f.status === 'skipped');
    if (loaded.length > 0) {
        lines.push(localize('chatDebug.plainText.loaded', "Loaded ({0})", loaded.length));
        // Group by location
        const groups = new Map();
        for (const f of loaded) {
            const parentDir = content.discoveryType === 'skill' ? dirname(dirname(f.uri)) : dirname(f.uri);
            const key = f.extensionId ?? parentDir.path;
            let group = groups.get(key);
            if (!group) {
                group = [];
                groups.set(key, group);
            }
            group.push(f);
        }
        for (const [locationLabel, files] of groups) {
            lines.push(`  ${locationLabel}`);
            for (const f of files) {
                const label = f.name ?? f.uri.path;
                lines.push(`    \u2713 ${label}`);
            }
        }
        lines.push('');
    }
    if (skipped.length > 0) {
        lines.push(localize('chatDebug.plainText.skipped', "Skipped ({0})", skipped.length));
        // Group by skip reason
        const skippedGroups = new Map();
        for (const f of skipped) {
            const key = f.skipReason ?? localize('chatDebug.plainText.unknown', "unknown");
            let group = skippedGroups.get(key);
            if (!group) {
                group = [];
                skippedGroups.set(key, group);
            }
            group.push(f);
        }
        for (const [reasonLabel, files] of skippedGroups) {
            lines.push(`  ${reasonLabel}`);
            for (const f of files) {
                const label = f.name ?? f.uri.path;
                let detail = `    \u2717 ${label}`;
                if (f.errorMessage || f.duplicateOf) {
                    const parts = [];
                    if (f.errorMessage) {
                        parts.push(f.errorMessage);
                    }
                    if (f.duplicateOf) {
                        parts.push(localize('chatDebug.plainText.duplicateOf', "duplicate of {0}", f.duplicateOf.path));
                    }
                    detail += ` (${parts.join(', ')})`;
                }
                lines.push(detail);
            }
        }
    }
    if (content.sourceFolders && content.sourceFolders.length > 0) {
        lines.push('');
        lines.push(localize('chatDebug.plainText.sourceFolders', "Sources ({0})", content.sourceFolders.length));
        for (const folder of content.sourceFolders) {
            lines.push(`  ${folder.uri.path}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEN1c3RvbWl6YXRpb25EaXNjb3ZlcnlSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdEN1c3RvbWl6YXRpb25EaXNjb3ZlcnlSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLDZEQUE2RCxDQUFDO0FBQ3JFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRXpGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFLekUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFbkUsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVoQjs7R0FFRztBQUNILFNBQVMsOEJBQThC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