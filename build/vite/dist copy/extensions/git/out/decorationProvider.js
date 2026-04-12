"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitDecorations = void 0;
const vscode_1 = require("vscode");
const path = __importStar(require("path"));
const decorators_1 = require("./decorators");
const util_1 = require("./util");
const git_constants_1 = require("./api/git.constants");
function equalSourceControlHistoryItemRefs(ref1, ref2) {
    if (ref1 === ref2) {
        return true;
    }
    return ref1?.id === ref2?.id &&
        ref1?.name === ref2?.name &&
        ref1?.revision === ref2?.revision;
}
class GitIgnoreDecorationProvider {
    model;
    static Decoration = { color: new vscode_1.ThemeColor('gitDecoration.ignoredResourceForeground') };
    _onDidChangeDecorations = new vscode_1.EventEmitter();
    onDidChangeFileDecorations = this._onDidChangeDecorations.event;
    queue = new Map();
    disposables = [];
    constructor(model) {
        this.model = model;
        const onDidChangeRepository = (0, util_1.anyEvent)((0, util_1.filterEvent)(vscode_1.workspace.onDidSaveTextDocument, e => /\.gitignore$|\.git\/info\/exclude$/.test(e.uri.path)), model.onDidOpenRepository, model.onDidCloseRepository);
        this.disposables.push(onDidChangeRepository(() => this._onDidChangeDecorations.fire(undefined)));
        this.disposables.push(vscode_1.window.registerFileDecorationProvider(this));
    }
    async provideFileDecoration(uri) {
        const repository = this.model.getRepository(uri);
        if (!repository) {
            return;
        }
        let queueItem = this.queue.get(repository.root);
        if (!queueItem) {
            queueItem = { repository, queue: new Map() };
            this.queue.set(repository.root, queueItem);
        }
        let promiseSource = queueItem.queue.get(uri.fsPath);
        if (!promiseSource) {
            promiseSource = new util_1.PromiseSource();
            queueItem.queue.set(uri.fsPath, promiseSource);
            this.checkIgnoreSoon();
        }
        return await promiseSource.promise;
    }
    checkIgnoreSoon() {
        const queue = new Map(this.queue.entries());
        this.queue.clear();
        for (const [, item] of queue) {
            const paths = [...item.queue.keys()];
            item.repository.checkIgnore(paths).then(ignoreSet => {
                for (const [path, promiseSource] of item.queue.entries()) {
                    promiseSource.resolve(ignoreSet.has(path) ? GitIgnoreDecorationProvider.Decoration : undefined);
                }
            }, err => {
                if (err.gitErrorCode !== git_constants_1.GitErrorCodes.IsInSubmodule) {
                    console.error(err);
                }
                for (const [, promiseSource] of item.queue.entries()) {
                    promiseSource.reject(err);
                }
            });
        }
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.queue.clear();
    }
}
__decorate([
    (0, decorators_1.debounce)(500)
], GitIgnoreDecorationProvider.prototype, "checkIgnoreSoon", null);
class GitDecorationProvider {
    repository;
    static SubmoduleDecorationData = {
        tooltip: 'Submodule',
        badge: 'S',
        color: new vscode_1.ThemeColor('gitDecoration.submoduleResourceForeground')
    };
    _onDidChangeDecorations = new vscode_1.EventEmitter();
    onDidChangeFileDecorations = this._onDidChangeDecorations.event;
    disposables = [];
    decorations = new Map();
    constructor(repository) {
        this.repository = repository;
        this.disposables.push(vscode_1.window.registerFileDecorationProvider(this), (0, util_1.runAndSubscribeEvent)(repository.onDidRunGitStatus, () => this.onDidRunGitStatus()));
    }
    onDidRunGitStatus() {
        const newDecorations = new Map();
        this.collectDecorationData(this.repository.indexGroup, newDecorations);
        this.collectDecorationData(this.repository.untrackedGroup, newDecorations);
        this.collectDecorationData(this.repository.workingTreeGroup, newDecorations);
        this.collectDecorationData(this.repository.mergeGroup, newDecorations);
        this.collectSubmoduleDecorationData(newDecorations);
        const uris = new Set([...this.decorations.keys()].concat([...newDecorations.keys()]));
        this.decorations = newDecorations;
        this._onDidChangeDecorations.fire([...uris.values()].map(value => vscode_1.Uri.parse(value, true)));
    }
    collectDecorationData(group, bucket) {
        for (const r of group.resourceStates) {
            const decoration = r.resourceDecoration;
            if (decoration) {
                // not deleted and has a decoration
                bucket.set(r.original.toString(), decoration);
                if (r.type === git_constants_1.Status.DELETED && r.rightUri) {
                    bucket.set(r.rightUri.toString(), decoration);
                }
                if (r.type === git_constants_1.Status.INDEX_RENAMED || r.type === git_constants_1.Status.INTENT_TO_RENAME) {
                    bucket.set(r.resourceUri.toString(), decoration);
                }
            }
        }
    }
    collectSubmoduleDecorationData(bucket) {
        for (const submodule of this.repository.submodules) {
            bucket.set(vscode_1.Uri.file(path.join(this.repository.root, submodule.path)).toString(), GitDecorationProvider.SubmoduleDecorationData);
        }
    }
    provideFileDecoration(uri) {
        return this.decorations.get(uri.toString());
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
class GitIncomingChangesFileDecorationProvider {
    repository;
    _onDidChangeDecorations = new vscode_1.EventEmitter();
    onDidChangeFileDecorations = this._onDidChangeDecorations.event;
    _currentHistoryItemRef;
    _currentHistoryItemRemoteRef;
    _decorations = new Map();
    disposables = [];
    constructor(repository) {
        this.repository = repository;
        this.disposables.push(vscode_1.window.registerFileDecorationProvider(this), (0, util_1.runAndSubscribeEvent)(repository.historyProvider.onDidChangeCurrentHistoryItemRefs, () => this.onDidChangeCurrentHistoryItemRefs()));
    }
    async onDidChangeCurrentHistoryItemRefs() {
        const historyProvider = this.repository.historyProvider;
        const currentHistoryItemRef = historyProvider.currentHistoryItemRef;
        const currentHistoryItemRemoteRef = historyProvider.currentHistoryItemRemoteRef;
        if (equalSourceControlHistoryItemRefs(this._currentHistoryItemRef, currentHistoryItemRef) &&
            equalSourceControlHistoryItemRefs(this._currentHistoryItemRemoteRef, currentHistoryItemRemoteRef)) {
            return;
        }
        const decorations = new Map();
        await this.collectIncomingChangesFileDecorations(decorations);
        const uris = new Set([...this._decorations.keys()].concat([...decorations.keys()]));
        this._decorations = decorations;
        this._currentHistoryItemRef = currentHistoryItemRef;
        this._currentHistoryItemRemoteRef = currentHistoryItemRemoteRef;
        this._onDidChangeDecorations.fire([...uris.values()].map(value => vscode_1.Uri.parse(value, true)));
    }
    async collectIncomingChangesFileDecorations(bucket) {
        for (const change of await this.getIncomingChanges()) {
            switch (change.status) {
                case git_constants_1.Status.INDEX_ADDED:
                    bucket.set(change.uri.toString(), {
                        badge: '↓A',
                        tooltip: vscode_1.l10n.t('Incoming Changes (added)'),
                    });
                    break;
                case git_constants_1.Status.DELETED:
                    bucket.set(change.uri.toString(), {
                        badge: '↓D',
                        tooltip: vscode_1.l10n.t('Incoming Changes (deleted)'),
                    });
                    break;
                case git_constants_1.Status.INDEX_RENAMED:
                    bucket.set(change.originalUri.toString(), {
                        badge: '↓R',
                        tooltip: vscode_1.l10n.t('Incoming Changes (renamed)'),
                    });
                    break;
                case git_constants_1.Status.MODIFIED:
                    bucket.set(change.uri.toString(), {
                        badge: '↓M',
                        tooltip: vscode_1.l10n.t('Incoming Changes (modified)'),
                    });
                    break;
                default: {
                    bucket.set(change.uri.toString(), {
                        badge: '↓~',
                        tooltip: vscode_1.l10n.t('Incoming Changes'),
                    });
                    break;
                }
            }
        }
    }
    async getIncomingChanges() {
        try {
            const historyProvider = this.repository.historyProvider;
            const currentHistoryItemRef = historyProvider.currentHistoryItemRef;
            const currentHistoryItemRemoteRef = historyProvider.currentHistoryItemRemoteRef;
            if (!currentHistoryItemRef || !currentHistoryItemRemoteRef) {
                return [];
            }
            const ancestor = await historyProvider.resolveHistoryItemRefsCommonAncestor([currentHistoryItemRef.id, currentHistoryItemRemoteRef.id]);
            if (!ancestor) {
                return [];
            }
            const changes = await this.repository.diffBetweenWithStats(ancestor, currentHistoryItemRemoteRef.id);
            return changes;
        }
        catch (err) {
            return [];
        }
    }
    provideFileDecoration(uri) {
        return this._decorations.get(uri.toString());
    }
    dispose() {
        (0, util_1.dispose)(this.disposables);
    }
}
class GitDecorations {
    model;
    enabled = false;
    disposables = [];
    modelDisposables = [];
    providers = new Map();
    constructor(model) {
        this.model = model;
        this.disposables.push(new GitIgnoreDecorationProvider(model));
        const onEnablementChange = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.decorations.enabled'));
        onEnablementChange(this.update, this, this.disposables);
        this.update();
    }
    update() {
        const config = vscode_1.workspace.getConfiguration('git');
        const enabled = config.get('decorations.enabled') === true;
        if (this.enabled === enabled) {
            return;
        }
        if (enabled) {
            this.enable();
        }
        else {
            this.disable();
        }
        this.enabled = enabled;
    }
    enable() {
        this.model.onDidOpenRepository(this.onDidOpenRepository, this, this.modelDisposables);
        this.model.onDidCloseRepository(this.onDidCloseRepository, this, this.modelDisposables);
        this.model.repositories.forEach(this.onDidOpenRepository, this);
    }
    disable() {
        this.modelDisposables = (0, util_1.dispose)(this.modelDisposables);
        this.providers.forEach(value => value.dispose());
        this.providers.clear();
    }
    onDidOpenRepository(repository) {
        const providers = (0, util_1.combinedDisposable)([
            new GitDecorationProvider(repository),
            new GitIncomingChangesFileDecorationProvider(repository)
        ]);
        this.providers.set(repository, providers);
    }
    onDidCloseRepository(repository) {
        const provider = this.providers.get(repository);
        if (provider) {
            provider.dispose();
            this.providers.delete(repository);
        }
    }
    dispose() {
        this.disable();
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.GitDecorations = GitDecorations;
//# sourceMappingURL=decorationProvider.js.map