/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import htmlcontentrenderer = require('vs/base/browser/htmlContentRenderer');
import errors = require('vs/base/common/errors');
import dom = require('vs/base/browser/dom');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import editorcommon = require('vs/editor/common/editorCommon');
import debug = require('vs/workbench/parts/debug/common/debug');
import { tokenizeToHtmlContent } from 'vs/editor/common/modes/textToHtmlTokenizer';

const $ = dom.emmet;

export class DebugHoverWidget implements editorbrowser.IContentWidget {

	public static ID = 'debug.hoverWidget';
	// editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private domNode: HTMLElement;
	private isVisible: boolean;
	private showAtPosition: editorcommon.IPosition;
	private lastHoveringOver: string;
	private highlightDecorations: string[];

	constructor(private editor: editorbrowser.ICodeEditor, private debugService: debug.IDebugService) {
		this.domNode = $('.debug-hover-widget monaco-editor-background');
		this.isVisible = false;
		this.showAtPosition = null;
		this.lastHoveringOver = null;
		this.highlightDecorations = [];

		this.editor.addContentWidget(this);
	}

	public getId(): string {
		return DebugHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}

	public showAt(range: editorcommon.IEditorRange): void {
		const pos = range.getStartPosition();
		const wordAtPosition = this.editor.getModel().getWordAtPosition(pos);
		const hoveringOver = wordAtPosition ? wordAtPosition.word : null;
		const focusedStackFrame = this.debugService.getViewModel().getFocusedStackFrame();
		if (!hoveringOver || !focusedStackFrame || (this.isVisible && hoveringOver === this.lastHoveringOver)) {
			return;
		}

		// string magic to get the parents of the variable (a and b for a.b.foo)
		const lineContent = this.editor.getModel().getLineContent(pos.lineNumber);
		const namesToFind = lineContent.substring(0, lineContent.indexOf('.' + hoveringOver))
			.split('.').map(word => word.trim()).filter(word => !!word);
		namesToFind.push(hoveringOver);
		namesToFind[0] = namesToFind[0].substring(namesToFind[0].lastIndexOf(' ') + 1);
		const variables: debug.IExpression[] = [];

		focusedStackFrame.getScopes(this.debugService).done(scopes => {

			// flatten out scopes lists
			return scopes.reduce((accum, scopes) => { return accum.concat(scopes); }, [])

			// no expensive scopes
			.filter((scope: debug.IScope) => !scope.expensive)

			// get the scopes variables
			.map((scope: debug.IScope) => scope.getChildren(this.debugService).done((children: debug.IExpression[]) => {

				// look for our variable in the list. First find the parents of the hovered variable if there are any.
				for (var i = 0; i < namesToFind.length && children; i++) {
					// some languages pass the type as part of the name, so need to check if the last word of the name matches.
					const filtered = children.filter(v => typeof v.name === 'string' && (namesToFind[i] === v.name || namesToFind[i] === v.name.substr(v.name.lastIndexOf(' ') + 1)));
					if (filtered.length !== 1) {
						break;
					}

					if (i === namesToFind.length - 1) {
						variables.push(filtered[0]);
					} else {
						filtered[0].getChildren(this.debugService).done(c => children = c, children = null);
					}
				}
			}, errors.onUnexpectedError));
		}, errors.onUnexpectedError);

		// don't show if there are duplicates across scopes
		if (variables.length !== 1) {
			this.hide();
			return;
		}

		const variable = variables[0];

		// show it
		this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
			range: {
				startLineNumber: pos.lineNumber,
				endLineNumber: pos.lineNumber,
				startColumn: wordAtPosition.startColumn,
				endColumn: wordAtPosition.endColumn
			},
			options: {
				className: 'hoverHighlight'
			}
		}]);
		this.lastHoveringOver = hoveringOver;

		if (variable.reference > 0 && variable.value.indexOf('function') === -1) {
			let objectToString = '{\n';
			variable.getChildren(this.debugService).then(children => {
				if (!children) {
					this.hide();
					return;
				}

				for (let i = 0; i < children.length; i++) {
					objectToString += `   ${ children[i].name }: ${ children[i].value }`.substr(0, 80);
					if (i < children.length - 1) {
						objectToString += ',\n';
					}
				}
				objectToString += '\n}';
				return objectToString;
			}).done(value => this.doShow(pos, value), () => this.hide());
		} else {
			this.doShow(pos, variable.value);
		}
	}

	private doShow(position: editorcommon.IEditorPosition, value: string): void {
		const model = this.editor.getModel();
		if (!value || !model) {
			return;
		}

		let crlfCount = 0;
		for (let i = 0; i < value.length; i++) {
			if (value[i] === '\n') {
				crlfCount++;
			}
			if (crlfCount > 12) {
				value = value.substr(0, i + 1) + '   ...\n}';
				break;
			}
		}

		this.domNode.innerHTML = '';
		this.domNode.appendChild(htmlcontentrenderer.renderHtml(tokenizeToHtmlContent(value, model.getMode())));
		this.showAtPosition = position;
		this.isVisible = true;
		this.editor.layoutContentWidget(this);
	}

	public hide(): void {
		if (!this.isVisible) {
			// already not visible
			return;
		}
		this.isVisible = false;
		this.editor.deltaDecorations(this.highlightDecorations, []);
		this.highlightDecorations = [];
		this.editor.layoutContentWidget(this);
	}

	public getPosition(): editorbrowser.IContentWidgetPosition {
		return this.isVisible ? {
			position: this.showAtPosition,
			preference: [
				editorbrowser.ContentWidgetPositionPreference.ABOVE,
				editorbrowser.ContentWidgetPositionPreference.BELOW
			]
		} : null;
	}
}
