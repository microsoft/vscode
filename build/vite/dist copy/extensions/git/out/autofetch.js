"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoFetcher = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const git_constants_1 = require("./api/git.constants");
class AutoFetcher {
    repository;
    globalState;
    static DidInformUser = 'autofetch.didInformUser';
    _onDidChange = new vscode_1.EventEmitter();
    onDidChange = this._onDidChange.event;
    _enabled = false;
    _fetchAll = false;
    get enabled() { return this._enabled; }
    set enabled(enabled) { this._enabled = enabled; this._onDidChange.fire(enabled); }
    disposables = [];
    constructor(repository, globalState) {
        this.repository = repository;
        this.globalState = globalState;
        vscode_1.workspace.onDidChangeConfiguration(this.onConfiguration, this, this.disposables);
        this.onConfiguration();
        const onGoodRemoteOperation = (0, util_1.filterEvent)(repository.onDidRunOperation, ({ operation, error }) => !error && operation.remote);
        const onFirstGoodRemoteOperation = (0, util_1.onceEvent)(onGoodRemoteOperation);
        onFirstGoodRemoteOperation(this.onFirstGoodRemoteOperation, this, this.disposables);
        vscode_1.env.onDidChangeMeteredConnection(() => this.onConfiguration(), this, this.disposables);
    }
    async onFirstGoodRemoteOperation() {
        const didInformUser = !this.globalState.get(AutoFetcher.DidInformUser);
        if (this.enabled && !didInformUser) {
            this.globalState.update(AutoFetcher.DidInformUser, true);
        }
        const shouldInformUser = !this.enabled && didInformUser;
        if (!shouldInformUser) {
            return;
        }
        const yes = { title: vscode_1.l10n.t('Yes') };
        const no = { isCloseAffordance: true, title: vscode_1.l10n.t('No') };
        const askLater = { title: vscode_1.l10n.t('Ask Me Later') };
        const result = await vscode_1.window.showInformationMessage(vscode_1.l10n.t('Would you like {0} to [periodically run "git fetch"]({1})?', vscode_1.env.appName, 'https://go.microsoft.com/fwlink/?linkid=865294'), yes, no, askLater);
        if (result === askLater) {
            return;
        }
        if (result === yes) {
            const gitConfig = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
            gitConfig.update('autofetch', true, vscode_1.ConfigurationTarget.Global);
        }
        this.globalState.update(AutoFetcher.DidInformUser, true);
    }
    onConfiguration(e) {
        if (e !== undefined && !e.affectsConfiguration('git.autofetch')) {
            return;
        }
        if (vscode_1.env.isMeteredConnection) {
            this.disable();
            return;
        }
        const gitConfig = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        switch (gitConfig.get('autofetch')) {
            case true:
                this._fetchAll = false;
                this.enable();
                break;
            case 'all':
                this._fetchAll = true;
                this.enable();
                break;
            case false:
            default:
                this._fetchAll = false;
                this.disable();
                break;
        }
    }
    enable() {
        if (this.enabled) {
            return;
        }
        this.enabled = true;
        this.run();
    }
    disable() {
        this.enabled = false;
    }
    async run() {
        while (this.enabled) {
            await this.repository.whenIdleAndFocused();
            if (!this.enabled) {
                return;
            }
            try {
                if (this._fetchAll) {
                    await this.repository.fetchAll({ silent: true });
                }
                else {
                    await this.repository.fetchDefault({ silent: true });
                }
            }
            catch (err) {
                if (err.gitErrorCode === git_constants_1.GitErrorCodes.AuthenticationFailed) {
                    this.disable();
                }
            }
            if (!this.enabled) {
                return;
            }
            const period = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root)).get('autofetchPeriod', 180) * 1000;
            const timeout = new Promise(c => setTimeout(c, period));
            const whenDisabled = (0, util_1.eventToPromise)((0, util_1.filterEvent)(this.onDidChange, enabled => !enabled));
            await Promise.race([timeout, whenDisabled]);
        }
    }
    dispose() {
        this.disable();
        this.disposables.forEach(d => d.dispose());
    }
}
exports.AutoFetcher = AutoFetcher;
//# sourceMappingURL=autofetch.js.map