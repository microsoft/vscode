"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiImpl = exports.ApiGit = exports.ApiRepository = exports.ApiRepositoryUIState = exports.ApiRepositoryState = exports.ApiChange = void 0;
exports.registerAPICommands = registerAPICommands;
const git_constants_1 = require("./git.constants");
const vscode_1 = require("vscode");
const util_1 = require("../util");
const uri_1 = require("../uri");
const git_base_1 = require("../git-base");
class ApiInputBox {
    #inputBox;
    constructor(inputBox) { this.#inputBox = inputBox; }
    set value(value) { this.#inputBox.value = value; }
    get value() { return this.#inputBox.value; }
}
class ApiChange {
    #resource;
    constructor(resource) { this.#resource = resource; }
    get uri() { return this.#resource.resourceUri; }
    get originalUri() { return this.#resource.original; }
    get renameUri() { return this.#resource.renameResourceUri; }
    get status() { return this.#resource.type; }
}
exports.ApiChange = ApiChange;
class ApiRepositoryState {
    #repository;
    onDidChange;
    constructor(repository) {
        this.#repository = repository;
        this.onDidChange = this.#repository.onDidRunGitStatus;
    }
    get HEAD() { return this.#repository.HEAD; }
    /**
     * @deprecated Use ApiRepository.getRefs() instead.
     */
    get refs() { console.warn('Deprecated. Use ApiRepository.getRefs() instead.'); return []; }
    get remotes() { return [...this.#repository.remotes]; }
    get submodules() { return [...this.#repository.submodules]; }
    get worktrees() { return this.#repository.worktrees; }
    get rebaseCommit() { return this.#repository.rebaseCommit; }
    get mergeChanges() { return this.#repository.mergeGroup.resourceStates.map(r => new ApiChange(r)); }
    get indexChanges() { return this.#repository.indexGroup.resourceStates.map(r => new ApiChange(r)); }
    get workingTreeChanges() { return this.#repository.workingTreeGroup.resourceStates.map(r => new ApiChange(r)); }
    get untrackedChanges() { return this.#repository.untrackedGroup.resourceStates.map(r => new ApiChange(r)); }
}
exports.ApiRepositoryState = ApiRepositoryState;
class ApiRepositoryUIState {
    #sourceControl;
    onDidChange;
    constructor(sourceControl) {
        this.#sourceControl = sourceControl;
        this.onDidChange = (0, util_1.mapEvent)(this.#sourceControl.onDidChangeSelection, () => null);
    }
    get selected() { return this.#sourceControl.selected; }
}
exports.ApiRepositoryUIState = ApiRepositoryUIState;
class ApiRepository {
    #repository;
    rootUri;
    inputBox;
    kind;
    state;
    ui;
    onDidCommit;
    onDidCheckout;
    constructor(repository) {
        this.#repository = repository;
        this.kind = this.#repository.kind;
        this.rootUri = vscode_1.Uri.file(this.#repository.root);
        this.inputBox = new ApiInputBox(this.#repository.inputBox);
        this.state = new ApiRepositoryState(this.#repository);
        this.ui = new ApiRepositoryUIState(this.#repository.sourceControl);
        this.onDidCommit = (0, util_1.mapEvent)((0, util_1.filterEvent)(this.#repository.onDidRunOperation, e => e.operation.kind === "Commit" /* OperationKind.Commit */), () => null);
        this.onDidCheckout = (0, util_1.mapEvent)((0, util_1.filterEvent)(this.#repository.onDidRunOperation, e => e.operation.kind === "Checkout" /* OperationKind.Checkout */ || e.operation.kind === "CheckoutTracking" /* OperationKind.CheckoutTracking */), () => null);
    }
    apply(patch, reverseOrOptions) {
        const options = typeof reverseOrOptions === 'boolean' ? { reverse: reverseOrOptions } : reverseOrOptions;
        return this.#repository.apply(patch, options);
    }
    getConfigs() {
        return this.#repository.getConfigs();
    }
    getConfig(key) {
        return this.#repository.getConfig(key);
    }
    setConfig(key, value) {
        return this.#repository.setConfig(key, value);
    }
    unsetConfig(key) {
        return this.#repository.unsetConfig(key);
    }
    getGlobalConfig(key) {
        return this.#repository.getGlobalConfig(key);
    }
    getObjectDetails(treeish, path) {
        return this.#repository.getObjectDetails(treeish, path);
    }
    detectObjectType(object) {
        return this.#repository.detectObjectType(object);
    }
    buffer(ref, filePath) {
        return this.#repository.buffer(ref, filePath);
    }
    show(ref, path) {
        return this.#repository.show(ref, path);
    }
    getCommit(ref) {
        return this.#repository.getCommit(ref);
    }
    add(paths) {
        return this.#repository.add(paths.map(p => vscode_1.Uri.file(p)));
    }
    revert(paths) {
        return this.#repository.revert(paths.map(p => vscode_1.Uri.file(p)));
    }
    clean(paths) {
        return this.#repository.clean(paths.map(p => vscode_1.Uri.file(p)));
    }
    restore(paths, options) {
        return this.#repository.restore(paths.map(p => vscode_1.Uri.file(p)), options);
    }
    diff(cached) {
        return this.#repository.diff(cached);
    }
    diffWithHEAD(path) {
        return this.#repository.diffWithHEAD(path);
    }
    diffWithHEADShortStats(path) {
        return this.#repository.diffWithHEADShortStats(path);
    }
    diffWith(ref, path) {
        return this.#repository.diffWith(ref, path);
    }
    diffIndexWithHEAD(path) {
        return this.#repository.diffIndexWithHEAD(path);
    }
    diffIndexWithHEADShortStats(path) {
        return this.#repository.diffIndexWithHEADShortStats(path);
    }
    diffIndexWith(ref, path) {
        return this.#repository.diffIndexWith(ref, path);
    }
    diffBlobs(object1, object2) {
        return this.#repository.diffBlobs(object1, object2);
    }
    diffBetween(ref1, ref2, path) {
        return this.#repository.diffBetween(ref1, ref2, path);
    }
    diffBetweenPatch(ref1, ref2, path) {
        return this.#repository.diffBetweenPatch(ref1, ref2, path);
    }
    diffBetweenWithStats(ref1, ref2, path) {
        return this.#repository.diffBetweenWithStats(ref1, ref2, path);
    }
    diffBetweenWithStats2(ref, path) {
        return this.#repository.diffBetweenWithStats2(ref, path);
    }
    hashObject(data) {
        return this.#repository.hashObject(data);
    }
    createBranch(name, checkout, ref) {
        return this.#repository.branch(name, checkout, ref);
    }
    deleteBranch(name, force) {
        return this.#repository.deleteBranch(name, force);
    }
    getBranch(name) {
        return this.#repository.getBranch(name);
    }
    getBranches(query, cancellationToken) {
        return this.#repository.getBranches(query, cancellationToken);
    }
    getBranchBase(name) {
        return this.#repository.getBranchBase(name);
    }
    setBranchUpstream(name, upstream) {
        return this.#repository.setBranchUpstream(name, upstream);
    }
    getRefs(query, cancellationToken) {
        return this.#repository.getRefs(query, cancellationToken);
    }
    checkIgnore(paths) {
        return this.#repository.checkIgnore(paths);
    }
    getMergeBase(ref1, ref2) {
        return this.#repository.getMergeBase(ref1, ref2);
    }
    tag(name, message, ref) {
        return this.#repository.tag({ name, message, ref });
    }
    deleteTag(name) {
        return this.#repository.deleteTag(name);
    }
    status() {
        return this.#repository.status();
    }
    checkout(treeish) {
        return this.#repository.checkout(treeish);
    }
    addRemote(name, url) {
        return this.#repository.addRemote(name, url);
    }
    removeRemote(name) {
        return this.#repository.removeRemote(name);
    }
    renameRemote(name, newName) {
        return this.#repository.renameRemote(name, newName);
    }
    fetch(arg0, ref, depth, prune) {
        if (arg0 !== undefined && typeof arg0 !== 'string') {
            return this.#repository.fetch(arg0);
        }
        return this.#repository.fetch({ remote: arg0, ref, depth, prune });
    }
    pull(unshallow) {
        return this.#repository.pull(undefined, unshallow);
    }
    push(remoteName, branchName, setUpstream = false, force) {
        return this.#repository.pushTo(remoteName, branchName, setUpstream, force);
    }
    blame(path) {
        return this.#repository.blame(path);
    }
    log(options) {
        return this.#repository.log(options);
    }
    commit(message, opts) {
        return this.#repository.commit(message, { ...opts, postCommitCommand: null });
    }
    merge(ref) {
        return this.#repository.merge(ref);
    }
    mergeAbort() {
        return this.#repository.mergeAbort();
    }
    rebase(branch) {
        return this.#repository.rebase(branch);
    }
    createStash(options) {
        return this.#repository.createStash(options?.message, options?.includeUntracked, options?.staged);
    }
    applyStash(index) {
        return this.#repository.applyStash(index);
    }
    popStash(index) {
        return this.#repository.popStash(index);
    }
    dropStash(index) {
        return this.#repository.dropStash(index);
    }
    createWorktree(options) {
        return this.#repository.createWorktree(options);
    }
    deleteWorktree(path, options) {
        return this.#repository.deleteWorktree(path, options);
    }
    migrateChanges(sourceRepositoryPath, options) {
        return this.#repository.migrateChanges(sourceRepositoryPath, options);
    }
    generateRandomBranchName() {
        return this.#repository.generateRandomBranchName();
    }
    isBranchProtected(branch) {
        return this.#repository.isBranchProtected(branch);
    }
}
exports.ApiRepository = ApiRepository;
class ApiGit {
    #model;
    _env;
    constructor(model) { this.#model = model; }
    get path() { return this.#model.git.path; }
    get env() {
        if (this._env === undefined) {
            this._env = Object.freeze(this.#model.git.env);
        }
        return this._env;
    }
}
exports.ApiGit = ApiGit;
class ApiImpl {
    #model;
    #cloneManager;
    git;
    constructor(privates) {
        this.#model = privates.model;
        this.#cloneManager = privates.cloneManager;
        this.git = new ApiGit(this.#model);
    }
    get state() {
        return this.#model.state;
    }
    get onDidChangeState() {
        return this.#model.onDidChangeState;
    }
    get onDidPublish() {
        return this.#model.onDidPublish;
    }
    get onDidOpenRepository() {
        return (0, util_1.mapEvent)(this.#model.onDidOpenRepository, r => new ApiRepository(r));
    }
    get onDidCloseRepository() {
        return (0, util_1.mapEvent)(this.#model.onDidCloseRepository, r => new ApiRepository(r));
    }
    get repositories() {
        return this.#model.repositories.map(r => new ApiRepository(r));
    }
    get recentRepositories() {
        return this.#model.repositoryCache.recentRepositories;
    }
    toGitUri(uri, ref) {
        return (0, uri_1.toGitUri)(uri, ref);
    }
    getRepository(uri) {
        const result = this.#model.getRepository(uri);
        return result ? new ApiRepository(result) : null;
    }
    async getRepositoryRoot(uri) {
        const repository = this.getRepository(uri);
        if (repository) {
            return repository.rootUri;
        }
        try {
            const root = await this.#model.git.getRepositoryRoot(uri.fsPath);
            return vscode_1.Uri.file(root);
        }
        catch (err) {
            if (err.gitErrorCode === git_constants_1.GitErrorCodes.NotAGitRepository ||
                err.gitErrorCode === git_constants_1.GitErrorCodes.NotASafeGitRepository) {
                return null;
            }
            throw err;
        }
    }
    async getRepositoryWorkspace(uri) {
        const workspaces = this.#model.repositoryCache.get(uri.toString());
        return workspaces ? workspaces.map(r => vscode_1.Uri.file(r.workspacePath)) : null;
    }
    async init(root, options) {
        const path = root.fsPath;
        await this.#model.git.init(path, options);
        await this.#model.openRepository(path);
        return this.getRepository(root) || null;
    }
    async clone(uri, options) {
        const parentPath = options?.parentPath?.fsPath;
        const result = await this.#cloneManager.clone(uri.toString(), { parentPath, recursive: options?.recursive, ref: options?.ref, postCloneAction: options?.postCloneAction });
        return result ? vscode_1.Uri.file(result) : null;
    }
    async openRepository(root) {
        if (root.scheme !== 'file') {
            return null;
        }
        await this.#model.openRepository(root.fsPath, true, true);
        return this.getRepository(root) || null;
    }
    registerRemoteSourceProvider(provider) {
        const disposables = [];
        if (provider.publishRepository) {
            disposables.push(this.#model.registerRemoteSourcePublisher(provider));
        }
        disposables.push(git_base_1.GitBaseApi.getAPI().registerRemoteSourceProvider(provider));
        return (0, util_1.combinedDisposable)(disposables);
    }
    registerRemoteSourcePublisher(publisher) {
        return this.#model.registerRemoteSourcePublisher(publisher);
    }
    registerCredentialsProvider(provider) {
        return this.#model.registerCredentialsProvider(provider);
    }
    registerPostCommitCommandsProvider(provider) {
        return this.#model.registerPostCommitCommandsProvider(provider);
    }
    registerPushErrorHandler(handler) {
        return this.#model.registerPushErrorHandler(handler);
    }
    registerSourceControlHistoryItemDetailsProvider(provider) {
        return this.#model.registerSourceControlHistoryItemDetailsProvider(provider);
    }
    registerBranchProtectionProvider(root, provider) {
        return this.#model.registerBranchProtectionProvider(root, provider);
    }
}
exports.ApiImpl = ApiImpl;
function getRefType(type) {
    switch (type) {
        case git_constants_1.RefType.Head: return 'Head';
        case git_constants_1.RefType.RemoteHead: return 'RemoteHead';
        case git_constants_1.RefType.Tag: return 'Tag';
    }
    return 'unknown';
}
function getStatus(status) {
    switch (status) {
        case git_constants_1.Status.INDEX_MODIFIED: return 'INDEX_MODIFIED';
        case git_constants_1.Status.INDEX_ADDED: return 'INDEX_ADDED';
        case git_constants_1.Status.INDEX_DELETED: return 'INDEX_DELETED';
        case git_constants_1.Status.INDEX_RENAMED: return 'INDEX_RENAMED';
        case git_constants_1.Status.INDEX_COPIED: return 'INDEX_COPIED';
        case git_constants_1.Status.MODIFIED: return 'MODIFIED';
        case git_constants_1.Status.DELETED: return 'DELETED';
        case git_constants_1.Status.UNTRACKED: return 'UNTRACKED';
        case git_constants_1.Status.IGNORED: return 'IGNORED';
        case git_constants_1.Status.INTENT_TO_ADD: return 'INTENT_TO_ADD';
        case git_constants_1.Status.INTENT_TO_RENAME: return 'INTENT_TO_RENAME';
        case git_constants_1.Status.TYPE_CHANGED: return 'TYPE_CHANGED';
        case git_constants_1.Status.ADDED_BY_US: return 'ADDED_BY_US';
        case git_constants_1.Status.ADDED_BY_THEM: return 'ADDED_BY_THEM';
        case git_constants_1.Status.DELETED_BY_US: return 'DELETED_BY_US';
        case git_constants_1.Status.DELETED_BY_THEM: return 'DELETED_BY_THEM';
        case git_constants_1.Status.BOTH_ADDED: return 'BOTH_ADDED';
        case git_constants_1.Status.BOTH_DELETED: return 'BOTH_DELETED';
        case git_constants_1.Status.BOTH_MODIFIED: return 'BOTH_MODIFIED';
    }
    return 'UNKNOWN';
}
function registerAPICommands(extension) {
    const disposables = [];
    disposables.push(vscode_1.commands.registerCommand('git.api.getRepositories', () => {
        const api = extension.getAPI(1);
        return api.repositories.map(r => r.rootUri.toString());
    }));
    disposables.push(vscode_1.commands.registerCommand('git.api.getRepositoryState', (uri) => {
        const api = extension.getAPI(1);
        const repository = api.getRepository(vscode_1.Uri.parse(uri));
        if (!repository) {
            return null;
        }
        const state = repository.state;
        const ref = (ref) => (ref && { ...ref, type: getRefType(ref.type) });
        const change = (change) => ({
            uri: change.uri.toString(),
            originalUri: change.originalUri.toString(),
            renameUri: change.renameUri?.toString(),
            status: getStatus(change.status)
        });
        return {
            HEAD: ref(state.HEAD),
            refs: state.refs.map(ref),
            remotes: state.remotes,
            submodules: state.submodules,
            worktrees: state.worktrees,
            rebaseCommit: state.rebaseCommit,
            mergeChanges: state.mergeChanges.map(change),
            indexChanges: state.indexChanges.map(change),
            workingTreeChanges: state.workingTreeChanges.map(change)
        };
    }));
    disposables.push(vscode_1.commands.registerCommand('git.api.getRemoteSources', (opts) => {
        return vscode_1.commands.executeCommand('git-base.api.getRemoteSources', opts);
    }));
    return vscode_1.Disposable.from(...disposables);
}
//# sourceMappingURL=api1.js.map