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
import { coalesce } from '../../../../base/common/arrays.js';
import { UriList } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { DocumentPasteTriggerKind } from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
class SimplePasteAndDropProvider {
    constructor(kind) {
        this.copyMimeTypes = [];
        this.kind = kind;
        this.providedDropEditKinds = [this.kind];
        this.providedPasteEditKinds = [this.kind];
    }
    async provideDocumentPasteEdits(_model, _ranges, dataTransfer, context, token) {
        const edit = await this.getEdit(dataTransfer, token);
        if (!edit) {
            return undefined;
        }
        return {
            edits: [{ insertText: edit.insertText, title: edit.title, kind: edit.kind, handledMimeType: edit.handledMimeType, yieldTo: edit.yieldTo }],
            dispose() { },
        };
    }
    async provideDocumentDropEdits(_model, _position, dataTransfer, token) {
        const edit = await this.getEdit(dataTransfer, token);
        if (!edit) {
            return;
        }
        return {
            edits: [{ insertText: edit.insertText, title: edit.title, kind: edit.kind, handledMimeType: edit.handledMimeType, yieldTo: edit.yieldTo }],
            dispose() { },
        };
    }
}
export class DefaultTextPasteOrDropEditProvider extends SimplePasteAndDropProvider {
    static { this.id = 'text'; }
    constructor() {
        super(HierarchicalKind.Empty.append('text', 'plain'));
        this.id = DefaultTextPasteOrDropEditProvider.id;
        this.dropMimeTypes = [Mimes.text];
        this.pasteMimeTypes = [Mimes.text];
    }
    async getEdit(dataTransfer, _token) {
        const textEntry = dataTransfer.get(Mimes.text);
        if (!textEntry) {
            return;
        }
        // Suppress if there's also a uriList entry.
        // Typically the uri-list contains the same text as the text entry so showing both is confusing.
        if (dataTransfer.has(Mimes.uriList)) {
            return;
        }
        const insertText = await textEntry.asString();
        return {
            handledMimeType: Mimes.text,
            title: localize('text.label', "Insert Plain Text"),
            insertText,
            kind: this.kind,
        };
    }
}
class PathProvider extends SimplePasteAndDropProvider {
    constructor() {
        super(HierarchicalKind.Empty.append('uri', 'path', 'absolute'));
        this.dropMimeTypes = [Mimes.uriList];
        this.pasteMimeTypes = [Mimes.uriList];
    }
    async getEdit(dataTransfer, token) {
        const entries = await extractUriList(dataTransfer);
        if (!entries.length || token.isCancellationRequested) {
            return;
        }
        let uriCount = 0;
        const insertText = entries
            .map(({ uri, originalText }) => {
            if (uri.scheme === Schemas.file) {
                return uri.fsPath;
            }
            else {
                uriCount++;
                return originalText;
            }
        })
            .join(' ');
        let label;
        if (uriCount > 0) {
            // Dropping at least one generic uri (such as https) so use most generic label
            label = entries.length > 1
                ? localize('defaultDropProvider.uriList.uris', "Insert Uris")
                : localize('defaultDropProvider.uriList.uri', "Insert Uri");
        }
        else {
            // All the paths are file paths
            label = entries.length > 1
                ? localize('defaultDropProvider.uriList.paths', "Insert Paths")
                : localize('defaultDropProvider.uriList.path', "Insert Path");
        }
        return {
            handledMimeType: Mimes.uriList,
            insertText,
            title: label,
            kind: this.kind,
        };
    }
}
let RelativePathProvider = class RelativePathProvider extends SimplePasteAndDropProvider {
    constructor(_workspaceContextService) {
        super(HierarchicalKind.Empty.append('uri', 'path', 'relative'));
        this._workspaceContextService = _workspaceContextService;
        this.dropMimeTypes = [Mimes.uriList];
        this.pasteMimeTypes = [Mimes.uriList];
    }
    async getEdit(dataTransfer, token) {
        const entries = await extractUriList(dataTransfer);
        if (!entries.length || token.isCancellationRequested) {
            return;
        }
        const relativeUris = coalesce(entries.map(({ uri }) => {
            const root = this._workspaceContextService.getWorkspaceFolder(uri);
            return root ? relativePath(root.uri, uri) : undefined;
        }));
        if (!relativeUris.length) {
            return;
        }
        return {
            handledMimeType: Mimes.uriList,
            insertText: relativeUris.join(' '),
            title: entries.length > 1
                ? localize('defaultDropProvider.uriList.relativePaths', "Insert Relative Paths")
                : localize('defaultDropProvider.uriList.relativePath', "Insert Relative Path"),
            kind: this.kind,
        };
    }
};
RelativePathProvider = __decorate([
    __param(0, IWorkspaceContextService)
], RelativePathProvider);
class PasteHtmlProvider {
    constructor() {
        this.kind = new HierarchicalKind('html');
        this.providedPasteEditKinds = [this.kind];
        this.copyMimeTypes = [];
        this.pasteMimeTypes = ['text/html'];
        this._yieldTo = [{ mimeType: Mimes.text }];
    }
    async provideDocumentPasteEdits(_model, _ranges, dataTransfer, context, token) {
        if (context.triggerKind !== DocumentPasteTriggerKind.PasteAs && !context.only?.contains(this.kind)) {
            return;
        }
        const entry = dataTransfer.get('text/html');
        const htmlText = await entry?.asString();
        if (!htmlText || token.isCancellationRequested) {
            return;
        }
        return {
            dispose() { },
            edits: [{
                    insertText: htmlText,
                    yieldTo: this._yieldTo,
                    title: localize('pasteHtmlLabel', 'Insert HTML'),
                    kind: this.kind,
                }],
        };
    }
}
async function extractUriList(dataTransfer) {
    const urlListEntry = dataTransfer.get(Mimes.uriList);
    if (!urlListEntry) {
        return [];
    }
    const strUriList = await urlListEntry.asString();
    const entries = [];
    for (const entry of UriList.parse(strUriList)) {
        try {
            entries.push({ uri: URI.parse(entry), originalText: entry });
        }
        catch {
            // noop
        }
    }
    return entries;
}
const genericLanguageSelector = { scheme: '*', hasAccessToAllModels: true };
let DefaultDropProvidersFeature = class DefaultDropProvidersFeature extends Disposable {
    constructor(languageFeaturesService, workspaceContextService) {
        super();
        this._register(languageFeaturesService.documentDropEditProvider.register(genericLanguageSelector, new DefaultTextPasteOrDropEditProvider()));
        this._register(languageFeaturesService.documentDropEditProvider.register(genericLanguageSelector, new PathProvider()));
        this._register(languageFeaturesService.documentDropEditProvider.register(genericLanguageSelector, new RelativePathProvider(workspaceContextService)));
    }
};
DefaultDropProvidersFeature = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IWorkspaceContextService)
], DefaultDropProvidersFeature);
export { DefaultDropProvidersFeature };
let DefaultPasteProvidersFeature = class DefaultPasteProvidersFeature extends Disposable {
    constructor(languageFeaturesService, workspaceContextService) {
        super();
        this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new DefaultTextPasteOrDropEditProvider()));
        this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new PathProvider()));
        this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new RelativePathProvider(workspaceContextService)));
        this._register(languageFeaturesService.documentPasteEditProvider.register(genericLanguageSelector, new PasteHtmlProvider()));
    }
};
DefaultPasteProvidersFeature = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IWorkspaceContextService)
], DefaultPasteProvidersFeature);
export { DefaultPasteProvidersFeature };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdFByb3ZpZGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2RlZmF1bHRQcm92aWRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTdELE9BQU8sRUFBMkIsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFHOUYsT0FBTyxFQUFxSix3QkFBd0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRzNOLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBR3hGLE1BQWUsMEJBQTBCO0lBVXhDLFlBQVksSUFBc0I7UUFIekIsa0JBQWEsR0FBRyxFQUFFLENBQUM7UUFJM0IsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLHFCQUFxQixHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFD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