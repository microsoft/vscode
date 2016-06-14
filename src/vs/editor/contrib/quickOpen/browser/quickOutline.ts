/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import 'vs/css!./quickOutline';
import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {matchesFuzzy} from 'vs/base/common/filters';
import * as strings from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {IContext, IHighlight, QuickOpenEntryGroup, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {IAutoFocus, Mode} from 'vs/base/parts/quickopen/common/quickOpen';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {ICommonCodeEditor, IEditorActionDescriptorData, IRange} from 'vs/editor/common/editorCommon';
import {SymbolInformation, SymbolKind, DocumentSymbolProviderRegistry} from 'vs/editor/common/modes';
import {BaseEditorQuickOpenAction, IDecorator} from './editorQuickOpen';
import {getDocumentSymbols, IOutline} from 'vs/editor/contrib/quickOpen/common/quickOpen';

let SCOPE_PREFIX = ':';

class SymbolEntry extends QuickOpenEntryGroup {
	private name: string;
	private type: string;
	private description: string;
	private range: IRange;
	private editor: ICommonCodeEditor;
	private decorator: IDecorator;

	constructor(name: string, type: string, description: string, range: IRange, highlights: IHighlight[], editor: ICommonCodeEditor, decorator: IDecorator) {
		super();

		this.name = name;
		this.type = type;
		this.description = description;
		this.range = range;
		this.setHighlights(highlights);
		this.editor = editor;
		this.decorator = decorator;
	}

	public getLabel(): string {
		return this.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, symbols", this.name);
	}

	public getIcon(): string {
		return this.type;
	}

	public getDescription(): string {
		return this.description;
	}

	public getType(): string {
		return this.type;
	}

	public getRange(): IRange {
		return this.range;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	private runOpen(context: IContext): boolean {

		// Apply selection and focus
		let range = this.toSelection();
		this.editor.setSelection(range);
		this.editor.revealRangeInCenter(range);
		this.editor.focus();

		return true;
	}

	private runPreview(): boolean {

		// Select Outline Position
		let range = this.toSelection();
		this.editor.revealRangeInCenter(range);

		// Decorate if possible
		this.decorator.decorateLine(this.range, this.editor);

		return false;
	}

	private toSelection(): IRange {
		return {
			startLineNumber: this.range.startLineNumber,
			startColumn: this.range.startColumn || 1,
			endLineNumber: this.range.startLineNumber,
			endColumn: this.range.startColumn || 1
		};
	}
}

export class QuickOutlineAction extends BaseEditorQuickOpenAction {

	public static ID = 'editor.action.quickOutline';

	private cachedResult: SymbolInformation[];

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor) {
		super(descriptor, editor, nls.localize('QuickOutlineAction.label', "Go to Symbol..."), Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);
	}

	public getGroupId(): string {
		return '1_goto/5_visitSymbol';
	}

	public isSupported(): boolean {
		return (DocumentSymbolProviderRegistry.has(this.editor.getModel()) && super.isSupported());
	}

	public run(): TPromise<boolean> {
		let model = this.editor.getModel();

		if (!DocumentSymbolProviderRegistry.has(model)) {
			return null;
		}

		// Resolve outline
		let promise = getDocumentSymbols(model);
		return promise.then((result: IOutline) => {
			if (result.entries.length > 0) {

				// Cache result
				this.cachedResult = result.entries;

				return super.run();
			}

			return TPromise.as(true);
		}, (err) => {
			onUnexpectedError(err);
			return false;
		});
	}

	_getModel(value: string): QuickOpenModel {
		return new QuickOpenModel(this.toQuickOpenEntries(this.cachedResult, value));
	}

	_getAutoFocus(searchValue: string): IAutoFocus {

		// Remove any type pattern (:) from search value as needed
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			searchValue = searchValue.substr(SCOPE_PREFIX.length);
		}

		return {
			autoFocusPrefixMatch: searchValue,
			autoFocusFirstEntry: !!searchValue
		};
	}

	_getInputAriaLabel(): string {
		return nls.localize('quickOutlineActionInput', "Type the name of an identifier you wish to navigate to");
	}

	private toQuickOpenEntries(flattened: SymbolInformation[], searchValue: string): SymbolEntry[] {
		let results: SymbolEntry[] = [];

		// Convert to Entries
		let normalizedSearchValue = searchValue;
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			normalizedSearchValue = normalizedSearchValue.substr(SCOPE_PREFIX.length);
		}

		for (let i = 0; i < flattened.length; i++) {
			let element = flattened[i];
			let label = strings.trim(element.name);

			// Check for meatch
			let highlights = matchesFuzzy(normalizedSearchValue, label);
			if (highlights) {

				// Show parent scope as description
				let description: string = null;
				if (element.containerName) {
					description = element.containerName;
				}

				// Add
				results.push(new SymbolEntry(label, SymbolKind.from(element.kind), description, element.location.range, highlights, this.editor, this));
			}
		}

		// Sort properly if actually searching
		if (searchValue) {
			if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
				results = results.sort(this.sortScoped.bind(this, searchValue.toLowerCase()));
			} else {
				results = results.sort(this.sortNormal.bind(this, searchValue.toLowerCase()));
			}
		}

		// Mark all type groups
		if (results.length > 0 && searchValue.indexOf(SCOPE_PREFIX) === 0) {
			let currentType: string = null;
			let currentResult: SymbolEntry = null;
			let typeCounter = 0;

			for (let i = 0; i < results.length; i++) {
				let result = results[i];

				// Found new type
				if (currentType !== result.getType()) {

					// Update previous result with count
					if (currentResult) {
						currentResult.setGroupLabel(this.typeToLabel(currentType, typeCounter));
					}

					currentType = result.getType();
					currentResult = result;
					typeCounter = 1;

					result.setShowBorder(i > 0);
				}

				// Existing type, keep counting
				else {
					typeCounter++;
				}
			}

			// Update previous result with count
			if (currentResult) {
				currentResult.setGroupLabel(this.typeToLabel(currentType, typeCounter));
			}
		}

		// Mark first entry as outline
		else if (results.length > 0) {
			results[0].setGroupLabel(nls.localize('symbols', "symbols ({0})", results.length));
		}

		return results;
	}

	private typeToLabel(type: string, count: number): string {
		switch (type) {
			case 'module': return nls.localize('modules', "modules ({0})", count);
			case 'class': return nls.localize('class', "classes ({0})", count);
			case 'interface': return nls.localize('interface', "interfaces ({0})", count);
			case 'method': return nls.localize('method', "methods ({0})", count);
			case 'function': return nls.localize('function', "functions ({0})", count);
			case 'property': return nls.localize('property', "properties ({0})", count);
			case 'variable': return nls.localize('variable', "variables ({0})", count);
			case 'var': return nls.localize('variable2', "variables ({0})", count);
			case 'constructor': return nls.localize('_constructor', "constructors ({0})", count);
			case 'call': return nls.localize('call', "calls ({0})", count);
		}

		return type;
	}

	private sortNormal(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {
		let elementAName = elementA.getLabel().toLowerCase();
		let elementBName = elementB.getLabel().toLowerCase();

		// Compare by name
		let r = strings.localeCompare(elementAName, elementBName);
		if (r !== 0) {
			return r;
		}

		// If name identical sort by range instead
		let elementARange = elementA.getRange();
		let elementBRange = elementB.getRange();
		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	private sortScoped(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {

		// Remove scope char
		searchValue = searchValue.substr(SCOPE_PREFIX.length);

		// Sort by type first if scoped search
		let elementAType = elementA.getType();
		let elementBType = elementB.getType();
		let r = strings.localeCompare(elementAType, elementBType);
		if (r !== 0) {
			return r;
		}

		// Special sort when searching in scoped mode
		if (searchValue) {
			let elementAName = elementA.getLabel().toLowerCase();
			let elementBName = elementB.getLabel().toLowerCase();

			// Compare by name
			let r = strings.localeCompare(elementAName, elementBName);
			if (r !== 0) {
				return r;
			}
		}

		// Default to sort by range
		let elementARange = elementA.getRange();
		let elementBRange = elementB.getRange();
		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	_onClose(canceled: boolean): void {
		super._onClose(canceled);

		// Clear Cache
		this.cachedResult = null;
	}

	public dispose(): void {
		super.dispose();

		// Clear Cache
		this.cachedResult = null;
	}
}