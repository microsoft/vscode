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
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IChatDebugEventFileListContent } from '../../common/chatDebugService.js';
import { InlineAnchorWidget } from '../widget/chatContentParts/chatInlineAnchorWidget.js';
import { setupCollapsibleToggle } from './chatDebugMessageContentRenderer.js';

const $ = DOM.$;

/**
 * Map a discovery type string to its corresponding settings key.
 */
function getSettingsKeyForDiscoveryType(discoveryType: string): string | undefined {
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
function getFileLocationLabel(file: { uri: URI; storage?: string; extensionId?: string }, labelService: ILabelService): string {
	if (file.extensionId) {
		return file.extensionId;
	}
	return labelService.getUriLabel(dirname(file.uri), { relative: true });
}

/**
 * Create a file link element styled like the chat panel's InlineAnchorWidget.
 */
function createInlineFileLink(uri: URI, displayText: string, fileKind: FileKind, openerService: IOpenerService, modelService: IModelService, languageService: ILanguageService, hoverService: IHoverService, labelService: ILabelService, disposables: DisposableStore, hoverSuffix?: string): HTMLElement {
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
function setupFileListNavigation(listEl: HTMLElement, rows: { element: HTMLElement; activate: () => void }[], disposables: DisposableStore): void {
	if (rows.length === 0) {
		return;
	}

	for (let i = 0; i < rows.length; i++) {
		rows[i].element.tabIndex = i === 0 ? 0 : -1;
		rows[i].element.setAttribute('role', 'listitem');
	}

	disposables.add(DOM.addDisposableListener(listEl, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		const index = rows.findIndex(r => r.element === target);
		if (index === -1) {
			return;
		}

		let nextIndex: number | undefined;
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
 * Append a location badge to a row. If the file comes from an extension,
 * the badge is a clickable link that opens the extension in the marketplace.
 */
function appendLocationBadge(row: HTMLElement, file: { extensionId?: string }, badgeText: string, cssClass: string, openerService: IOpenerService, hoverService: IHoverService, disposables: DisposableStore): void {
	if (file.extensionId) {
		const link = DOM.append(row, $(`a.${cssClass}.chat-debug-file-list-badge-link`));
		link.textContent = badgeText;
		link.tabIndex = -1;
		disposables.add(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), link, localize('chatDebug.openExtension', "Open {0} in Extensions", file.extensionId)));
		disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			openerService.open(URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([file.extensionId]))}`), { allowCommands: true });
		}));
	} else {
		DOM.append(row, $(`span.${cssClass}`, undefined, badgeText));
	}
}

/**
 * Render a file list resolved content as a rich HTML element.
 */
export function renderFileListContent(content: IChatDebugEventFileListContent, openerService: IOpenerService, modelService: IModelService, languageService: ILanguageService, hoverService: IHoverService, labelService: ILabelService): { element: HTMLElement; disposables: DisposableStore } {
	const disposables = new DisposableStore();
	const container = $('div.chat-debug-file-list');
	container.tabIndex = 0;

	const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
	DOM.append(container, $('div.chat-debug-file-list-title', undefined, localize('chatDebug.discoveryResults', "{0} Discovery Results", capitalizedType)));
	DOM.append(container, $('div.chat-debug-file-list-summary', undefined, localize('chatDebug.totalFiles', "Total files: {0}", content.files.length)));

	// Loaded files
	const loaded = content.files.filter(f => f.status === 'loaded');
	if (loaded.length > 0) {
		const section = DOM.append(container, $('div.chat-debug-file-list-section'));
		DOM.append(section, $('div.chat-debug-file-list-section-title', undefined,
			localize('chatDebug.loadedFiles', "Loaded ({0})", loaded.length)));

		const listEl = DOM.append(section, $('div.chat-debug-file-list-rows'));
		listEl.setAttribute('role', 'list');
		listEl.setAttribute('aria-label', localize('chatDebug.loadedFilesList', "Loaded files"));

		const rows: { element: HTMLElement; activate: () => void }[] = [];
		for (const file of loaded) {
			const row = DOM.append(listEl, $('div.chat-debug-file-list-row'));
			DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(Codicon.check)}`));
			const locationBadgeText = localize('chatDebug.locationBadge', " ({0})", getFileLocationLabel(file, labelService));
			// Only include location in tooltip when it's an extension ID (path would be redundant)
			const hoverSuffix = file.extensionId ? locationBadgeText.trim() : undefined;
			row.appendChild(createInlineFileLink(file.uri, file.name ?? file.uri.path, FileKind.FILE, openerService, modelService, languageService, hoverService, labelService, disposables, hoverSuffix));
			appendLocationBadge(row, file, locationBadgeText, 'chat-debug-file-list-badge', openerService, hoverService, disposables);
			const relativeLabel = labelService.getUriLabel(file.uri, { relative: true });
			row.setAttribute('aria-label', relativeLabel);
			const uri = file.uri;
			rows.push({ element: row, activate: () => openerService.open(uri) });
		}
		setupFileListNavigation(listEl, rows, disposables);
	}

	// Skipped files
	const skipped = content.files.filter(f => f.status === 'skipped');
	if (skipped.length > 0) {
		const section = DOM.append(container, $('div.chat-debug-file-list-section'));
		DOM.append(section, $('div.chat-debug-file-list-section-title', undefined,
			localize('chatDebug.skippedFiles', "Skipped ({0})", skipped.length)));

		const listEl = DOM.append(section, $('div.chat-debug-file-list-rows'));
		listEl.setAttribute('role', 'list');
		listEl.setAttribute('aria-label', localize('chatDebug.skippedFilesList', "Skipped files"));

		const rows: { element: HTMLElement; activate: () => void }[] = [];
		for (const file of skipped) {
			const row = DOM.append(listEl, $('div.chat-debug-file-list-row'));
			DOM.append(row, $(`span.chat-debug-file-list-icon${ThemeIcon.asCSSSelector(Codicon.close)}`));

			let reasonText = ` (${file.skipReason ?? localize('chatDebug.unknown', "unknown")}`;
			if (file.errorMessage) {
				reasonText += `: ${file.errorMessage}`;
			}
			if (file.duplicateOf) {
				reasonText += localize('chatDebug.duplicateOf', ", duplicate of {0}", file.duplicateOf.path);
			}
			reasonText += ')';
			// Only include reason in tooltip when it's an extension file (path-based location is redundant)
			const skippedHoverSuffix = file.extensionId ? reasonText.trim() : undefined;
			row.appendChild(createInlineFileLink(file.uri, file.name ?? file.uri.path, FileKind.FILE, openerService, modelService, languageService, hoverService, labelService, disposables, skippedHoverSuffix));
			appendLocationBadge(row, file, reasonText, 'chat-debug-file-list-detail', openerService, hoverService, disposables);
			const relativeLabel = labelService.getUriLabel(file.uri, { relative: true });
			row.setAttribute('aria-label', relativeLabel);
			const uri = file.uri;
			rows.push({ element: row, activate: () => openerService.open(uri) });
		}
		setupFileListNavigation(listEl, rows, disposables);
	}

	// Source folders (paths attempted) - collapsible, initially collapsed
	if (content.sourceFolders && content.sourceFolders.length > 0) {
		const sectionEl = DOM.append(container, $('div.chat-debug-message-section'));

		const header = DOM.append(sectionEl, $('div.chat-debug-message-section-header'));

		const chevron = DOM.append(header, $('span.chat-debug-message-section-chevron'));
		DOM.append(header, $('span.chat-debug-message-section-title', undefined,
			localize('chatDebug.sourceFolders', "Sources ({0})", content.sourceFolders.length)));

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
		DOM.append(contentEl, $('div.chat-debug-source-folder-note', undefined,
			localize('chatDebug.sourcesNote', "{0} were discovered by checking the following sources in order:", sourcesCaption)));
		for (let i = 0; i < content.sourceFolders.length; i++) {
			const folder = content.sourceFolders[i];
			const row = DOM.append(contentEl, $('div.chat-debug-source-folder-row'));
			DOM.append(row, $('span.chat-debug-source-folder-index', undefined, `${i + 1}.`));
			DOM.append(row, $('span.chat-debug-source-folder-label', undefined, folder.uri.path));
		}

		setupCollapsibleToggle(chevron, header, contentEl, disposables, /* initiallyCollapsed */ true);
	}

	return { element: container, disposables };
}

