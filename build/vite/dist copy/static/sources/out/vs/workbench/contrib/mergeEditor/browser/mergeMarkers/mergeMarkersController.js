/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { MergeEditorLineRange } from '../model/lineRange.js';
import * as nls from '../../../../../nls.js';
export const conflictMarkers = {
    start: '<<<<<<<',
    end: '>>>>>>>',
};
export class MergeMarkersController extends Disposable {
    constructor(editor, mergeEditorViewModel) {
        super();
        this.editor = editor;
        this.mergeEditorViewModel = mergeEditorViewModel;
        this.viewZoneIds = [];
        this.disposableStore = this._register(new DisposableStore());
        this._register(editor.onDidChangeModelContent(e => {
            this.updateDecorations();
        }));
        this._register(editor.onDidChangeModel(e => {
            this.updateDecorations();
        }));
        this.updateDecorations();
    }
    updateDecorations() {
        const model = this.editor.getModel();
        const blocks = model ? getBlocks(model, { blockToRemoveStartLinePrefix: conflictMarkers.start, blockToRemoveEndLinePrefix: conflictMarkers.end }) : { blocks: [] };
        this.editor.setHiddenAreas(blocks.blocks.map(b => b.lineRange.deltaEnd(-1).toExclusiveRange()), this);
        this.editor.changeViewZones(c => {
            this.disposableStore.clear();
            for (const id of this.viewZoneIds) {
                c.removeZone(id);
            }
            this.viewZoneIds.length = 0;
            for (const b of blocks.blocks) {
                const startLine = model.getLineContent(b.lineRange.startLineNumber).substring(0, 20);
                const endLine = model.getLineContent(b.lineRange.endLineNumberExclusive - 1).substring(0, 20);
                const conflictingLinesCount = b.lineRange.length - 2;
                const domNode = h('div', [
                    h('div.conflict-zone-root', [
                        h('pre', [startLine]),
                        h('span.dots', ['...']),
                        h('pre', [endLine]),
                        h('span.text', [
                            conflictingLinesCount === 1
                                ? nls.localize('conflictingLine', "1 Conflicting Line")
                                : nls.localize('conflictingLines', "{0} Conflicting Lines", conflictingLinesCount)
                        ]),
                    ]),
                ]).root;
                this.viewZoneIds.push(c.addZone({
                    afterLineNumber: b.lineRange.endLineNumberExclusive - 1,
                    domNode,
                    heightInLines: 1.5,
                }));
                const updateWidth = () => {
                    const layoutInfo = this.editor.getLayoutInfo();
                    domNode.style.width = `${layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth}px`;
                };
                this.disposableStore.add(this.editor.onDidLayoutChange(() => {
                    updateWidth();
                }));
                updateWidth();
                this.disposableStore.add(autorun(reader => {
                    /** @description update classname */
                    const vm = this.mergeEditorViewModel.read(reader);
                    if (!vm) {
                        return;
                    }
                    const activeRange = vm.activeModifiedBaseRange.read(reader);
                    const classNames = [];
                    classNames.push('conflict-zone');
                    if (activeRange) {
                        const activeRangeInResult = vm.model.getLineRangeInResult(activeRange.baseRange, reader);
                        if (activeRangeInResult.intersectsOrTouches(b.lineRange)) {
                            classNames.push('focused');
                        }
                    }
                    domNode.className = classNames.join(' ');
                }));
            }
        });
    }
}
function getBlocks(document, configuration) {
    const blocks = [];
    const transformedContent = [];
    let inBlock = false;
    let startLineNumber = -1;
    let curLine = 0;
    for (const line of document.getLinesContent()) {
        curLine++;
        if (!inBlock) {
            if (line.startsWith(configuration.blockToRemoveStartLinePrefix)) {
                inBlock = true;
                startLineNumber = curLine;
            }
            else {
                transformedContent.push(line);
            }
        }
        else {
            if (line.startsWith(configuration.blockToRemoveEndLinePrefix)) {
                inBlock = false;
                blocks.push(new Block(MergeEditorLineRange.fromLength(startLineNumber, curLine - startLineNumber + 1)));
                transformedContent.push('');
            }
        }
    }
    return {
        blocks,
        transformedContent: transformedContent.join('\n')
    };
}
class Block {
    constructor(lineRange) {
        this.lineRange = lineRange;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVyZ2VNYXJrZXJzQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbWVyZ2VNYXJrZXJzL21lcmdlTWFya2Vyc0NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLDBDQUEwQyxDQUFDO0FBR2hGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRTdELE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFFN0MsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHO0lBQzlCLEtBQUssRUFBRSxTQUFTO0lBQ2hCLEdBQUcsRUFBRSxTQUFTO0NBQ2QsQ0FBQztBQUVGLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxVQUFVO0lBSXJELFlBQ2lCLE1BQW1CLEVBQ25CLG9CQUFtRTtRQUVuRixLQUFLLEVBQUUsQ0FBQztRQUhRLFdBQU0sR0FBTixNQUFNLENBQWE7UUFDbkIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUErQztRQUxuRSxnQkFBVyxHQUFhLEVBQUUsQ0FBQztRQUMzQixvQkFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBUXhFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2pELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJ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