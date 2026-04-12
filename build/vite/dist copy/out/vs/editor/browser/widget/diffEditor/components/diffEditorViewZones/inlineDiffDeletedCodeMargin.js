/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addStandardDisposableListener, getDomNodePagePosition } from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { isIOS } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { enableCopySelection } from './copySelection.js';
export class InlineDiffDeletedCodeMargin extends Disposable {
    get visibility() {
        return this._visibility;
    }
    set visibility(_visibility) {
        if (this._visibility !== _visibility) {
            this._visibility = _visibility;
            this._diffActions.style.visibility = _visibility ? 'visible' : 'hidden';
        }
    }
    constructor(_getViewZoneId, _marginDomNode, _deletedCodeDomNode, _modifiedEditor, _diff, _editor, _renderLinesResult, _originalTextModel, _contextMenuService, _clipboardService) {
        super();
        this._getViewZoneId = _getViewZoneId;
        this._marginDomNode = _marginDomNode;
        this._deletedCodeDomNode = _deletedCodeDomNode;
        this._modifiedEditor = _modifiedEditor;
        this._diff = _diff;
        this._editor = _editor;
        this._renderLinesResult = _renderLinesResult;
        this._originalTextModel = _originalTextModel;
        this._contextMenuService = _contextMenuService;
        this._clipboardService = _clipboardService;
        this._visibility = false;
        // make sure the diff margin shows above overlay.
        this._marginDomNode.style.zIndex = '10';
        this._diffActions = document.createElement('div');
        this._diffActions.className = ThemeIcon.asClassName(Codicon.lightBulb) + ' lightbulb-glyph';
        this._diffActions.style.position = 'absolute';
        const lineHeight = this._modifiedEditor.getOption(75 /* EditorOption.lineHeight */);
        this._diffActions.style.right = '0px';
        this._diffActions.style.visibility = 'hidden';
        this._diffActions.style.height = `${lineHeight}px`;
        this._diffActions.style.lineHeight = `${lineHeight}px`;
        this._marginDomNode.appendChild(this._diffActions);
        let currentLineNumberOffset = 0;
        const useShadowDOM = _modifiedEditor.getOption(144 /* EditorOption.useShadowDOM */) && !isIOS; // Do not use shadow dom on IOS #122035
        const showContextMenu = (anchor, baseActions, onHide) => {
            this._contextMenuService.showContextMenu({
                domForShadowRoot: useShadowDOM ? _modifiedEditor.getDomNode() ?? undefined : undefined,
                getAnchor: () => anchor,
                onHide,
                getActions: () => {
                    const actions = baseActions ?? [];
                    const isDeletion = _diff.modified.isEmpty;
                    // default action
                    actions.push(new Action('diff.clipboard.copyDeletedContent', isDeletion
                        ? (_diff.original.length > 1
                            ? localize('diff.clipboard.copyDeletedLinesContent.label', "Copy deleted lines")
                            : localize('diff.clipboard.copyDeletedLinesContent.single.label', "Copy deleted line"))
                        : (_diff.original.length > 1
                            ? localize('diff.clipboard.copyChangedLinesContent.label', "Copy changed lines")
                            : localize('diff.clipboard.copyChangedLinesContent.single.label', "Copy changed line")), undefined, true, async () => {
                        const originalText = this._originalTextModel.getValueInRange(_diff.original.toExclusiveRange());
                        await this._clipboardService.writeText(originalText);
                    }));
                    if (_diff.original.length > 1) {
                        actions.push(new Action('diff.clipboard.copyDeletedLineContent', isDeletion
                            ? localize('diff.clipboard.copyDeletedLineContent.label', "Copy deleted line ({0})", _diff.original.startLineNumber + currentLineNumberOffset)
                            : localize('diff.clipboard.copyChangedLineContent.label', "Copy changed line ({0})", _diff.original.startLineNumber + currentLineNumberOffset), undefined, true, async () => {
                            let lineContent = this._originalTextModel.getLineContent(_diff.original.startLineNumber + currentLineNumberOffset);
                            if (lineContent === '') {
                                // empty line -> new line
                                const eof = this._originalTextModel.getEndOfLineSequence();
                                lineContent = eof === 0 /* EndOfLineSequence.LF */ ? '\n' : '\r\n';
                            }
                            await this._clipboardService.writeText(lineContent);
                        }));
                    }
                    const readOnly = _modifiedEditor.getOption(104 /* EditorOption.readOnly */);
                    if (!readOnly) {
                        actions.push(new Action('diff.inline.revertChange', localize('diff.inline.revertChange.label', "Revert this change"), undefined, true, async () => {
                            this._editor.revert(this._diff);
                        }));
                    }
                    return actions;
                },
                autoSelectFirstItem: true
            });
        };
        this._register(addStandardDisposableListener(this._diffActions, 'mousedown', e => {
            if (!e.leftButton) {
                return;
            }
            const { top, height } = getDomNodePagePosition(this._diffActions);
            const pad = Math.floor(lineHeight / 3);
            e.preventDefault();
            showContextMenu({ x: e.posx, y: top + height + pad });
        }));
        this._register(_modifiedEditor.onMouseMove((e) => {
            if ((e.target.type === 8 /* MouseTargetType.CONTENT_VIEW_ZONE */ || e.target.type === 5 /* MouseTargetType.GUTTER_VIEW_ZONE */) && e.target.detail.viewZoneId === this._getViewZoneId()) {
                currentLineNumberOffset = this._updateLightBulbPosition(this._marginDomNode, e.event.browserEvent.y, lineHeight);
                this.visibility = true;
            }
            else {
                this.visibility = false;
            }
        }));
        this._register(enableCopySelection({
            domNode: this._deletedCodeDomNode,
            diffEntry: _diff,
            originalModel: this._originalTextModel,
            renderLinesResult: this._renderLinesResult,
            clipboardService: _clipboardService,
        }));
    }
    _updateLightBulbPosition(marginDomNode, y, lineHeight) {
        const { top } = getDomNodePagePosition(marginDomNode);
        const offset = y - top;
        const lineNumberOffset = Math.floor(offset / lineHeight);
        const newTop = lineNumberOffset * lineHeight;
        this._diffActions.style.top = `${newTop}px`;
        if (this._renderLinesResult.viewLineCounts) {
            let acc = 0;
            for (let i = 0; i < this._renderLinesResult.viewLineCounts.length; i++) {
                acc += this._renderLinesResult.viewLineCounts[i];
                if (lineNumberOffset < acc) {
                    return i;
                }
            }
        }
        return lineNumberOffset;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRGlmZkRlbGV0ZWRDb2RlTWFyZ2luLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL2lubGluZURpZmZEZWxldGVkQ29kZU1hcmdpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBT3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUdwRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUd6RCxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTtJQUsxRCxJQUFJLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELElBQUksVUFBVSxDQUFDLFdBQW9CO1FBQ2xDLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztZQUMvQixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUN6RSxDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQ2tCLGNBQTRCLEVBQzVCLGNBQTJCLEVBQzNCLG1CQUFnQyxFQUNoQyxlQUFpQyxFQUNqQyxLQUErQixFQUMvQixPQUF5QixFQUN6QixrQkFBcUMsRUFDckMsa0JBQThCLEVBQzlCLG1CQUF3QyxFQUN4QyxpQkFBb0M7UUFFckQsS0FBSyxFQUFFLENBQUM7UUFYUyxtQkFBYyxHQUFkLGNBQWMsQ0FBYztRQUM1QixtQkFBYyxHQUFkLGNBQWMsQ0FBYTtRQUMzQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQWE7UUFDaEMsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBQ2pDLFVBQUssR0FBTCxLQUFLLENBQTBCO1FBQy9CLFlBQU8sR0FBUCxPQUFPLENBQWtCO1FBQ3pCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBbUI7UUFDckMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFZO1FBQzlCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDeEMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQXZCOUMsZ0JBQVcsR0FBWSxLQUFLLENBQUM7UUEyQnBDLGlEQUFpRDtRQUNqRCxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBRXhDLElBQUksQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxrQkFBa0IsQ0FBQztRQUM1RixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsVUFBVSxDQUFDO1FBQzlDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxrQ0FBeUIsQ0FBQztRQUMzRSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxRQUFRLENBQUM7UUFDOUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsVUFBVSxJQUFJLENBQUM7UUFDbkQsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLEdBQUcsVUFBVSxJQUFJLENBQUM7UUFDdkQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRW5ELElBQUksdUJBQXVCLEdBQUcsQ0FBQyxDQUFDO1FBRWhDLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxTQUFTLHFDQUEyQixJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsdUNBQXVDO1FBQzVILE1BQU0sZUFBZSxHQUFHLENBQUMsTUFBZ0MsRUFBRSxXQUFzQixFQUFFLE1BQW1CLEVBQUUsRUFBRTtZQUN6RyxJQUFJLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDO2dCQUN4QyxnQkFBZ0IsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxVQUFVLEVBQUUsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3RGLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxNQUFNO2dCQUN2QixNQUFNO2dCQUNOLFVBQVUsRUFBRSxHQUFHLEVBQUU7b0JBQ2hCLE1BQU0sT0FBTyxHQUFhLFdBQVcsSUFBSSxFQUFFLENBQUM7b0JBQzVDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO29CQUUxQyxpQkFBaUI7b0JBQ2pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxNQUFNLENBQ3RCLG1DQUFtQyxFQUNuQyxVQUFVO3dCQUNULENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUM7NEJBQzNCLENBQUMsQ0FBQyxRQUFRLENBQUMsOENBQThDLEVBQUUsb0JBQW9CLENBQUM7NEJBQ2hGLENBQUMsQ0FBQyxRQUFRLENBQUMscURBQXFELEVBQUUsbUJBQW1CLENBQUMsQ0FBQzt3QkFDeEYsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQzs0QkFDM0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4Q0FBOEMsRUFBRSxvQkFBb0IsQ0FBQzs0QkFDaEYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxxREFBcUQsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLEVBQ3pGLFNBQVMsRUFDVCxJQUFJLEVBQ0osS0FBSyxJQUFJLEVBQUU7d0JBQ1YsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQzt3QkFDaEcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUN0RCxDQUFDLENBQ0QsQ0FBQyxDQUFDO29CQUVILElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQy9CLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxNQUFNLENBQ3RCLHVDQUF1QyxFQUN2QyxVQUFVOzRCQUNULENBQUMsQ0FBQyxRQUFRLENBQUMsNkNBQTZDLEVBQUUseUJBQXlCLEVBQ2xGLEtBQUssQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLHVCQUF1QixDQUFDOzRCQUMxRCxDQUFDLENBQUMsUUFBUSxDQUFDLDZDQUE2QyxFQUFFLHlCQUF5QixFQUNsRixLQUFLLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyx1QkFBdUIsQ0FBQyxFQUMzRCxTQUFTLEVBQ1QsSUFBSSxFQUNKLEtBQUssSUFBSSxFQUFFOzRCQUNWLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsdUJBQXVCLENBQUMsQ0FBQzs0QkFDbkgsSUFBSSxXQUFXLEtBQUssRUFBRSxFQUFFLENBQUM7Z0NBQ3hCLHlCQUF5QjtnQ0FDekIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLENBQUM7Z0NBQzNELFdBQVcsR0FBRyxHQUFHLGlDQUF5QixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQzs0QkFDNUQsQ0FBQzs0QkFDRCxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7d0JBQ3JELENBQUMsQ0FDRCxDQUFDLENBQUM7b0JBQ0osQ0FBQztvQkFDRCxNQUFNLFFBQVEsR0FBRyxlQUFlLENBQUMsU0FBUyxpQ0FBdUIsQ0FBQztvQkFDbEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxNQUFNLENBQ3RCLDBCQUEwQixFQUMxQixRQUFRLENBQUMsZ0NBQWdDLEVBQUUsb0JBQW9CLENBQUMsRUFDaEUsU0FBUyxFQUNULElBQUksRUFDSixLQUFLLElBQUksRUFBRTs0QkFDVixJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ2pDLENBQUMsQ0FBQyxDQUNGLENBQUM7b0JBQ0gsQ0FBQztvQkFDRCxPQUFPLE9BQU8sQ0FBQztnQkFDaEIsQ0FBQztnQkFDRCxtQkFBbUIsRUFBRSxJQUFJO2FBQ3pCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQztRQUVGLElBQUksQ0FBQyxTQUFTLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDaEYsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFBQyxPQUFPO1lBQUMsQ0FBQztZQUU5QixNQUFNLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLHNCQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNsRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN2QyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDbkIsZUFBZSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEdBQUcsR0FBRyxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUN2RCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBb0IsRUFBRSxFQUFFO1lBQ25FLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksOENBQXNDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLDZDQUFxQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDO2dCQUN6Syx1QkFBdUIsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQ2pILElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUM7WUFDbEMsT0FBTyxFQUFFLElBQUksQ0FBQyxtQkFBbUI7WUFDakMsU0FBUyxFQUFFLEtBQUs7WUFDaEIsYUFBYSxFQUFFLElBQUksQ0FBQyxrQkFBa0I7WUFDdEMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGtCQUFrQjtZQUMxQyxnQkFBZ0IsRUFBRSxpQkFBaUI7U0FDbkMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sd0JBQXdCLENBQUMsYUFBMEIsRUFBRSxDQUFTLEVBQUUsVUFBa0I7UUFDekYsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sTUFBTSxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7UUFDdkIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsQ0FBQztRQUN6RCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsR0FBRyxVQUFVLENBQUM7UUFDN0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUM7UUFDNUMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDNUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBQ1osS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3hFLEdBQUcsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqRCxJQUFJLGdCQUFnQixHQUFHLEdBQUcsRUFBRSxDQUFDO29CQUM1QixPQUFPLENBQUMsQ0FBQztnQkFDVixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLGdCQUFnQixDQUFDO0lBQ3pCLENBQUM7Q0FDRCJ9