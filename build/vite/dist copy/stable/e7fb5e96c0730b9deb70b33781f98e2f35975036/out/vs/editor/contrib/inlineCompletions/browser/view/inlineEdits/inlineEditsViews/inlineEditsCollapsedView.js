var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { singleTextRemoveCommonPrefix } from '../../../model/singleTextEditHelpers.js';
import { inlineEditIndicatorPrimaryBorder } from '../theme.js';
import { getEditorValidOverlayRect, PathBuilder, rectToProps } from '../utils/utils.js';
let InlineEditsCollapsedView = class InlineEditsCollapsedView extends Disposable {
    constructor(_editor, _edit, _accessibilityService) {
        super();
        this._editor = _editor;
        this._edit = _edit;
        this._accessibilityService = _accessibilityService;
        this.onDidClick = Event.None;
        this._iconRef = n.ref();
        this.isHovered = constObservable(false);
        this._editorObs = observableCodeEditor(this._editor);
        const firstEdit = this._edit.map(inlineEdit => inlineEdit?.edit?.replacements[0] ?? null);
        const startPosition = firstEdit.map(edit => edit ? singleTextRemoveCommonPrefix(edit, this._editor.getModel()).range.getStartPosition() : null);
        const observedStartPoint = this._editorObs.observePosition(startPosition, this._store);
        const startPoint = derived(reader => {
            const point = observedStartPoint.read(reader);
            if (!point) {
                return null;
            }
            const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
            const scrollLeft = this._editorObs.scrollLeft.read(reader);
            return new Point(contentLeft + point.x - scrollLeft, point.y);
        });
        const overlayElement = n.div({
            class: 'inline-edits-collapsed-view',
            style: {
                position: 'absolute',
                overflow: 'visible',
                top: '0px',
                left: '0px',
                display: 'block',
            },
        }, [
            [this.getCollapsedIndicator(startPoint)],
        ]).keepUpdated(this._store).element;
        this._register(this._editorObs.createOverlayWidget({
            domNode: overlayElement,
            position: constObservable(null),
            allowEditorOverflow: false,
            minContentWidthInPx: constObservable(0),
        }));
        this.isVisible = this._edit.map((inlineEdit, reader) => !!inlineEdit && startPoint.read(reader) !== null);
    }
    triggerAnimation() {
        if (this._accessibilityService.isMotionReduced()) {
            return new Animation(null, null).finished;
        }
        // PULSE ANIMATION:
        const animation = this._iconRef.element.animate([
            { offset: 0.00, transform: 'translateY(-3px)', },
            { offset: 0.20, transform: 'translateY(1px)', },
            { offset: 0.36, transform: 'translateY(-1px)', },
            { offset: 0.52, transform: 'translateY(1px)', },
            { offset: 0.68, transform: 'translateY(-1px)', },
            { offset: 0.84, transform: 'translateY(1px)', },
            { offset: 1.00, transform: 'translateY(0px)', },
        ], { duration: 2000 });
        return animation.finished;
    }
    getCollapsedIndicator(startPoint) {
        const contentLeft = this._editorObs.layoutInfoContentLeft;
        const startPointTranslated = startPoint.map((p, reader) => p ? p.deltaX(-contentLeft.read(reader)) : null);
        const iconPath = this.createIconPath(startPointTranslated);
        return n.svg({
            class: 'collapsedView',
            ref: this._iconRef,
            style: {
                position: 'absolute',
                ...rectToProps((r) => getEditorValidOverlayRect(this._editorObs).read(r)),
                overflow: 'hidden',
                pointerEvents: 'none',
            }
        }, [
            n.svgElem('path', {
                class: 'collapsedViewPath',
                d: iconPath,
                fill: asCssVariable(inlineEditIndicatorPrimaryBorder),
            }),
        ]);
    }
    createIconPath(indicatorPoint) {
        const width = 6;
        const triangleHeight = 3;
        const baseHeight = 1;
        return indicatorPoint.map(point => {
            if (!point) {
                return new PathBuilder().build();
            }
            const baseTopLeft = point.deltaX(-width / 2).deltaY(-baseHeight);
            const baseTopRight = baseTopLeft.deltaX(width);
            const baseBottomLeft = baseTopLeft.deltaY(baseHeight);
            const baseBottomRight = baseTopRight.deltaY(baseHeight);
            const triangleBottomCenter = baseBottomLeft.deltaX(width / 2).deltaY(triangleHeight);
            return new PathBuilder()
                .moveTo(baseTopLeft)
                .lineTo(baseTopRight)
                .lineTo(baseBottomRight)
                .lineTo(triangleBottomCenter)
                .lineTo(baseBottomLeft)
                .lineTo(baseTopLeft)
                .build();
        });
    }
};
InlineEditsCollapsedView = __decorate([
    __param(2, IAccessibilityService)
], InlineEditsCollapsedView);
export { InlineEditsCollapsedView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNDb2xsYXBzZWRWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNDb2xsYXBzZWRWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLE1BQU0sZ0RBQWdELENBQUM7QUFDdkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRXpGLE9BQU8sRUFBd0Isb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHdkYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQy9ELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFakYsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBU3ZELFlBQ2tCLE9BQW9CLEVBQ3BCLEtBQXFELEVBQy9DLHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUpTLFlB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