/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import './codelensWidget.css';
import { Range } from '../../../common/core/range.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
class CodeLensViewZone {
    constructor(afterLineNumber, heightInPx, onHeight) {
        /**
         * We want that this view zone, which reserves space for a code lens appears
         * as close as possible to the next line, so we use a very large value here.
         */
        this.afterColumn = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
        this.afterLineNumber = afterLineNumber;
        this.heightInPx = heightInPx;
        this._onHeight = onHeight;
        this.suppressMouseDown = true;
        this.domNode = document.createElement('div');
    }
    onComputedHeight(height) {
        if (this._lastHeight === undefined) {
            this._lastHeight = height;
        }
        else if (this._lastHeight !== height) {
            this._lastHeight = height;
            this._onHeight();
        }
    }
    isVisible() {
        return this._lastHeight !== 0
            && this.domNode.hasAttribute('monaco-visible-view-zone');
    }
}
class CodeLensContentWidget {
    static { this._idPool = 0; }
    constructor(editor, line) {
        // Editor.IContentWidget.allowEditorOverflow
        this.allowEditorOverflow = false;
        this.suppressMouseDown = true;
        this._commands = new Map();
        this._isEmpty = true;
        this._editor = editor;
        this._id = `codelens.widget-${(CodeLensContentWidget._idPool++)}`;
        this.updatePosition(line);
        this._domNode = document.createElement('span');
        this._domNode.className = `codelens-decoration`;
    }
    withCommands(lenses, animate) {
        this._commands.clear();
        const children = [];
        let hasSymbol = false;
        for (let i = 0; i < lenses.length; i++) {
            const lens = lenses[i];
            if (!lens) {
                continue;
            }
            hasSymbol = true;
            if (lens.command) {
                const title = renderLabelWithIcons(lens.command.title.trim());
                if (lens.command.id) {
                    const id = `c${(CodeLensContentWidget._idPool++)}`;
                    children.push(dom.$('a', { id, title: lens.command.tooltip, role: 'button' }, ...title));
                    this._commands.set(id, lens.command);
                }
                else {
                    children.push(dom.$('span', { title: lens.command.tooltip }, ...title));
                }
                if (i + 1 < lenses.length) {
                    children.push(dom.$('span', undefined, '\u00a0|\u00a0'));
                }
            }
        }
        if (!hasSymbol) {
            // symbols but no commands
            dom.reset(this._domNode, dom.$('span', undefined, 'no commands'));
        }
        else {
            // symbols and commands
            dom.reset(this._domNode, ...children);
            if (this._isEmpty && animate) {
                this._domNode.classList.add('fadein');
            }
            this._isEmpty = false;
        }
    }
    getCommand(link) {
        return link.parentElement === this._domNode
            ? this._commands.get(link.id)
            : undefined;
    }
    getId() {
        return this._id;
    }
    getDomNode() {
        return this._domNode;
    }
    updatePosition(line) {
        const column = this._editor.getModel().getLineFirstNonWhitespaceColumn(line);
        this._widgetPosition = {
            position: { lineNumber: line, column: column },
            preference: [1 /* ContentWidgetPositionPreference.ABOVE */]
        };
    }
    getPosition() {
        return this._widgetPosition || null;
    }
}
export class CodeLensHelper {
    constructor() {
        this._removeDecorations = [];
        this._addDecorations = [];
        this._addDecorationsCallbacks = [];
    }
    addDecoration(decoration, callback) {
        this._addDecorations.push(decoration);
        this._addDecorationsCallbacks.push(callback);
    }
    removeDecoration(decorationId) {
        this._removeDecorations.push(decorationId);
    }
    commit(changeAccessor) {
        const resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
        for (let i = 0, len = resultingDecorations.length; i < len; i++) {
            this._addDecorationsCallbacks[i](resultingDecorations[i]);
        }
    }
}
const codeLensDecorationOptions = ModelDecorationOptions.register({
    collapseOnReplaceEdit: true,
    description: 'codelens'
});
export class CodeLensWidget {
    constructor(data, editor, helper, viewZoneChangeAccessor, heightInPx, updateCallback) {
        this._isDisposed = false;
        this._editor = editor;
        this._data = data;
        // create combined range, track all ranges with decorations,
        // check if there is already something to render
        this._decorationIds = [];
        let range;
        const lenses = [];
        this._data.forEach((codeLensData, i) => {
            if (codeLensData.symbol.command) {
                lenses.push(codeLensData.symbol);
            }
            helper.addDecoration({
                range: codeLensData.symbol.range,
                options: codeLensDecorationOptions
            }, id => this._decorationIds[i] = id);
            // the range contains all lenses on this line
            if (!range) {
                range = Range.lift(codeLensData.symbol.range);
            }
            else {
                range = Range.plusRange(range, codeLensData.symbol.range);
            }
        });
        this._viewZone = new CodeLensViewZone(range.startLineNumber - 1, heightInPx, updateCallback);
        this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);
        if (lenses.length > 0) {
            this._createContentWidgetIfNecessary();
            this._contentWidget.withCommands(lenses, false);
        }
    }
    _createContentWidgetIfNecessary() {
        if (!this._contentWidget) {
            this._contentWidget = new CodeLensContentWidget(this._editor, this._viewZone.afterLineNumber + 1);
            this._editor.addContentWidget(this._contentWidget);
        }
        else {
            this._editor.layoutContentWidget(this._contentWidget);
        }
    }
    dispose(helper, viewZoneChangeAccessor) {
        this._decorationIds.forEach(helper.removeDecoration, helper);
        this._decorationIds = [];
        viewZoneChangeAccessor?.removeZone(this._viewZoneId);
        if (this._contentWidget) {
            this._editor.removeContentWidget(this._contentWidget);
            this._contentWidget = undefined;
        }
        this._isDisposed = true;
    }
    isDisposed() {
        return this._isDisposed;
    }
    isValid() {
        return this._decorationIds.some((id, i) => {
            const range = this._editor.getModel().getDecorationRange(id);
            const symbol = this._data[i].symbol;
            return !!(range && Range.isEmpty(symbol.range) === range.isEmpty());
        });
    }
    updateCodeLensSymbols(data, helper) {
        this._decorationIds.forEach(helper.removeDecoration, helper);
        this._decorationIds = [];
        this._data = data;
        this._data.forEach((codeLensData, i) => {
            helper.addDecoration({
                range: codeLensData.symbol.range,
                options: codeLensDecorationOptions
            }, id => this._decorationIds[i] = id);
        });
    }
    updateHeight(height, viewZoneChangeAccessor) {
        this._viewZone.heightInPx = height;
        viewZoneChangeAccessor.layoutZone(this._viewZoneId);
        if (this._contentWidget) {
            this._editor.layoutContentWidget(this._contentWidget);
        }
    }
    computeIfNecessary(model) {
        if (!this._viewZone.isVisible()) {
            return null;
        }
        // Read editor current state
        for (let i = 0; i < this._decorationIds.length; i++) {
            const range = model.getDecorationRange(this._decorationIds[i]);
            if (range) {
                this._data[i].symbol.range = range;
            }
        }
        return this._data;
    }
    updateCommands(symbols) {
        this._createContentWidgetIfNecessary();
        this._contentWidget.withCommands(symbols, true);
        for (let i = 0; i < this._data.length; i++) {
            const resolved = symbols[i];
            if (resolved) {
                const { symbol } = this._data[i];
                symbol.command = resolved.command || symbol.command;
            }
        }
    }
    getCommand(link) {
        return this._contentWidget?.getCommand(link);
    }
    getLineNumber() {
        const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
        if (range) {
            return range.startLineNumber;
        }
        return -1;
    }
    update(viewZoneChangeAccessor) {
        if (this.isValid()) {
            const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
            if (range) {
                this._viewZone.afterLineNumber = range.startLineNumber - 1;
                viewZoneChangeAccessor.layoutZone(this._viewZoneId);
                if (this._contentWidget) {
                    this._contentWidget.updatePosition(range.startLineNumber);
                    this._editor.layoutContentWidget(this._contentWidget);
                }
            }
        }
    }
    getItems() {
        return this._data;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWxlbnNXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2RlbGVucy9icm93c2VyL2NvZGVsZW5zV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFM0YsT0FBTyxzQkFBc0IsQ0FBQztBQUU5QixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFdEQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFJNUUsTUFBTSxnQkFBZ0I7SUFnQnJCLFlBQVksZUFBdUIsRUFBRSxVQUFrQixFQUFFLFFBQW9CO1FBVjdFOzs7V0FHRztRQUNNLGdCQUFXLHFEQUFvQztRQU92RCxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztRQUN2QyxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUU3QixJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztRQUMxQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO1FBQzlCLElBQUksQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsTUFBYztRQUM5QixJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxNQUFNLENBQUM7UUFDM0IsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQztZQUMx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