/**
 * Convert a file list content to plain text for clipboard / editor output.
 */
export function fileListToPlainText(content: IChatDebugEventFileListContent): string {
	const lines: string[] = [];
	const capitalizedType = content.discoveryType.charAt(0).toUpperCase() + content.discoveryType.slice(1);
	lines.push(localize('chatDebug.plainText.discoveryResults', "{0} Discovery Results", capitalizedType));
	lines.push(localize('chatDebug.plainText.totalFiles', "Total files: {0}", content.files.length));
	lines.push('');

	const loaded = content.files.filter(f => f.status === 'loaded');
	const skipped = content.files.filter(f => f.status === 'skipped');

	if (loaded.length > 0) {
		lines.push(localize('chatDebug.plainText.loaded', "Loaded ({0})", loaded.length));
		for (const f of loaded) {
			const label = f.name ?? f.uri.path;
			const locationLabel = f.extensionId ?? dirname(f.uri).path;
			lines.push(`  \u2713 ${label} - ${f.uri.path} (${locationLabel})`);
		}
		lines.push('');
	}

	if (skipped.length > 0) {
		lines.push(localize('chatDebug.plainText.skipped', "Skipped ({0})", skipped.length));
		for (const f of skipped) {
			const label = f.name ?? f.uri.path;
			const reason = f.skipReason ?? localize('chatDebug.plainText.unknown', "unknown");
			let detail = `  \u2717 ${label} (${reason}`;
			if (f.errorMessage) {
				detail += `: ${f.errorMessage}`;
			}
			if (f.duplicateOf) {
				detail += localize('chatDebug.plainText.duplicateOf', ", duplicate of {0}", f.duplicateOf.path);
			}
			detail += ')';
			lines.push(detail);
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
