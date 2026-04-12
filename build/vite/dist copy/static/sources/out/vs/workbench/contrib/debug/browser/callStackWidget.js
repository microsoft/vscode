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
var FrameCodeRenderer_1, MissingCodeRenderer_1, SkippedRenderer_1;
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { assertNever } from '../../../../base/common/assert.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, observableValue, transaction } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ClickLinkGesture } from '../../../../editor/contrib/gotoSymbol/browser/link/clickLinkGesture.js';
import { localize, localize2 } from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ResourceLabel } from '../../../browser/labels.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { makeStackFrameColumnDecoration, TOP_STACK_FRAME_DECORATION } from './callStackEditorContribution.js';
import './media/callStackWidget.css';
export class CallStackFrame {
    constructor(name, source, line = 1, column = 1) {
        this.name = name;
        this.source = source;
        this.line = line;
        this.column = column;
    }
}
export class SkippedCallFrames {
    constructor(label, load) {
        this.label = label;
        this.load = load;
    }
}
export class CustomStackFrame {
    constructor() {
        this.showHeader = observableValue('CustomStackFrame.showHeader', true);
    }
}
class WrappedCallStackFrame extends CallStackFrame {
    constructor(original) {
        super(original.name, original.source, original.line, original.column);
        this.editorHeight = observableValue('WrappedCallStackFrame.height', this.source ? 100 : 0);
        this.collapsed = observableValue('WrappedCallStackFrame.collapsed', false);
        this.height = derived(reader => {
            return this.collapsed.read(reader) ? CALL_STACK_WIDGET_HEADER_HEIGHT : CALL_STACK_WIDGET_HEADER_HEIGHT + this.editorHeight.read(reader);
        });
    }
}
class WrappedCustomStackFrame {
    constructor(original) {
        this.original = original;
        this.collapsed = observableValue('WrappedCallStackFrame.collapsed', false);
        this.height = derived(reader => {
            const headerHeight = this.original.showHeader.read(reader) ? CALL_STACK_WIDGET_HEADER_HEIGHT : 0;
            return this.collapsed.read(reader) ? headerHeight : headerHeight + this.original.height.read(reader);
        });
    }
}
const isFrameLike = (item) => item instanceof WrappedCallStackFrame || item instanceof WrappedCustomStackFrame;
const WIDGET_CLASS_NAME = 'multiCallStackWidget';
/**
 * A reusable widget that displays a call stack as a series of editors. Note
 * that this both used in debug's exception widget as well as in the testing
 * call stack view.
 */
