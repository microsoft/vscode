/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow, addDisposableListener, n } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, disposableObservableValue, observableValue } from '../../../../base/common/observable.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';
import { Point } from '../../../common/core/2d/point.js';
import { AnimationFrameScheduler } from '../../inlineCompletions/browser/model/animation.js';
import { appendRemoveOnDispose } from '../../../browser/widget/diffEditor/utils.js';
import './middleScroll.css';
export class MiddleScrollController extends Disposable {
    static { this.ID = 'editor.contrib.middleScroll'; }
    static get(editor) {
        return editor.getContribution(MiddleScrollController.ID);
    }
    constructor(_editor) {
        super();
        this._editor = _editor;
        const obsEditor = observableCodeEditor(this._editor);
        const scrollOnMiddleClick = obsEditor.getOption(171 /* EditorOption.scrollOnMiddleClick */);
        this._register(autorun(reader => {
            if (!scrollOnMiddleClick.read(reader)) {
                return;
            }
            const editorDomNode = obsEditor.domNode.read(reader);
            if (!editorDomNode) {
                return;
            }
            const scrollingSession = reader.store.add(disposableObservableValue('scrollingSession', undefined));
            reader.store.add(this._editor.onMouseDown(e => {
                const session = scrollingSession.read(undefined);
                if (session) {
                    scrollingSession.set(undefined, undefined);
                    return;
                }
                if (!e.event.middleButton) {
                    return;
                }
                e.event.stopPropagation();
                e.event.preventDefault();
                const store = new DisposableStore();
                const initialPos = new Point(e.event.posx, e.event.posy);
                const mousePos = observeWindowMousePos(getWindow(editorDomNode), initialPos, store);
                const mouseDeltaAfterThreshold = mousePos.map(v => v.subtract(initialPos).withThreshold(5));
                const editorDomNodeRect = editorDomNode.getBoundingClientRect();
                const initialMousePosInEditor = new Point(initialPos.x - editorDomNodeRect.left, initialPos.y - editorDomNodeRect.top);
                scrollingSession.set({
                    mouseDeltaAfterThreshold,
                    initialMousePosInEditor,
                    didScroll: false,
                    dispose: () => store.dispose(),
                }, undefined);
                store.add(this._editor.onMouseUp(e => {
                    const session = scrollingSession.read(undefined);
                    if (session && session.didScroll) {
                        // Only cancel session on release if the user scrolled during it
                        scrollingSession.set(undefined, undefined);
                    }
                }));
                store.add(this._editor.onKeyDown(e => {
                    scrollingSession.set(undefined, undefined);
                }));
            }));
            reader.store.add(autorun(reader => {
                const session = scrollingSession.read(reader);
                if (!session) {
                    return;
                }
                let lastTime = Date.now();
                reader.store.add(autorun(reader => {
                    AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader);
                    const curTime = Date.now();
                    const frameDurationMs = curTime - lastTime;
                    lastTime = curTime;
                    const mouseDelta = session.mouseDeltaAfterThreshold.read(undefined);
                    // scroll by mouse delta every 32ms
                    const factor = frameDurationMs / 32;
                    const scrollDelta = mouseDelta.scale(factor);
                    const scrollPos = new Point(this._editor.getScrollLeft(), this._editor.getScrollTop());
                    this._editor.setScrollPosition(toScrollPosition(scrollPos.add(scrollDelta)));
                    if (!scrollDelta.isZero()) {
                        session.didScroll = true;
                    }
                }));
                const directionAttr = derived(reader => {
                    const delta = session.mouseDeltaAfterThreshold.read(reader);
                    let direction = '';
                    direction += (delta.y < 0 ? 'n' : (delta.y > 0 ? 's' : ''));
                    direction += (delta.x < 0 ? 'w' : (delta.x > 0 ? 'e' : ''));
                    return direction;
                });
                reader.store.add(autorun(reader => {
                    editorDomNode.setAttribute('data-scroll-direction', directionAttr.read(reader));
                }));
            }));
            const dotDomElem = reader.store.add(n.div({
                class: ['scroll-editor-on-middle-click-dot', scrollingSession.map(session => session ? '' : 'hidden')],
                style: {
                    left: scrollingSession.map((session) => session ? session.initialMousePosInEditor.x : 0),
                    top: scrollingSession.map((session) => session ? session.initialMousePosInEditor.y : 0),
                }
            }).toDisposableLiveElement());
            reader.store.add(appendRemoveOnDispose(editorDomNode, dotDomElem.element));
            reader.store.add(autorun(reader => {
                const session = scrollingSession.read(reader);
                editorDomNode.classList.toggle('scroll-editor-on-middle-click-editor', !!session);
            }));
        }));
    }
}
function observeWindowMousePos(window, initialPos, store) {
    const val = observableValue('pos', initialPos);
    store.add(addDisposableListener(window, 'mousemove', (e) => {
        val.set(new Point(e.pageX, e.pageY), undefined);
    }));
    return val;
}
function toScrollPosition(p) {
    return {
        scrollLeft: p.x,
        scrollTop: p.y,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlkZGxlU2Nyb2xsQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL21pZGRsZVNjcm9sbC9icm93c2VyL21pZGRsZVNjcm9sbENvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBSWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLHlCQUF5QixFQUFlLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLG9CQUFvQixDQUFDO0FBRTVCLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxVQUFVO2FBQzlCLE9BQUUsR0FBRyw2QkFBNkIsQ0FBQztJQUUxRCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQW1CO1FBQzdCLE9BQU8sTUFBTSxDQUFDLGVBQWUsQ0FBeUIsc0JBQXNCLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUVELFlBQ2tCLE9BQW9CO1FBRXJDLEtBQUssRUFBRSxDQUFDO1FBRlMsWUFBTyxHQUFQLE9BQU8sQ0FBYTtRQUlyQyxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFD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