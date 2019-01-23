/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./quickOutline';
import * as nls from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { matchesFuzzy } from 'vs/base/common/filters';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as strings from 'vs/base/common/strings';
import { IContext, IHighlight, QuickOpenEntryGroup, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus, Mode } from 'vs/base/parts/quickopen/common/quickOpen';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { DocumentSymbol, DocumentSymbolProviderRegistry, symbolKindToCssClass } from 'vs/editor/common/modes';
import { getDocumentSymbols } from 'vs/editor/contrib/quickOpen/quickOpen';
import { BaseEditorQuickOpenAction, IDecorator } from 'vs/editor/standalone/browser/quickOpen/editorQuickOpen';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

let SCOPE_PREFIX = ':';

export class SymbolEntry extends QuickOpenEntryGroup {
	private name: string;
	private type: string;
	private description: string;
	private range: Range;
	private editor: ICodeEditor;
	private decorator: IDecorator;

	constructor(name: string, type: string, description: string, range: Range, highlights: IHighlight[], editor: ICodeEditor, decorator: IDecorator) {
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

	public getRange(): Range {
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
		this.editor.revealRangeInCenter(range, ScrollType.Smooth);
		this.editor.focus();

		return true;
	}

	private runPreview(): boolean {

		// Select Outline Position
		let range = this.toSelection();
		this.editor.revealRangeInCenter(range, ScrollType.Smooth);

		// Decorate if possible
		this.decorator.decorateLine(this.range, this.editor);

		return false;
	}

	private toSelection(): Range {
		return new Range(
			this.range.startLineNumber,
			this.range.startColumn || 1,
			this.range.startLineNumber,
			this.range.startColumn || 1
		);
	}
}

export class QuickOutlineAction extends BaseEditorQuickOpenAction {

	constructor() {
		super(nls.localize('quickOutlineActionInput', "Type the name of an identifier you wish to navigate to"), {
			id: 'editor.action.quickOutline',
			label: nls.localize('QuickOutlineAction.label', "Go to Symbol..."),
			alias: 'Go to Symbol...',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: 'navigation',
				order: 3
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {

		let model = editor.getModel();

		if (!DocumentSymbolProviderRegistry.has(model)) {
			return null;
		}

		// Resolve outline
		return getDocumentSymbols(model, true, CancellationToken.None).then((result: DocumentSymbol[]) => {
			if (result.length === 0) {
				return;
			}

			this._run(editor, result);
		});
	}

	private _run(editor: ICodeEditor, result: DocumentSymbol[]): void {
		this._show(this.getController(editor), {
			getModel: (value: string): QuickOpenModel => {
				return new QuickOpenModel(this.toQuickOpenEntries(editor, result, value));
			},

			getAutoFocus: (searchValue: string): IAutoFocus => {
				// Remove any type pattern (:) from search value as needed
				if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
					searchValue = searchValue.substr(SCOPE_PREFIX.length);
				}

				return {
					autoFocusPrefixMatch: searchValue,
					autoFocusFirstEntry: !!searchValue
				};
			}
		});
	}

	private symbolEntry(name: string, type: string, description: string, range: IRange, highlights: IHighlight[], editor: ICodeEditor, decorator: IDecorator): SymbolEntry {
		return new SymbolEntry(name, type, description, Range.lift(range), highlights, editor, decorator);
	}

	private toQuickOpenEntries(editor: ICodeEditor, flattened: DocumentSymbol[], searchValue: string): SymbolEntry[] {
		const controller = this.getController(editor);

		let results: SymbolEntry[] = [];

		// Convert to Entries
		let normalizedSearchValue = searchValue;
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			normalizedSearchValue = normalizedSearchValue.substr(SCOPE_PREFIX.length);
		}

		for (const element of flattened) {
			let label = strings.trim(element.name);

			// Check for meatch
			let highlights = matchesFuzzy(normalizedSearchValue, label);
			if (highlights) {

				// Show parent scope as description
				let description: string | null = null;
				if (element.containerName) {
					description = element.containerName;
				}

				// Add
				results.push(this.symbolEntry(label, symbolKindToCssClass(element.kind), description, element.range, highlights, editor, controller));
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
			let currentType: string | null = null;
			let currentResult: SymbolEntry | null = null;
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
		let r = elementAName.localeCompare(elementBName);
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
		let r = elementAType.localeCompare(elementBType);
		if (r !== 0) {
			return r;
		}

		// Special sort when searching in scoped mode
		if (searchValue) {
			let elementAName = elementA.getLabel().toLowerCase();
			let elementBName = elementB.getLabel().toLowerCase();

			// Compare by name
			let r = elementAName.localeCompare(elementBName);
			if (r !== 0) {
				return r;
			}
		}

		// Default to sort by range
		let elementARange = elementA.getRange();
		let elementBRange = elementB.getRange();
		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}
}

registerEditorAction(QuickOutlineAction);
