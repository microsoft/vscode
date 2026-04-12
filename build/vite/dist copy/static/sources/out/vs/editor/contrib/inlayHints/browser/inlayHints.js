/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { createCommandUri } from '../../../../base/common/htmlContent.js';
export class InlayHintAnchor {
    constructor(range, direction) {
        this.range = range;
        this.direction = direction;
    }
}
export class InlayHintItem {
    constructor(hint, anchor, provider) {
        this.hint = hint;
        this.anchor = anchor;
        this.provider = provider;
        this._isResolved = false;
    }
    with(delta) {
        const result = new InlayHintItem(this.hint, delta.anchor, this.provider);
        result._isResolved = this._isResolved;
        result._currentResolve = this._currentResolve;
        return result;
    }
    async resolve(token) {
        if (typeof this.provider.resolveInlayHint !== 'function') {
            return;
        }
        if (this._currentResolve) {
            // wait for an active resolve operation and try again
            // when that's done.
            await this._currentResolve;
            if (token.isCancellationRequested) {
                return;
            }
            return this.resolve(token);
        }
        if (!this._isResolved) {
            this._currentResolve = this._doResolve(token)
                .finally(() => this._currentResolve = undefined);
        }
        await this._currentResolve;
    }
    async _doResolve(token) {
        try {
            const newHint = await Promise.resolve(this.provider.resolveInlayHint(this.hint, token));
            this.hint.tooltip = newHint?.tooltip ?? this.hint.tooltip;
            this.hint.label = newHint?.label ?? this.hint.label;
            this.hint.textEdits = newHint?.textEdits ?? this.hint.textEdits;
            this._isResolved = true;
        }
        catch (err) {
            onUnexpectedExternalError(err);
            this._isResolved = false;
        }
    }
}
export class InlayHintsFragments {
    static { this._emptyInlayHintList = Object.freeze({ dispose() { }, hints: [] }); }
    static async create(registry, model, ranges, token) {
        const data = [];
        const promises = registry.ordered(model).reverse().map(provider => ranges.map(async (range) => {
            try {
                const result = await provider.provideInlayHints(model, range, token);
                if (result?.hints.length || provider.onDidChangeInlayHints) {
                    data.push([result ?? InlayHintsFragments._emptyInlayHintList, provider]);
                }
            }
            catch (err) {
                onUnexpectedExternalError(err);
            }
        }));
        await Promise.all(promises.flat());
        if (token.isCancellationRequested || model.isDisposed()) {
            throw new CancellationError();
        }
        return new InlayHintsFragments(ranges, data, model);
    }
    constructor(ranges, data, model) {
        this._disposables = new DisposableStore();
        this.ranges = ranges;
        this.provider = new Set();
        const items = [];
        for (const [list, provider] of data) {
            this._disposables.add(list);
            this.provider.add(provider);
            for (const hint of list.hints) {
                // compute the range to which the item should be attached to
                const position = model.validatePosition(hint.position);
                let direction = 'before';
                const wordRange = InlayHintsFragments._getRangeAtPosition(model, position);
                let range;
                if (wordRange.getStartPosition().isBefore(position)) {
                    range = Range.fromPositions(wordRange.getStartPosition(), position);
                    direction = 'after';
                }
                else {
                    range = Range.fromPositions(position, wordRange.getEndPosition());
                    direction = 'before';
                }
                items.push(new InlayHintItem(hint, new InlayHintAnchor(range, direction), provider));
            }
        }
        this.items = items.sort((a, b) => Position.compare(a.hint.position, b.hint.position));
    }
    dispose() {
        this._disposables.dispose();
    }
    static _getRangeAtPosition(model, position) {
        const line = position.lineNumber;
        const word = model.getWordAtPosition(position);
        if (word) {
            // always prefer the word range
            return new Range(line, word.startColumn, line, word.endColumn);
        }
        model.tokenization.tokenizeIfCheap(line);
        const tokens = model.tokenization.getLineTokens(line);
        const offset = position.column - 1;
        const idx = tokens.findTokenIndexAtOffset(offset);
        let start = tokens.getStartOffset(idx);
        let end = tokens.getEndOffset(idx);
        if (end - start === 1) {
            // single character token, when at its end try leading/trailing token instead
            if (start === offset && idx > 1) {
                // leading token
                start = tokens.getStartOffset(idx - 1);
                end = tokens.getEndOffset(idx - 1);
            }
            else if (end === offset && idx < tokens.getCount() - 1) {
                // trailing token
                start = tokens.getStartOffset(idx + 1);
                end = tokens.getEndOffset(idx + 1);
            }
        }
        return new Range(line, start + 1, line, end + 1);
    }
}
export function asCommandLink(command) {
    return createCommandUri(command.id, ...(command.arguments ?? [])).toString();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5sYXlIaW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGF5SGludHMvYnJvd3Nlci9pbmxheUhpbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBSXRELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTFFLE1BQU0sT0FBTyxlQUFlO0lBQzNCLFlBQXFCLEtBQVksRUFBVyxTQUE2QjtRQUFwRCxVQUFLLEdBQUwsS0FBSyxDQUFPO1FBQVcsY0FBUyxHQUFULFNBQVMsQ0FBb0I7SUFBSSxDQUFDO0NBQzlFO0FBRUQsTUFBTSxPQUFPLGFBQWE7SUFLekIsWUFBcUIsSUFBZSxFQUFXLE1BQXVCLEVBQVcsUUFBNEI7UUFBeEYsU0FBSSxHQUFKLElBQUksQ0FBVztRQUFXLFdBQU0sR0FBTixNQUFNLENBQWlCO1FBQVcsYUFBUSxHQUFSLFFBQVEsQ0FBb0I7UUFIckcsZ0JBQVcsR0FBWSxLQUFLLENBQUM7SUFHNEUsQ0FBQztJQUVsSCxJQUFJLENBQUMsS0FBa0M7UUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN6RSxNQUFNLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDdEMsTUFBTSxDQUFD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