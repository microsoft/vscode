/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, dispose } from '../../../../base/common/lifecycle.js';
import { CommentThreadCollapsibleState } from '../../../../editor/common/languages.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
class CommentThreadRangeDecoration {
    get id() {
        return this._decorationId;
    }
    set id(id) {
        this._decorationId = id;
    }
    constructor(range, options) {
        this.range = range;
        this.options = options;
    }
}
export class CommentThreadRangeDecorator extends Disposable {
    static { this.description = 'comment-thread-range-decorator'; }
    constructor(commentService) {
        super();
        this.decorationIds = [];
        this.activeDecorationIds = [];
        this.threadCollapseStateListeners = [];
        const decorationOptions = {
            description: CommentThreadRangeDecorator.description,
            isWholeLine: false,
            zIndex: 20,
            className: 'comment-thread-range',
            shouldFillLineOnLineBreak: true
        };
        this.decorationOptions = ModelDecorationOptions.createDynamic(decorationOptions);
        const activeDecorationOptions = {
            description: CommentThreadRangeDecorator.description,
            isWholeLine: false,
            zIndex: 20,
            className: 'comment-thread-range-current',
            shouldFillLineOnLineBreak: true
        };
        this.activeDecorationOptions = ModelDecorationOptions.createDynamic(activeDecorationOptions);
        this._register(commentService.onDidChangeCurrentCommentThread(thread => {
            this.updateCurrent(thread);
        }));
        this._register(commentService.onDidUpdateCommentThreads(() => {
            this.updateCurrent(undefined);
        }));
    }
    updateCurrent(thread) {
        if (!this.editor || (thread?.resource && (thread.resource?.toString() !== this.editor.getModel()?.uri.toString()))) {
            return;
        }
        this.currentThreadCollapseStateListener?.dispose();
        const newDecoration = [];
        if (thread) {
            const range = thread.range;
            if (range && !((range.startLineNumber === range.endLineNumber) && (range.startColumn === range.endColumn))) {
                if (thread.collapsibleState === CommentThreadCollapsibleState.Expanded) {
                    this.currentThreadCollapseStateListener = thread.onDidChangeCollapsibleState(state => {
                        if (state === CommentThreadCollapsibleState.Collapsed) {
                            this.updateCurrent(undefined);
                        }
                    });
                    newDecoration.push(new CommentThreadRangeDecoration(range, this.activeDecorationOptions));
                }
            }
        }
        this.editor.changeDecorations((changeAccessor) => {
            this.activeDecorationIds = changeAccessor.deltaDecorations(this.activeDecorationIds, newDecoration);
            newDecoration.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
        });
    }
    update(editor, commentInfos) {
        const model = editor?.getModel();
        if (!editor || !model) {
            return;
        }
        dispose(this.threadCollapseStateListeners);
        this.editor = editor;
        const commentThreadRangeDecorations = [];
        for (const info of commentInfos) {
            info.threads.forEach(thread => {
                if (thread.isDisposed) {
                    return;
                }
                const range = thread.range;
                // We only want to show a range decoration when there's the range spans either multiple lines
                // or, when is spans multiple characters on the sample line
                if (!range || (range.startLineNumber === range.endLineNumber) && (range.startColumn === range.endColumn)) {
                    return;
                }
                this.threadCollapseStateListeners.push(thread.onDidChangeCollapsibleState(() => {
                    this.update(editor, commentInfos);
                }));
                if (thread.collapsibleState === CommentThreadCollapsibleState.Collapsed) {
                    return;
                }
                commentThreadRangeDecorations.push(new CommentThreadRangeDecoration(range, this.decorationOptions));
            });
        }
        editor.changeDecorations((changeAccessor) => {
            this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, commentThreadRangeDecorations);
            commentThreadRangeDecorations.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
        });
    }
    dispose() {
        dispose(this.threadCollapseStateListeners);
        this.currentThreadCollapseStateListener?.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50VGhyZWFkUmFuZ2VEZWNvcmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUd4RixPQUFPLEVBQWlCLDZCQUE2QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHdEYsTUFBTSw0QkFBNEI7SUFHakMsSUFBVyxFQUFFO1FBQ1osT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzNCLENBQUM7SUFFRCxJQUFXLEVBQUUsQ0FBQyxFQUFzQjtRQUNuQyxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRUQsWUFDaUIsS0FBYSxFQUNiLE9BQStCO1FBRC9CLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixZQUFPLEdBQVAsT0FBTyxDQUF3QjtJQUNoRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTthQUMzQyxnQkFBVyxHQUFHLGdDQUFnQyxBQUFuQyxDQUFvQztJQVM5RCxZQUFZLGNBQStCO1FBQzFDLEtBQUssRUFBRSxDQUFDO1FBUEQsa0JBQWEsR0FBYSxFQUFFLENBQUM7UUFDN0Isd0JBQW1CLEdBQWEsRUFBRSxDQUFDO1FBRW5DLGlDQUE0QixHQUFrQixFQUFFLENBQUM7UUFLeEQsTUFBTSxpQkFBaUIsR0FBNEI7WUFDbEQsV0FBVyxFQUFFLDJCQUEyQixDQUFDLFdBQVc7WUFDcEQsV0FBVyxFQUFFLEtBQUs7WUFDbEIsTUFBTSxFQUFFLEVB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