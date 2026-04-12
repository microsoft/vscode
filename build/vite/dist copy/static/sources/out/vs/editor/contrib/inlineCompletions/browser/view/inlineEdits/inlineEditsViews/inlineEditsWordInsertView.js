/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../../../base/common/observable.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { getModifiedBorderColor, INLINE_EDITS_BORDER_RADIUS } from '../theme.js';
import { mapOutFalsy, rectToProps } from '../utils/utils.js';
export class InlineEditsWordInsertView extends Disposable {
    constructor(_editor, 
    /** Must be single-line in both sides */
    _edit, _tabAction) {
        super();
        this._editor = _editor;
        this._edit = _edit;
        this._tabAction = _tabAction;
        this.onDidClick = Event.None;
        this._start = this._editor.observePosition(constObservable(this._edit.range.getStartPosition()), this._store);
        this._layout = derived(this, reader => {
            const start = this._start.read(reader);
            if (!start) {
                return undefined;
            }
            const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
            const lineHeight = this._editor.observeLineHeightForPosition(this._edit.range.getStartPosition()).read(reader);
            const w = this._editor.getOption(59 /* EditorOption.fontInfo */).read(reader).typicalHalfwidthCharacterWidth;
            const width = this._edit.text.length * w + 5;
            const center = new Point(contentLeft + start.x + w / 2 - this._editor.scrollLeft.read(reader), start.y);
            const modified = Rect.fromLeftTopWidthHeight(center.x - width / 2, center.y + lineHeight + 5, width, lineHeight);
            const background = Rect.hull([Rect.fromPoint(center), modified]).withMargin(4);
            return {
                modified,
                center,
                background,
                lowerBackground: background.intersectVertical(new OffsetRange(modified.top - 2, Number.MAX_SAFE_INTEGER)),
            };
        });
        this._div = n.div({
            class: 'word-insert',
        }, [
            derived(this, reader => {
                const layout = mapOutFalsy(this._layout).read(reader);
                if (!layout) {
                    return [];
                }
                const modifiedBorderColor = asCssVariable(getModifiedBorderColor(this._tabAction).read(reader));
                return [
                    n.div({
                        style: {
                            position: 'absolute',
                            ...rectToProps(reader => layout.read(reader).lowerBackground),
                            borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                            background: 'var(--vscode-editor-background)'
                        }
                    }, []),
                    n.div({
                        style: {
                            position: 'absolute',
                            ...rectToProps(reader => layout.read(reader).modified),
                            borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                            padding: '0px',
                            textAlign: 'center',
                            background: 'var(--vscode-inlineEdit-modifiedChangedTextBackground)',
                            fontFamily: this._editor.getOption(58 /* EditorOption.fontFamily */),
                            fontSize: this._editor.getOption(61 /* EditorOption.fontSize */),
                            fontWeight: this._editor.getOption(62 /* EditorOption.fontWeight */),
                        }
                    }, [
                        this._edit.text,
                    ]),
                    n.div({
                        style: {
                            position: 'absolute',
                            ...rectToProps(reader => layout.read(reader).background),
                            borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                            border: `1px solid ${modifiedBorderColor}`,
                            //background: 'rgba(122, 122, 122, 0.12)', looks better
                            background: 'var(--vscode-inlineEdit-wordReplacementView-background)',
                        }
                    }, []),
                    n.svg({
                        viewBox: '0 0 12 18',
                        width: 12,
                        height: 18,
                        fill: 'none',
                        style: {
                            position: 'absolute',
                            left: derived(this, reader => layout.read(reader).center.x - 9),
                            top: derived(this, reader => layout.read(reader).center.y + 4),
                            transform: 'scale(1.4, 1.4)',
                        }
                    }, [
                        n.svgElem('path', {
                            d: 'M5.06445 0H7.35759C7.35759 0 7.35759 8.47059 7.35759 11.1176C7.35759 13.7647 9.4552 18 13.4674 18C17.4795 18 -2.58445 18 0.281373 18C3.14719 18 5.06477 14.2941 5.06477 11.1176C5.06477 7.94118 5.06445 0 5.06445 0Z',
                            fill: 'var(--vscode-inlineEdit-modifiedChangedTextBackground)',
                        })
                    ])
                ];
            })
        ]).keepUpdated(this._store);
        this.isHovered = constObservable(false);
        this._register(this._editor.createOverlayWidget({
            domNode: this._div.element,
            minContentWidthInPx: constObservable(0),
            position: constObservable({ preference: { top: 0, left: 0 } }),
            allowEditorOverflow: false,
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNXb3JkSW5zZXJ0Vmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzV29yZEluc2VydFZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFekYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFHbEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFN0QsTUFBTSxPQUFPLHlCQUEwQixTQUFRLFVBQVU7SUFZeEQsWUFDa0IsT0FBNkI7SUFDOUMsd0NBQXdDO0lBQ3ZCLEtBQXNCLEVBQ3RCLFVBQTRDO1FBRTdELEtBQUssRUFBRSxDQUFDO1FBTFMsWUFBTyxHQUFQLE9BQU8sQ0FBc0I7UUFFN0IsVUFBSyxHQUFMLEtBQUssQ0FBaUI7UUFDdEIsZUFBVSxH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