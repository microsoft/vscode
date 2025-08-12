/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ISelectBoxOptions, ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';

export interface IFileTypeFilterOptions {
	enabled?: boolean;
	contextViewService: IContextViewService;
}

interface FileTypeOption {
	id: string;
	label: string;
	pattern: string;
}

export class FileTypeFilter extends Disposable {
	private static readonly FILE_TYPE_OPTIONS: FileTypeOption[] = [
		{ id: 'all', label: nls.localize('fileType.all', 'All files'), pattern: '' },
		{ id: 'ts', label: 'TypeScript (.ts)', pattern: '*.ts' },
		{ id: 'js', label: 'JavaScript (.js)', pattern: '*.js' },
		{ id: 'tsx', label: 'TypeScript React (.tsx)', pattern: '*.tsx' },
		{ id: 'jsx', label: 'JavaScript React (.jsx)', pattern: '*.jsx' },
		{ id: 'json', label: 'JSON (.json)', pattern: '*.json' },
		{ id: 'css', label: 'CSS (.css)', pattern: '*.css' },
		{ id: 'scss', label: 'SCSS (.scss)', pattern: '*.scss' },
		{ id: 'less', label: 'Less (.less)', pattern: '*.less' },
		{ id: 'html', label: 'HTML (.html)', pattern: '*.html' },
		{ id: 'xml', label: 'XML (.xml)', pattern: '*.xml' },
		{ id: 'md', label: 'Markdown (.md)', pattern: '*.md' },
		{ id: 'txt', label: 'Text (.txt)', pattern: '*.txt' },
		{ id: 'py', label: 'Python (.py)', pattern: '*.py' },
		{ id: 'java', label: 'Java (.java)', pattern: '*.java' },
		{ id: 'cs', label: 'C# (.cs)', pattern: '*.cs' },
		{ id: 'cpp', label: 'C++ (.cpp/.cc/.cxx)', pattern: '*.{cpp,cc,cxx,h,hpp}' },
		{ id: 'c', label: 'C (.c)', pattern: '*.{c,h}' },
		{ id: 'php', label: 'PHP (.php)', pattern: '*.php' },
		{ id: 'rb', label: 'Ruby (.rb)', pattern: '*.rb' },
		{ id: 'go', label: 'Go (.go)', pattern: '*.go' },
		{ id: 'rs', label: 'Rust (.rs)', pattern: '*.rs' },
		{ id: 'swift', label: 'Swift (.swift)', pattern: '*.swift' },
		{ id: 'kt', label: 'Kotlin (.kt)', pattern: '*.kt' },
		{ id: 'dart', label: 'Dart (.dart)', pattern: '*.dart' },
		{ id: 'vue', label: 'Vue (.vue)', pattern: '*.vue' },
		{ id: 'svelte', label: 'Svelte (.svelte)', pattern: '*.svelte' },
		{ id: 'yaml', label: 'YAML (.yml/.yaml)', pattern: '*.{yml,yaml}' },
		{ id: 'toml', label: 'TOML (.toml)', pattern: '*.toml' }
	];

	private selectBox: SelectBox;
	private selectedTypeId: string = 'all';
	private container: HTMLElement;

	private readonly _onDidChangeSelection = this._register(new Emitter<string>());
	readonly onDidChangeSelection: Event<string> = this._onDidChangeSelection.event;

	constructor(parent: HTMLElement, options: IFileTypeFilterOptions) {
		super();

		this.container = dom.append(parent, dom.$('.file-type-filter'));

		// Create label
		const label = dom.append(this.container, dom.$('.file-type-filter-label'));
		label.textContent = nls.localize('fileTypeFilter.label', 'File type:');

		// Create select box
		const selectBoxOptions: ISelectBoxOptions = {
			ariaLabel: nls.localize('fileTypeFilter.ariaLabel', 'Select file type to filter search results'),
			...defaultSelectBoxStyles
		};

		const options_array: ISelectOptionItem[] = FileTypeFilter.FILE_TYPE_OPTIONS.map(option => ({
			text: option.label,
			detail: option.pattern || nls.localize('fileTypeFilter.allTooltip', 'Search in all files')
		}));

		this.selectBox = this._register(new SelectBox(options_array, 0, options.contextViewService, defaultSelectBoxStyles, selectBoxOptions));
		this.selectBox.render(this.container);

		this._register(this.selectBox.onDidSelect(selection => {
			const selectedOption = FileTypeFilter.FILE_TYPE_OPTIONS[selection.index];
			this.selectFileType(selectedOption.id);
		}));

		if (!options.enabled) {
			this.hide();
		}
	}

	private selectFileType(typeId: string): void {
		if (this.selectedTypeId === typeId) {
			return;
		}

		this.selectedTypeId = typeId;
		this._onDidChangeSelection.fire(this.getSelectedPattern());
	}

	getSelectedPattern(): string {
		const selectedOption = FileTypeFilter.FILE_TYPE_OPTIONS.find(opt => opt.id === this.selectedTypeId);
		return selectedOption?.pattern || '';
	}

	getSelectedTypeId(): string {
		return this.selectedTypeId;
	}

	setSelectedType(typeId: string): void {
		const optionIndex = FileTypeFilter.FILE_TYPE_OPTIONS.findIndex(opt => opt.id === typeId);
		if (optionIndex >= 0) {
			this.selectBox.select(optionIndex);
			this.selectFileType(typeId);
		}
	}

	show(): void {
		this.container.style.display = 'block';
	}

	hide(): void {
		this.container.style.display = 'none';
	}

	focus(): void {
		this.selectBox.focus();
	}

	/**
	 * Parse file type shortcuts from search query (e.g., ":ts", ":md")
	 */
	static parseShortcutFromQuery(query: string): { typeId: string | null; cleanedQuery: string } {
		const shortcutRegex = /:([a-zA-Z]+)\b/;
		const match = query.match(shortcutRegex);

		if (match) {
			const shortcut = match[1].toLowerCase();
			const typeOption = this.FILE_TYPE_OPTIONS.find(opt => opt.id === shortcut);

			if (typeOption) {
				// Remove the shortcut from query
				const cleanedQuery = query.replace(shortcutRegex, '').trim();
				return { typeId: typeOption.id, cleanedQuery };
			}
		}

		return { typeId: null, cleanedQuery: query };
	}

	/**
	 * Get available shortcuts for autocomplete
	 */
	static getAvailableShortcuts(): string[] {
		return this.FILE_TYPE_OPTIONS
			.filter(opt => opt.id !== 'all')
			.map(opt => `:${opt.id}`);
	}
}
