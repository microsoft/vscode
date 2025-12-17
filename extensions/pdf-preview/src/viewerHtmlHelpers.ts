/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from './util/uuid';

/**
 * Options for generating toolbar HTML
 */
export interface ToolbarOptions {
	/** Include page navigation controls (prev/next, page input) */
	showPageNavigation?: boolean;
	/** Include download button */
	showDownload?: boolean;
	/** Include export PDF button */
	showExportPdf?: boolean;
	/** Include sync toggle button (visible by default for markdown, hidden until enabled for PDF) */
	syncToggleVisible?: boolean;
	/** Sync toggle should be active by default */
	syncToggleActive?: boolean;
	/** Default zoom value for the select */
	defaultZoom?: string;
	/** Available zoom options */
	zoomOptions?: Array<{ value: string; label: string; selected?: boolean }>;
}

/**
 * Default zoom options for preview toolbars
 */
export const DEFAULT_ZOOM_OPTIONS = [
	{ value: '0.5', label: '50%' },
	{ value: '0.75', label: '75%' },
	{ value: '1', label: '100%' },
	{ value: '1.25', label: '125%' },
	{ value: '1.5', label: '150%' },
	{ value: '2', label: '200%' },
	{ value: '3', label: '300%' },
];

/**
 * PDF-specific zoom options (includes fit modes)
 */
export const PDF_ZOOM_OPTIONS = [
	...DEFAULT_ZOOM_OPTIONS,
	{ value: 'fit', label: 'Fit Page' },
	{ value: 'fitWidth', label: 'Fit Width', selected: true },
];

/**
 * Markdown-specific zoom options (includes fit modes)
 */
export const MARKDOWN_ZOOM_OPTIONS = [
	...DEFAULT_ZOOM_OPTIONS.map(o => o.value === '1' ? { ...o, selected: true } : o),
	{ value: 'fitWidth', label: 'Fit Width' },
	{ value: 'fitWindow', label: 'Fit Window' },
];

/**
 * Escape HTML attribute value
 */
export function escapeAttribute(value: string): string {
	return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generate a nonce for Content Security Policy
 */
export function generateNonce(): string {
	return generateUuid();
}

/**
 * Get the SVG icon for find/search button
 */
export function getFindButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
}

/**
 * Get the SVG icon for zoom out button
 */
export function getZoomOutButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>`;
}

/**
 * Get the SVG icon for zoom in button
 */
export function getZoomInButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
}

/**
 * Get the SVG icon for fit width button
 */
export function getFitWidthButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
}

/**
 * Get the SVG icon for sync toggle button
 */
export function getSyncToggleButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
}

/**
 * Get the SVG icon for dark mode toggle button
 */
export function getDarkModeButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.5-.04-.99-.13-1.46A5.47 5.47 0 0 1 14.5 13a5.5 5.5 0 0 1-5.5-5.5c0-2.47 1.64-4.56 3.88-5.24A9.1 9.1 0 0 0 12 3z"/></svg>`;
}

/**
 * Get the SVG icon for download button
 */
export function getDownloadButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
}

/**
 * Get the SVG icon for previous/left arrow
 */
export function getPrevArrowSvg(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
}

/**
 * Get the SVG icon for next/right arrow
 */
export function getNextArrowSvg(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
}

/**
 * Get the SVG icon for close button
 */
export function getCloseButtonSvg(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
}

/**
 * Generate the findbar HTML (shared between PDF and Markdown)
 */
export function getFindbarHtml(): string {
	return `
	<div id="findbar" class="findbar hidden">
		<div class="findbar-input-container">
			<input type="text" id="find-input" class="findbar-input" placeholder="Find in document..." title="Find">
			<div class="findbar-buttons">
				<button class="findbar-button" id="find-prev" title="Previous match">
					${getPrevArrowSvg()}
				</button>
				<button class="findbar-button" id="find-next" title="Next match">
					${getNextArrowSvg()}
				</button>
			</div>
		</div>
		<div class="findbar-options">
			<label class="findbar-option">
				<input type="checkbox" id="find-highlight-all">
				<span>Highlight all</span>
			</label>
			<label class="findbar-option">
				<input type="checkbox" id="find-match-case">
				<span>Match case</span>
			</label>
		</div>
		<div class="findbar-status">
			<span id="find-results-count"></span>
		</div>
		<button class="findbar-close" id="find-close" title="Close">
			${getCloseButtonSvg()}
		</button>
	</div>`;
}

/**
 * Generate the loading HTML
 */
export function getLoadingHtml(message: string = 'Loading...'): string {
	return `
	<div id="loading">
		<div class="loading-spinner"></div>
		<p>${message}</p>
	</div>`;
}

/**
 * Generate the error container HTML
 */
export function getErrorContainerHtml(): string {
	return `
	<div id="error-container" style="display: none;">
		<p id="error-message"></p>
	</div>`;
}

/**
 * Generate zoom controls HTML
 */
export function getZoomControlsHtml(options: ToolbarOptions): string {
	const zoomOptions = options.zoomOptions || DEFAULT_ZOOM_OPTIONS;
	const optionsHtml = zoomOptions.map(opt =>
		`<option value="${opt.value}"${opt.selected ? ' selected' : ''}>${opt.label}</option>`
	).join('\n\t\t\t\t');

	return `
		<div class="toolbar-group toolbar-group-zoom">
			<button class="toolbar-button toolbar-button-icon" id="btn-zoom-out" title="Zoom Out">
				${getZoomOutButtonSvg()}
			</button>
			<select class="toolbar-select" id="zoom-select" title="Zoom Level">
				${optionsHtml}
			</select>
			<button class="toolbar-button toolbar-button-icon" id="btn-zoom-in" title="Zoom In">
				${getZoomInButtonSvg()}
			</button>
		</div>
		<div class="toolbar-divider"></div>
		<div class="toolbar-group">
			<button class="toolbar-button toolbar-button-icon" id="btn-fit-width" title="Fit to Width">
				${getFitWidthButtonSvg()}
			</button>
		</div>`;
}

/**
 * Generate the right toolbar group HTML (sync toggle, dark mode, download/export)
 */
export function getRightToolbarGroupHtml(options: ToolbarOptions): string {
	const syncToggleStyle = options.syncToggleVisible ? '' : ' style="display: none;"';
	const syncToggleClass = options.syncToggleActive ? ' active' : '';

	let buttonsHtml = `
			<button class="toolbar-button toolbar-button-icon sync-toggle-btn${syncToggleClass}" id="btn-sync-toggle" title="Toggle Editor Sync (Enabled)"${syncToggleStyle}>
				${getSyncToggleButtonSvg()}
			</button>
			<button class="toolbar-button toolbar-button-icon" id="btn-dark-mode" title="Toggle Dark Mode">
				${getDarkModeButtonSvg()}
			</button>`;

	if (options.showDownload) {
		buttonsHtml += `
			<button class="toolbar-button toolbar-button-icon" id="btn-download" title="Download PDF">
				${getDownloadButtonSvg()}
			</button>`;
	}

	if (options.showExportPdf) {
		buttonsHtml += `
			<button class="toolbar-button toolbar-button-icon" id="btn-export-pdf" title="Export to PDF">
				${getDownloadButtonSvg()}
			</button>`;
	}

	return `
		<div class="toolbar-group toolbar-group-right">
			${buttonsHtml}
		</div>`;
}

