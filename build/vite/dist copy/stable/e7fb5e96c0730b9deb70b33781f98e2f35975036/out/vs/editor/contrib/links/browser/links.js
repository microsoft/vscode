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
var LinkDetector_1;
import { createCancelablePromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as platform from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import './links.css';
import { EditorAction, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ClickLinkGesture } from '../../gotoSymbol/browser/link/clickLinkGesture.js';
import { getLinks } from './getLinks.js';
import * as nls from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
let LinkDetector = class LinkDetector extends Disposable {
    static { LinkDetector_1 = this; }
    static { this.ID = 'editor.linkDetector'; }
    static get(editor) {
        return editor.getContribution(LinkDetector_1.ID);
    }
    constructor(editor, openerService, notificationService, languageFeaturesService, languageFeatureDebounceService) {
        super();
        this.editor = editor;
        this.openerService = openerService;
        this.notificationService = notificationService;
        this.languageFeaturesService = languageFeaturesService;
        this.providers = this.languageFeaturesService.linkProvider;
        this.debounceInformation = languageFeatureDebounceService.for(this.providers, 'Links', { min: 1000, max: 4000 });
        this.computeLinks = this._register(new RunOnceScheduler(() => this.computeLinksNow(), 1000));
        this.computePromise = null;
        this.activeLinksList = null;
        this.currentOccurrences = {};
        this.activeLinkDecorationId = null;
        const clickLinkGesture = this._register(new ClickLinkGesture(editor));
        this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
            this._onEditorMouseMove(mouseEvent, keyboardEvent);
        }));
        this._register(clickLinkGesture.onExecute((e) => {
            this.onEditorMouseUp(e);
        }));
        this._register(clickLinkGesture.onCancel((e) => {
            this.cleanUpActiveLinkDecoration();
        }));
        this._register(editor.onDidChangeConfiguration((e) => {
            if (!e.hasChanged(79 /* EditorOption.links */)) {
                return;
            }
            // Remove any links (for the getting disabled case)
            this.updateDecorations([]);
            // Stop any computation (for the getting disabled case)
            this.stop();
            // Start computing (for the getting enabled case)
            this.computeLinks.schedule(0);
        }));
        this._register(editor.onDidChangeModelContent((e) => {
            if (!this.editor.hasModel()) {
                return;
            }
            this.computeLinks.schedule(this.debounceInformation.get(this.editor.getModel()));
        }));
        this._register(editor.onDidChangeModel((e) => {
            this.currentOccurrences = {};
            this.activeLinkDecorationId = null;
            this.stop();
            this.computeLinks.schedule(0);
        }));
        this._register(editor.onDidChangeModelLanguage((e) => {
            this.stop();
            this.computeLinks.schedule(0);
        }));
        this._register(this.providers.onDidChange((e) => {
            this.stop();
            this.computeLinks.schedule(0);
        }));
        this.computeLinks.schedule(0);
    }
    async computeLinksNow() {
        if (!this.editor.hasModel() || !this.editor.getOption(79 /* EditorOption.links */)) {
            return;
        }
        const model = this.editor.getModel();
        if (model.isTooLargeForSyncing()) {
            return;
        }
        if (!this.providers.has(model)) {
            return;
        }
        if (this.activeLinksList) {
            this.activeLinksList.dispose();
            this.activeLinksList = null;
        }
        this.computePromise = createCancelablePromise(token => getLinks(this.providers, model, token));
        try {
            const sw = new StopWatch(false);
            this.activeLinksList = await this.computePromise;
            this.debounceInformation.update(model, sw.elapsed());
            if (model.isDisposed()) {
                return;
            }
            this.updateDecorations(this.activeLinksList.links);
        }
        catch (err) {
            onUnexpectedError(err);
        }
        finally {
            this.computePromise = null;
        }
    }
    updateDecorations(links) {
        const useMetaKey = (this.editor.getOption(86 /* EditorOption.multiCursorModifier */) === 'altKey');
        const oldDecorations = [];
        const keys = Object.keys(this.currentOccurrences);
        for (const decorationId of keys) {
            const occurence = this.currentOccurrences[decorationId];
            oldDecorations.push(occurence.decorationId);
        }
        const newDecorations = [];
        if (links) {
            // Not sure why this is sometimes null
            for (const link of links) {
                newDecorations.push(LinkOccurrence.decoration(link, useMetaKey));
            }
        }
        this.editor.changeDecorations((changeAccessor) => {
            const decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);
            this.currentOccurrences = {};
            this.activeLinkDecorationId = null;
            for (let i = 0, len = decorations.length; i < len; i++) {
                const occurence = new LinkOccurrence(links[i], decorations[i]);
                this.currentOccurrences[occurence.decorationId] = occurence;
            }
        });
    }
    _onEditorMouseMove(mouseEvent, withKey) {
        const useMetaKey = (this.editor.getOption(86 /* EditorOption.multiCursorModifier */) === 'altKey');
        if (this.isEnabled(mouseEvent, withKey)) {
            this.cleanUpActiveLinkDecoration(); // always remove previous link decoration as their can only be one
            const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
            if (occurrence) {
                this.editor.changeDecorations((changeAccessor) => {
                    occurrence.activate(changeAccessor, useMetaKey);
                    this.activeLinkDecorationId = occurrence.decorationId;
                });
            }
        }
        else {
            this.cleanUpActiveLinkDecoration();
        }
    }
    cleanUpActiveLinkDecoration() {
        const useMetaKey = (this.editor.getOption(86 /* EditorOption.multiCursorModifier */) === 'altKey');
        if (this.activeLinkDecorationId) {
            const occurrence = this.currentOccurrences[this.activeLinkDecorationId];
            if (occurrence) {
                this.editor.changeDecorations((changeAccessor) => {
                    occurrence.deactivate(changeAccessor, useMetaKey);
                });
            }
            this.activeLinkDecorationId = null;
        }
    }
    onEditorMouseUp(mouseEvent) {
        if (!this.isEnabled(mouseEvent)) {
            return;
        }
        const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
        if (!occurrence) {
            return;
        }
        this.openLinkOccurrence(occurrence, mouseEvent.hasSideBySideModifier, true /* from user gesture */);
    }
    openLinkOccurrence(occurrence, openToSide, fromUserGesture = false) {
        if (!this.openerService) {
            return;
        }
        const { link } = occurrence;
        link.resolve(CancellationToken.None).then(uri => {
            // Support for relative file URIs of the shape file://./relativeFile.txt or file:///./relativeFile.txt
            if (typeof uri === 'string' && this.editor.hasModel()) {
                const modelUri = this.editor.getModel().uri;
                if (modelUri.scheme === Schemas.file && uri.startsWith(`${Schemas.file}:`)) {
                    const parsedUri = URI.parse(uri);
                    if (parsedUri.scheme === Schemas.file) {
                        const fsPath = resources.originalFSPath(parsedUri);
                        let relativePath = null;
                        if (fsPath.startsWith('/./') || fsPath.startsWith('\\.\\')) {
                            relativePath = `.${fsPath.substr(1)}`;
                        }
                        else if (fsPath.startsWith('//./') || fsPath.startsWith('\\\\.\\')) {
                            relativePath = `.${fsPath.substr(2)}`;
                        }
                        if (relativePath) {
                            uri = resources.joinPath(modelUri, relativePath);
                        }
                    }
                }
            }
            return this.openerService.open(uri, { openToSide, fromUserGesture, allowContributedOpeners: true, allowCommands: true, fromWorkspace: true });
        }, err => {
            const messageOrError = err instanceof Error ? err.message : err;
            // different error cases
            if (messageOrError === 'invalid') {
                this.notificationService.warn(nls.localize('invalid.url', 'Failed to open this link because it is not well-formed: {0}', link.url.toString()));
            }
            else if (messageOrError === 'missing') {
                this.notificationService.warn(nls.localize('missing.url', 'Failed to open this link because its target is missing.'));
            }
            else {
                onUnexpectedError(err);
            }
        });
    }
    getLinkOccurrence(position) {
        if (!this.editor.hasModel() || !position) {
            return null;
        }
        const decorations = this.editor.getModel().getDecorationsInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column
        }, 0, true);
        for (const decoration of decorations) {
            const currentOccurrence = this.currentOccurrences[decoration.id];
            if (currentOccurrence) {
                return currentOccurrence;
            }
        }
        return null;
    }
    isEnabled(mouseEvent, withKey) {
        return Boolean((mouseEvent.target.type === 6 /* MouseTargetType.CONTENT_TEXT */)
            && ((mouseEvent.hasTriggerModifier || (withKey && withKey.keyCodeIsTriggerKey)) || mouseEvent.isMiddleClick && mouseEvent.mouseMiddleClickAction === 'openLink'));
    }
    stop() {
        this.computeLinks.cancel();
        if (this.activeLinksList) {
            this.activeLinksList?.dispose();
            this.activeLinksList = null;
        }
        if (this.computePromise) {
            this.computePromise.cancel();
            this.computePromise = null;
        }
    }
    dispose() {
        super.dispose();
        this.stop();
    }
};
LinkDetector = LinkDetector_1 = __decorate([
    __param(1, IOpenerService),
    __param(2, INotificationService),
    __param(3, ILanguageFeaturesService),
    __param(4, ILanguageFeatureDebounceService)
], LinkDetector);
export { LinkDetector };
const decoration = {
    general: ModelDecorationOptions.register({
        description: 'detected-link',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        collapseOnReplaceEdit: true,
        inlineClassName: 'detected-link'
    }),
    active: ModelDecorationOptions.register({
        description: 'detected-link-active',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        collapseOnReplaceEdit: true,
        inlineClassName: 'detected-link-active'
    })
};
class LinkOccurrence {
    static decoration(link, useMetaKey) {
        return {
            range: link.range,
            options: LinkOccurrence._getOptions(link, useMetaKey, false)
        };
    }
    static _getOptions(link, useMetaKey, isActive) {
        const options = { ...(isActive ? decoration.active : decoration.general) };
        options.hoverMessage = getHoverMessage(link, useMetaKey);
        return options;
    }
    constructor(link, decorationId) {
        this.link = link;
        this.decorationId = decorationId;
    }
    activate(changeAccessor, useMetaKey) {
        changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, true));
    }
    deactivate(changeAccessor, useMetaKey) {
        changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, false));
    }
}
function getHoverMessage(link, useMetaKey) {
    const executeCmd = link.url && /^command:/i.test(link.url.toString());
    const label = link.tooltip
        ? link.tooltip
        : executeCmd
            ? nls.localize('links.navigate.executeCmd', 'Execute command')
            : nls.localize('links.navigate.follow', 'Follow link');
    const kb = useMetaKey
        ? platform.isMacintosh
            ? nls.localize('links.navigate.kb.meta.mac', "cmd + click")
            : nls.localize('links.navigate.kb.meta', "ctrl + click")
        : platform.isMacintosh
            ? nls.localize('links.navigate.kb.alt.mac', "option + click")
            : nls.localize('links.navigate.kb.alt', "alt + click");
    if (link.url) {
        let nativeLabel = '';
        if (/^command:/i.test(link.url.toString())) {
            // Don't show complete command arguments in the native tooltip
            const match = link.url.toString().match(/^command:([^?#]+)/);
            if (match) {
                const commandId = match[1];
                nativeLabel = nls.localize('tooltip.explanation', "Execute command {0}", commandId);
            }
        }
        const hoverMessage = new MarkdownString('', true)
            .appendLink(link.url.toString(true).replace(/ /g, '%20'), label, nativeLabel)
            .appendMarkdown(` (${kb})`);
        return hoverMessage;
    }
    else {
        return new MarkdownString().appendText(`${label} (${kb})`);
    }
}
class OpenLinkAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.openLink',
            label: nls.localize2('label', "Open Link"),
            precondition: undefined
        });
    }
    run(accessor, editor) {
        const linkDetector = LinkDetector.get(editor);
        if (!linkDetector) {
            return;
        }
        if (!editor.hasModel()) {
            return;
        }
        const selections = editor.getSelections();
        for (const sel of selections) {
            const link = linkDetector.getLinkOccurrence(sel.getEndPosition());
            if (link) {
                linkDetector.openLinkOccurrence(link, false);
            }
        }
    }
}
registerEditorContribution(LinkDetector.ID, LinkDetector, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorAction(OpenLinkAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9saW5rcy9icm93c2VyL2xpbmtzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEtBQUssU0FBUyxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxhQUFhLENBQUM7QUFFckIsT0FBTyxFQUFFLFlBQVksRUFBbUMsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFPekssT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxFQUErQiwrQkFBK0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ25JLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBK0MsTUFBTSxtREFBbUQsQ0FBQztB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