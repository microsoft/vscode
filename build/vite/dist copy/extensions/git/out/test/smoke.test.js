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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert_1 = __importDefault(require("assert"));
const vscode_1 = require("vscode");
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const git_constants_1 = require("../api/git.constants");
const util_1 = require("../util");
suite('git smoke test', function () {
    const cwd = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
    function file(relativePath) {
        return path.join(cwd, relativePath);
    }
    function uri(relativePath) {
        return vscode_1.Uri.file(file(relativePath));
    }
    async function open(relativePath) {
        const doc = await vscode_1.workspace.openTextDocument(uri(relativePath));
        await vscode_1.window.showTextDocument(doc);
        return doc;
    }
    async function type(doc, text) {
        const edit = new vscode_1.WorkspaceEdit();
        const end = doc.lineAt(doc.lineCount - 1).range.end;
        edit.replace(doc.uri, new vscode_1.Range(end, end), text);
        await vscode_1.workspace.applyEdit(edit);
    }
    let git;
    let repository;
    suiteSetup(async function () {
        fs.writeFileSync(file('app.js'), 'hello', 'utf8');
        fs.writeFileSync(file('index.pug'), 'hello', 'utf8');
        cp.execSync('git init -b main', { cwd });
        cp.execSync('git config user.name testuser', { cwd });
        cp.execSync('git config user.email monacotools@example.com', { cwd });
        cp.execSync('git config commit.gpgsign false', { cwd });
        cp.execSync('git add .', { cwd });
        cp.execSync('git commit -m "initial commit"', { cwd });
        // make sure git is activated
        const ext = vscode_1.extensions.getExtension('vscode.git');
        await ext?.activate();
        git = ext.exports.getAPI(1);
        if (git.repositories.length === 0) {
            const onDidOpenRepository = (0, util_1.eventToPromise)(git.onDidOpenRepository);
            await vscode_1.commands.executeCommand('git.openRepository', cwd);
            await onDidOpenRepository;
        }
        assert_1.default.strictEqual(git.repositories.length, 1);
        assert_1.default.strictEqual(git.repositories[0].rootUri.fsPath, cwd);
        repository = git.repositories[0];
    });
    test('reflects working tree changes', async function () {
        await vscode_1.commands.executeCommand('workbench.view.scm');
        const appjs = await open('app.js');
        await type(appjs, ' world');
        await appjs.save();
        await repository.status();
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 1);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].uri.path, appjs.uri.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].status, git_constants_1.Status.MODIFIED);
        fs.writeFileSync(file('newfile.txt'), '');
        const newfile = await open('newfile.txt');
        await type(newfile, 'hey there');
        await newfile.save();
        await repository.status();
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 2);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].uri.path, appjs.uri.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].status, git_constants_1.Status.MODIFIED);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[1].uri.path, newfile.uri.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[1].status, git_constants_1.Status.UNTRACKED);
    });
    test('opens diff editor', async function () {
        const appjs = uri('app.js');
        await vscode_1.commands.executeCommand('git.openChange', appjs);
        (0, assert_1.default)(vscode_1.window.activeTextEditor);
        assert_1.default.strictEqual(vscode_1.window.activeTextEditor.document.uri.path, appjs.path);
        (0, assert_1.default)(vscode_1.window.tabGroups.activeTabGroup.activeTab);
        (0, assert_1.default)(vscode_1.window.tabGroups.activeTabGroup.activeTab.input instanceof vscode_1.TabInputTextDiff);
    });
    test('stages correctly', async function () {
        const appjs = uri('app.js');
        const newfile = uri('newfile.txt');
        await repository.add([appjs.fsPath]);
        assert_1.default.strictEqual(repository.state.indexChanges.length, 1);
        assert_1.default.strictEqual(repository.state.indexChanges[0].uri.path, appjs.path);
        assert_1.default.strictEqual(repository.state.indexChanges[0].status, git_constants_1.Status.INDEX_MODIFIED);
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 1);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].uri.path, newfile.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].status, git_constants_1.Status.UNTRACKED);
        await repository.revert([appjs.fsPath]);
        assert_1.default.strictEqual(repository.state.indexChanges.length, 0);
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 2);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].uri.path, appjs.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].status, git_constants_1.Status.MODIFIED);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[1].uri.path, newfile.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[1].status, git_constants_1.Status.UNTRACKED);
    });
    test('stages, commits changes and verifies outgoing change', async function () {
        const appjs = uri('app.js');
        const newfile = uri('newfile.txt');
        await repository.add([appjs.fsPath]);
        await repository.commit('second commit');
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 1);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].uri.path, newfile.path);
        assert_1.default.strictEqual(repository.state.workingTreeChanges[0].status, git_constants_1.Status.UNTRACKED);
        assert_1.default.strictEqual(repository.state.indexChanges.length, 0);
        await repository.commit('third commit', { all: true });
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 0);
        assert_1.default.strictEqual(repository.state.indexChanges.length, 0);
    });
    test('rename/delete conflict', async function () {
        await vscode_1.commands.executeCommand('workbench.view.scm');
        const appjs = file('app.js');
        const renamejs = file('rename.js');
        await repository.createBranch('test', true);
        // Delete file (test branch)
        fs.unlinkSync(appjs);
        await repository.commit('commit on test', { all: true });
        await repository.checkout('main');
        // Rename file (main branch)
        fs.renameSync(appjs, renamejs);
        await repository.commit('commit on main', { all: true });
        try {
            await repository.merge('test');
        }
        catch (e) { }
        assert_1.default.strictEqual(repository.state.mergeChanges.length, 1);
        assert_1.default.strictEqual(repository.state.mergeChanges[0].status, git_constants_1.Status.DELETED_BY_THEM);
        assert_1.default.strictEqual(repository.state.workingTreeChanges.length, 0);
        assert_1.default.strictEqual(repository.state.indexChanges.length, 0);
    });
});
//# sourceMappingURL=smoke.test.js.map