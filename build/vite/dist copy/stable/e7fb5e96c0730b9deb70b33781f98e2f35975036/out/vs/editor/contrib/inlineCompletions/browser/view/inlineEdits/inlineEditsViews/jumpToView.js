/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { n } from '../../../../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { RunOnceScheduler } from '../../../../../../../base/common/async.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, DebugLocation, derived, observableFromEvent } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { defaultKeybindingLabelStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { Range } from '../../../../../../common/core/range.js';
import { inlineSuggestCommitId } from '../../../controller/commandIds.js';
import { getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground } from '../theme.js';
import { rectToProps } from '../utils/utils.js';
let JumpToView = class JumpToView extends Disposable {
    constructor(_editor, options, _data, _themeService, _keybindingService, _contextKeyService) {
        super();
        this._editor = _editor;
        this._data = _data;
        this._themeService = _themeService;
        this._keybindingService = _keybindingService;
        this._contextKeyService = _contextKeyService;
        this._styles = derived(this, reader => ({
            background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString(),
        }));
        this._pos = derived(this, reader => {
            return this._editor.observePosition(derived(reader => this._data.read(reader)?.jumpToPosition || null), reader.store);
        }).flatten();
        this._layout = derived(this, reader => {
            const data = this._data.read(reader);
            if (!data) {
                return undefined;
            }
            const position = data.jumpToPosition;
            const lineHeight = this._editor.observeLineHeightForLine(constObservable(position.lineNumber)).read(reader);
            const scrollLeft = this._editor.scrollLeft.read(reader);
            const point = this._pos.read(reader);
            if (!point) {
                return undefined;
            }
            const layout = this._editor.layoutInfo.read(reader);
            const widgetRect = Rect.fromLeftTopWidthHeight(point.x + layout.contentLeft + 2 - scrollLeft, point.y, 100, lineHeight);
            return {
                widgetRect,
            };
        });
        this._blink = animateFixedValues([
            { value: true, durationMs: 600 },
            { value: false, durationMs: 600 },
        ]);
        this._widget = n.div({
            class: 'inline-edit-jump-to-widget',
            style: {
                position: 'absolute',
                display: this._layout.map(l => l ? 'flex' : 'none'),
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                ...rectToProps(reader => this._layout.read(reader)?.widgetRect),
            }
        }, derived(reader => {
            if (this._data.read(reader) === undefined) {
                return [];
            }
            // Main content container with rounded border
            return n.div({
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0 4px',
                    height: '100%',
                    backgroundColor: this._styles.map(s => s.background),
                    ['--vscodeIconForeground']: this._styles.map(s => s.foreground),
                    border: this._styles.map(s => `1px solid ${s.border}`),
                    borderRadius: '3px',
                    boxSizing: 'border-box',
                    fontSize: '11px',
                    color: this._styles.map(s => s.foreground),
                }
            }, [
                this._style === 'cursor' ?
                    n.elem('div', {
                        style: {
                            borderLeft: '2px solid',
                            height: 14,
                            opacity: this._blink.map(b => b ? '0' : '1'),
                        }
                    }) :
                    [
                        derived(() => n.elem('div', {}, keybindingLabel(this._keybinding))),
                        n.elem('div', { style: { lineHeight: this._layout.map(l => l?.widgetRect.height), marginTop: '-2px' } }, ['to jump',])
                    ],
            ]);
        }));
        this._style = options.style;
        this._keybinding = this._getKeybinding(inlineSuggestCommitId);
        const widget = this._widget.keepUpdated(this._store);
        this._register(this._editor.createOverlayWidget({
            domNode: widget.element,
            position: constObservable(null),
            allowEditorOverflow: false,
            minContentWidthInPx: constObservable(0),
        }));
        this._register(this._editor.setDecorations(derived(reader => {
            const data = this._data.read(reader);
            if (!data) {
                return [];
            }
            // use injected text at position
            return [{
                    range: Range.fromPositions(data.jumpToPosition, data.jumpToPosition),
                    options: {
                        description: 'inline-edit-jump-to-decoration',
                        inlineClassNameAffectsLetterSpacing: true,
                        showIfCollapsed: true,
                        after: {
                            content: this._style === 'label' ? '          ' : '  ',
                        }
                    },
                }];
        })));
    }
    _getKeybinding(commandId, debugLocation = DebugLocation.ofCaller()) {
        if (!commandId) {
            return constObservable(undefined);
        }
        return observableFromEvent(this, this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId), debugLocation);
        // TODO: use contextkeyservice to use different renderings
    }
};
JumpToView = __decorate([
    __param(3, IThemeService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService)
], JumpToView);
export { JumpToView };
function animateFixedValues(values, debugLocation = DebugLocation.ofCaller()) {
    let idx = 0;
    return observableFromEvent(undefined, (l) => {
        idx = 0;
        const timer = new RunOnceScheduler(() => {
            idx = (idx + 1) % values.length;
            l(null);
            timer.schedule(values[idx].durationMs);
        }, 0);
        timer.schedule(0);
        return timer;
    }, () => {
        return values[idx].value;
    }, debugLocation);
}
function keybindingLabel(keybinding) {
    return derived(_reader => n.div({
        style: {},
        ref: elem => {
            const keybindingLabel = _reader.store.add(new KeybindingLabel(elem, OS, {
                disableTitle: true,
                ...defaultKeybindingLabelStyles,
                keybindingLabelShadow: undefined,
                keybindingLabelForeground: asCssVariable(inlineEditIndicatorPrimaryForeground),
                keybindingLabelBackground: 'transparent',
                keybindingLabelBorder: asCssVariable(inlineEditIndicatorPrimaryForeground),
                keybindingLabelBottomBorder: undefined,
            }));
            _reader.store.add(autorun(reader => {
                keybindingLabel.set(keybinding.read(reader));
            }));
        }
    }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianVtcFRvVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2p1bXBUb1ZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUU3RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BKLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUM1RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDekYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTNGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFL0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFD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