let CallStackWidget = class CallStackWidget extends Disposable {
    get onDidChangeContentHeight() {
        return this.list.onDidChangeContentHeight;
    }
    get onDidScroll() {
        return this.list.onDidScroll;
    }
    get contentHeight() {
        return this.list.contentHeight;
    }
    constructor(container, containingEditor, instantiationService) {
        super();
        this.layoutEmitter = this._register(new Emitter());
        this.currentFramesDs = this._register(new DisposableStore());
        container.classList.add(WIDGET_CLASS_NAME);
        this._register(toDisposable(() => container.classList.remove(WIDGET_CLASS_NAME)));
        this.list = this._register(instantiationService.createInstance(WorkbenchList, 'TestResultStackWidget', container, new StackDelegate(), [
            instantiationService.createInstance(FrameCodeRenderer, containingEditor, this.layoutEmitter.event),
            instantiationService.createInstance(MissingCodeRenderer),
            instantiationService.createInstance(CustomRenderer),
            instantiationService.createInstance(SkippedRenderer, (i) => this.loadFrame(i)),
        ], {
            multipleSelectionSupport: false,
            mouseSupport: false,
            keyboardSupport: false,
            setRowLineHeight: false,
            alwaysConsumeMouseWheel: false,
            accessibilityProvider: instantiationService.createInstance(StackAccessibilityProvider),
        }));
    }
    /** Replaces the call frames display in the view. */
    setFrames(frames) {
        // cancel any existing load
        this.currentFramesDs.clear();
        const cts = new CancellationTokenSource();
        this.currentFramesDs.add(toDisposable(() => cts.dispose(true)));
        this.cts = cts;
        this.list.splice(0, this.list.length, this.mapFrames(frames));
    }
    layout(height, width) {
        this.list.layout(height, width);
        this.layoutEmitter.fire();
    }
    collapseAll() {
        transaction(tx => {
            for (let i = 0; i < this.list.length; i++) {
                const frame = this.list.element(i);
                if (isFrameLike(frame)) {
                    frame.collapsed.set(true, tx);
                }
            }
        });
    }
    async loadFrame(replacing) {
        if (!this.cts) {
            return;
        }
        const frames = await replacing.load(this.cts.token);
        if (this.cts.token.isCancellationRequested) {
            return;
        }
        const index = this.list.indexOf(replacing);
        this.list.splice(index, 1, this.mapFrames(frames));
    }
    mapFrames(frames) {
        const result = [];
        for (const frame of frames) {
            if (frame instanceof SkippedCallFrames) {
                result.push(frame);
                continue;
            }
            const wrapped = frame instanceof CustomStackFrame
                ? new WrappedCustomStackFrame(frame) : new WrappedCallStackFrame(frame);
            result.push(wrapped);
            this.currentFramesDs.add(autorun(reader => {
                const height = wrapped.height.read(reader);
                const idx = this.list.indexOf(wrapped);
                if (idx !== -1) {
                    this.list.updateElementHeight(idx, height);
                }
            }));
        }
        return result;
    }
};
CallStackWidget = __decorate([
    __param(2, IInstantiationService)
], CallStackWidget);
export { CallStackWidget };
let StackAccessibilityProvider = class StackAccessibilityProvider {
    constructor(labelService) {
        this.labelService = labelService;
    }
    getAriaLabel(e) {
        if (e instanceof SkippedCallFrames) {
            return e.label;
        }
        if (e instanceof WrappedCustomStackFrame) {
            return e.original.label;
        }
        if (e instanceof CallStackFrame) {
            if (e.source && e.line) {
                return localize({
                    comment: ['{0} is an extension-defined label, then line number and filename'],
                    key: 'stackTraceLabel',
                }, '{0}, line {1} in {2}', e.name, e.line, this.labelService.getUriLabel(e.source, { relative: true }));
            }
            return e.name;
        }
        assertNever(e);
    }
    getWidgetAriaLabel() {
        return localize('stackTrace', 'Stack Trace');
    }
};
StackAccessibilityProvider = __decorate([
    __param(0, ILabelService)
], StackAccessibilityProvider);
class StackDelegate {
    getHeight(element) {
        if (element instanceof CallStackFrame || element instanceof WrappedCustomStackFrame) {
            return element.height.get();
        }
        if (element instanceof SkippedCallFrames) {
            return CALL_STACK_WIDGET_HEADER_HEIGHT;
        }
        assertNever(element);
    }
    getTemplateId(element) {
        if (element instanceof CallStackFrame) {
            return element.source ? FrameCodeRenderer.templateId : MissingCodeRenderer.templateId;
        }
        if (element instanceof SkippedCallFrames) {
            return SkippedRenderer.templateId;
        }
        if (element instanceof WrappedCustomStackFrame) {
            return CustomRenderer.templateId;
        }
        assertNever(element);
    }
}
const editorOptions = {
    scrollBeyondLastLine: false,
    scrollbar: {
        vertical: 'hidden',
        horizontal: 'hidden',
        handleMouseWheel: false,
        useShadows: false,
    },
    overviewRulerLanes: 0,
    fixedOverflowWidgets: true,
    overviewRulerBorder: false,
    stickyScroll: { enabled: false },
    minimap: { enabled: false },
    readOnly: true,
    automaticLayout: false,
};
const makeFrameElements = () => dom.h('div.multiCallStackFrame', [
    dom.h('div.header@header', [
        dom.h('div.collapse-button@collapseButton'),
        dom.h('div.title.show-file-icons@title'),
        dom.h('div.actions@actions'),
    ]),
    dom.h('div.editorParent', [
        dom.h('div.editorContainer@editor'),
    ])
]);
export const CALL_STACK_WIDGET_HEADER_HEIGHT = 24;
let AbstractFrameRenderer = class AbstractFrameRenderer {
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
    }
    renderTemplate(container) {
        const elements = makeFrameElements();
        container.appendChild(elements.root);
        const templateStore = new DisposableStore();
        container.classList.add('multiCallStackFrameContainer');
        templateStore.add(toDisposable(() => {
            container.classList.remove('multiCallStackFrameContainer');
            elements.root.remove();
        }));
        const label = templateStore.add(this.instantiationService.createInstance(ResourceLabel, elements.title, {}));
        const collapse = templateStore.add(new Button(elements.collapseButton, {}));
        const contentId = generateUuid();
        elements.editor.id = contentId;
        elements.editor.role = 'region';
        elements.collapseButton.setAttribute('aria-controls', contentId);
        return this.finishRenderTemplate({
            container,
            decorations: [],
            elements,
            label,
            collapse,
            elementStore: templateStore.add(new DisposableStore()),
            templateStore,
        });
    }
    renderElement(element, index, template) {
        const { elementStore } = template;
        elementStore.clear();
        const item = element;
        this.setupCollapseButton(item, template);
    }
    setupCollapseButton(item, { elementStore, elements, collapse }) {
        elementStore.add(autorun(reader => {
            collapse.element.className = '';
            const collapsed = item.collapsed.read(reader);
            collapse.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
            collapse.element.ariaExpanded = String(!collapsed);
            elements.root.classList.toggle('collapsed', collapsed);
        }));
        const toggleCollapse = () => item.collapsed.set(!item.collapsed.get(), undefined);
        elementStore.add(collapse.onDidClick(toggleCollapse));
        elementStore.add(dom.addDisposableListener(elements.title, 'click', toggleCollapse));
    }
    disposeElement(element, index, templateData) {
        templateData.elementStore.clear();
    }
    disposeTemplate(templateData) {
        templateData.templateStore.dispose();
    }
};
AbstractFrameRenderer = __decorate([
    __param(0, IInstantiationService)
], AbstractFrameRenderer);
const CONTEXT_LINES = 2;
/** Renderer for a normal stack frame where code is available. */
let FrameCodeRenderer = class FrameCodeRenderer extends AbstractFrameRenderer {
    static { FrameCodeRenderer_1 = this; }
    static { this.templateId = 'f'; }
    constructor(containingEditor, onLayout, modelService, instantiationService) {
        super(instantiationService);
        this.containingEditor = containingEditor;
        this.onLayout = onLayout;
        this.modelService = modelService;
        this.templateId = FrameCodeRenderer_1.templateId;
    }
    finishRenderTemplate(data) {
        // override default e.g. language contributions, only allow users to click
        // on code in the call stack to go to its source location
        const contributions = [{
                id: ClickToLocationContribution.ID,
                instantiation: 2 /* EditorContributionInstantiation.BeforeFirstInteraction */,
                ctor: ClickToLocationContribution,
            }];
        const editor = this.containingEditor
            ? this.instantiationService.createInstance(EmbeddedCodeEditorWidget, data.elements.editor, editorOptions, { isSimpleWidget: true, contributions }, this.containingEditor)
            : this.instantiationService.createInstance(CodeEditorWidget, data.elements.editor, editorOptions, { isSimpleWidget: true, contributions });
        data.templateStore.add(editor);
        const toolbar = data.templateStore.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, data.elements.actions, MenuId.DebugCallStackToolbar, {
            menuOptions: { shouldForwardArgs: true },
            actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
        }));
        return { ...data, editor, toolbar };
    }
    renderElement(element, index, template) {
        super.renderElement(element, index, template);
        const { elementStore, editor } = template;
        const item = element;
        const uri = item.source;
        template.label.element.setFile(uri);
        const cts = new CancellationTokenSource();
        elementStore.add(toDisposable(() => cts.dispose(true)));
        this.modelService.createModelReference(uri).then(reference => {
            if (cts.token.isCancellationRequested) {
                return reference.dispose();
            }
            elementStore.add(reference);
            editor.setModel(reference.object.textEditorModel);
            this.setupEditorAfterModel(item, template);
            this.setupEditorLayout(item, template);
        });
    }
    setupEditorLayout(item, { elementStore, container, editor }) {
        const layout = () => {
            const prev = editor.getContentHeight();
            editor.layout({ width: container.clientWidth, height: prev });
            const next = editor.getContentHeight();
            if (next !== prev) {
                editor.layout({ width: container.clientWidth, height: next });
            }
            item.editorHeight.set(next, undefined);
        };
        elementStore.add(editor.onDidChangeModelDecorations(layout));
        elementStore.add(editor.onDidChangeModelContent(layout));
        elementStore.add(editor.onDidChangeModelOptions(layout));
        elementStore.add(this.onLayout(layout));
        layout();
    }
    setupEditorAfterModel(item, template) {
        const range = Range.fromPositions({
            column: item.column ?? 1,
            lineNumber: item.line ?? 1,
        });
        template.toolbar.context = { uri: item.source, range };
        template.editor.setHiddenAreas([
            Range.fromPositions({ column: 1, lineNumber: 1 }, { column: 1, lineNumber: Math.max(1, item.line - CONTEXT_LINES - 1) }),
            Range.fromPositions({ column: 1, lineNumber: item.line + CONTEXT_LINES + 1 }, { column: 1, lineNumber: 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */ }),
        ]);
        template.editor.changeDecorations(accessor => {
            for (const d of template.decorations) {
                accessor.removeDecoration(d);
            }
            template.decorations.length = 0;
            const beforeRange = range.setStartPosition(range.startLineNumber, 1);
            const hasCharactersBefore = !!template.editor.getModel()?.getValueInRange(beforeRange).trim();
            const decoRange = range.setEndPosition(range.startLineNumber, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */);
            template.decorations.push(accessor.addDecoration(decoRange, makeStackFrameColumnDecoration(!hasCharactersBefore)));
            template.decorations.push(accessor.addDecoration(decoRange, TOP_STACK_FRAME_DECORATION));
        });
        item.editorHeight.set(template.editor.getContentHeight(), undefined);
    }
};
FrameCodeRenderer = FrameCodeRenderer_1 = __decorate([
    __param(2, ITextModelService),
    __param(3, IInstantiationService)
], FrameCodeRenderer);
/** Renderer for a call frame that's missing a URI */
let MissingCodeRenderer = class MissingCodeRenderer {
    static { MissingCodeRenderer_1 = this; }
    static { this.templateId = 'm'; }
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
        this.templateId = MissingCodeRenderer_1.templateId;
    }
    renderTemplate(container) {
        const elements = makeFrameElements();
        elements.root.classList.add('missing');
        container.appendChild(elements.root);
        const label = this.instantiationService.createInstance(ResourceLabel, elements.title, {});
        return { elements, label };
    }
    renderElement(element, _index, templateData) {
        const cast = element;
        templateData.label.element.setResource({
            name: cast.name,
            description: localize('stackFrameLocation', 'Line {0} column {1}', cast.line, cast.column),
            range: { startLineNumber: cast.line, startColumn: cast.column, endColumn: cast.column, endLineNumber: cast.line },
        }, {
            icon: Codicon.fileBinary,
        });
    }
    disposeTemplate(templateData) {
        templateData.label.dispose();
        templateData.elements.root.remove();
    }
};
MissingCodeRenderer = MissingCodeRenderer_1 = __decorate([
    __param(0, IInstantiationService)
], MissingCodeRenderer);
/** Renderer for a call frame that's missing a URI */
class CustomRenderer extends AbstractFrameRenderer {
    constructor() {
        super(...arguments);
        this.templateId = CustomRenderer.templateId;
    }
    static { this.templateId = 'c'; }
    finishRenderTemplate(data) {
        return data;
    }
    renderElement(element, index, template) {
        super.renderElement(element, index, template);
        const item = element;
        const { elementStore, container, label } = template;
        label.element.setResource({ name: item.original.label }, { icon: item.original.icon });
        elementStore.add(autorun(reader => {
            template.elements.header.style.display = item.original.showHeader.read(reader) ? '' : 'none';
        }));
        elementStore.add(autorunWithStore((reader, store) => {
            if (!item.collapsed.read(reader)) {
                store.add(item.original.render(container));
            }
        }));
        const actions = item.original.renderActions?.(template.elements.actions);
        if (actions) {
            elementStore.add(actions);
        }
    }
}
/** Renderer for a button to load more call frames */
let SkippedRenderer = class SkippedRenderer {
    static { SkippedRenderer_1 = this; }
    static { this.templateId = 's'; }
    constructor(loadFrames, notificationService) {
        this.loadFrames = loadFrames;
        this.notificationService = notificationService;
        this.templateId = SkippedRenderer_1.templateId;
    }
    renderTemplate(container) {
        const store = new DisposableStore();
        const button = new Button(container, { title: '', ...defaultButtonStyles });
        const data = { button, store };
        store.add(button);
        store.add(button.onDidClick(() => {
            if (!data.current || !button.enabled) {
                return;
            }
            button.enabled = false;
            this.loadFrames(data.current).catch(e => {
                this.notificationService.error(localize('failedToLoadFrames', 'Failed to load stack frames: {0}', e.message));
            });
        }));
        return data;
    }
    renderElement(element, index, templateData) {
        const cast = element;
        templateData.button.enabled = true;
        templateData.button.label = cast.label;
        templateData.current = cast;
    }
    disposeTemplate(templateData) {
        templateData.store.dispose();
    }
};
SkippedRenderer = SkippedRenderer_1 = __decorate([
    __param(1, INotificationService)
], SkippedRenderer);
/** A simple contribution that makes all data in the editor clickable to go to the location */
let ClickToLocationContribution = class ClickToLocationContribution extends Disposable {
    static { this.ID = 'clickToLocation'; }
    constructor(editor, editorService) {
        super();
        this.editor = editor;
        this.linkDecorations = editor.createDecorationsCollection();
        this._register(toDisposable(() => this.linkDecorations.clear()));
        const clickLinkGesture = this._register(new ClickLinkGesture(editor));
        this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
            this.onMove(mouseEvent);
        }));
        this._register(clickLinkGesture.onExecute((e) => {
            const model = this.editor.getModel();
            if (!this.current || !model) {
                return;
            }
            editorService.openEditor({
                resource: model.uri,
                options: {
                    selection: Range.fromPositions(new Position(this.current.line, this.current.word.startColumn)),
                    selectionRevealType: 1 /* TextEditorSelectionRevealType.CenterIfOutsideViewport */,
                },
            }, e.hasSideBySideModifier ? SIDE_GROUP : undefined);
        }));
    }
    onMove(mouseEvent) {
        if (!mouseEvent.hasTriggerModifier) {
            return this.clear();
        }
        const position = mouseEvent.target.position;
        const word = position && this.editor.getModel()?.getWordAtPosition(position);
        if (!word) {
            return this.clear();
        }
        const prev = this.current?.word;
        if (prev && prev.startColumn === word.startColumn && prev.endColumn === word.endColumn && prev.word === word.word) {
            return;
        }
        this.current = { word, line: position.lineNumber };
        this.linkDecorations.set([{
                range: new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                options: {
                    description: 'call-stack-go-to-file-link',
                    inlineClassName: 'call-stack-go-to-file-link',
                },
            }]);
    }
    clear() {
        this.linkDecorations.clear();
        this.current = undefined;
    }
};
ClickToLocationContribution = __decorate([
    __param(1, IEditorService)
], ClickToLocationContribution);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'callStackWidget.goToFile',
            title: localize2('goToFile', 'Open File'),
            icon: Codicon.goToFile,
            menu: {
                id: MenuId.DebugCallStackToolbar,
                order: 22,
                group: 'navigation',
            },
        });
    }
    async run(accessor, { uri, range }) {
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({
            resource: uri,
            options: {
                selection: range,
                selectionRevealType: 1 /* TextEditorSelectionRevealType.CenterIfOutsideViewport */,
            },
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbFN0YWNrV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9jYWxsU3RhY2tXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBR3RFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RyxPQUFPLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBb0MsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBSTNKLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUcvRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUVwSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBSWhFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxnQkFB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