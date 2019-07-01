/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./quickOutline';
import { CancellationToken } from 'vs/base/common/cancellation';
import { matchesFuzzy } from 'vs/base/common/filters';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as strings from 'vs/base/common/strings';
import { IHighlight, QuickOpenEntryGroup, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus, Mode, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { DocumentSymbol, DocumentSymbolProviderRegistry, symbolKindToCssClass } from 'vs/editor/common/modes';
import { getDocumentSymbols } from 'vs/editor/contrib/quickOpen/quickOpen';
import { BaseEditorQuickOpenAction, IDecorator } from 'vs/editor/standalone/browser/quickOpen/editorQuickOpen';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { QuickOutlineNLS } from 'vs/editor/common/standaloneStrings';

let SCOPE_PREFIX = ':';

export class SymbolEntry extends QuickOpenEntryGroup {
	private readonly name: string;
	private readonly type: string;
	private readonly description: string | undefined;
	private readonly range: Range;
	private readonly editor: ICodeEditor;
	private readonly decorator: IDecorator;

	constructor(name: string, type: string, description: string | undefined, range: Range, highlights: IHighlight[], editor: ICodeEditor, decorator: IDecorator) {
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
		return strings.format(QuickOutlineNLS.entryAriaLabel, this.name);
	}

	public getIcon(): string {
		return this.type;
	}

	public getDescription(): string | undefined {
		return this.description;
	}

	public getType(): string {
		return this.type;
	}

	public getRange(): Range {
		return this.range;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	private runOpen(_context: IEntryRunContext): boolean {

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
		super(QuickOutlineNLS.quickOutlineActionInput, {
			id: 'editor.action.quickOutline',
			label: QuickOutlineNLS.quickOutlineActionLabel,
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor) {
		if (!editor.hasModel()) {
			return undefined;
		}

		const model = editor.getModel();

		if (!DocumentSymbolProviderRegistry.has(model)) {
			return undefined;
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

	private symbolEntry(name: string, type: string, description: string | undefined, range: IRange, highlights: IHighlight[], editor: ICodeEditor, decorator: IDecorator): SymbolEntry {
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
				let description: string | undefined = undefined;
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
						currentResult.setGroupLabel(this.typeToLabel(currentType || '', typeCounter));
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
				currentResult.setGroupLabel(this.typeToLabel(currentType || '', typeCounter));
			}
		}

		// Mark first entry as outline
		else if (results.length > 0) {
			results[0].setGroupLabel(strings.format(QuickOutlineNLS._symbols_, results.length));
		}

		return results;
	}

	private typeToLabel(type: string, count: number): string {
		switch (type) {
			case 'module': return strings.format(QuickOutlineNLS._modules_, count);
			case 'class': return strings.format(QuickOutlineNLS._class_, count);
			case 'interface': return strings.format(QuickOutlineNLS._interface_, count);
			case 'method': return strings.format(QuickOutlineNLS._method_, count);
			case 'function': return strings.format(QuickOutlineNLS._function_, count);
			case 'property': return strings.format(QuickOutlineNLS._property_, count);
			case 'variable': return strings.format(QuickOutlineNLS._variable_, count);
			case 'var': return strings.format(QuickOutlineNLS._variable2_, count);
			case 'constructor': return strings.format(QuickOutlineNLS._constructor_, count);
			case 'call': return strings.format(QuickOutlineNLS._call_, count);
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
