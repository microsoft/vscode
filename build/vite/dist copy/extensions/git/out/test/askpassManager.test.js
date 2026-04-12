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
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const askpassManager_1 = require("../askpassManager");
const vscode_1 = require("vscode");
class MockLogOutputChannel {
    logLevel = vscode_1.LogLevel.Info;
    onDidChangeLogLevel = new vscode_1.EventEmitter().event;
    logs = [];
    trace(message, ..._args) {
        this.logs.push({ level: 'trace', message });
    }
    debug(message, ..._args) {
        this.logs.push({ level: 'debug', message });
    }
    info(message, ..._args) {
        this.logs.push({ level: 'info', message });
    }
    warn(message, ..._args) {
        this.logs.push({ level: 'warn', message });
    }
    error(error, ..._args) {
        this.logs.push({ level: 'error', message: error.toString() });
    }
    name = 'MockLogOutputChannel';
    append(_value) { }
    appendLine(_value) { }
    replace(_value) { }
    clear() { }
    show(_column, _preserveFocus) { }
    hide() { }
    dispose() { }
    getLogs() {
        return this.logs;
    }
    hasLog(level, messageSubstring) {
        return this.logs.some(log => log.level === level && log.message.includes(messageSubstring));
    }
}
// Helper to set mtime on a directory
async function setDirectoryMtime(dirPath, mtime) {
    await fs.promises.utimes(dirPath, mtime, mtime);
}
suite('askpassManager', () => {
    let tempDir;
    let sourceDir;
    setup(async () => {
        // Create a temporary directory for testing
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'askpass-test-'));
        // Create source directory with dummy askpass files
        sourceDir = path.join(tempDir, 'source');
        await fs.promises.mkdir(sourceDir, { recursive: true });
        const askpassFiles = ['askpass.sh', 'askpass-main.js', 'ssh-askpass.sh', 'askpass-empty.sh', 'ssh-askpass-empty.sh'];
        for (const file of askpassFiles) {
            await fs.promises.writeFile(path.join(sourceDir, file), `#!/bin/sh\n# ${file}\n`);
        }
    });
    teardown(async () => {
        // Clean up temporary directory
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
        catch {
            // Ignore errors during cleanup
        }
    });
    test('garbage collection removes old directories', async function () {
        const storageDir = path.join(tempDir, 'storage');
        const askpassBaseDir = path.join(storageDir, 'askpass');
        const logger = new MockLogOutputChannel();
        // Create old directories with old mtimes (8 days ago)
        const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
        const oldDirs = ['oldhash1', 'oldhash2'];
        for (const dirName of oldDirs) {
            const dirPath = path.join(askpassBaseDir, dirName);
            await fs.promises.mkdir(dirPath, { recursive: true });
            await fs.promises.writeFile(path.join(dirPath, 'test.txt'), 'old');
            await setDirectoryMtime(dirPath, oldDate);
        }
        // Create a recent directory (1 day ago)
        const recentDate = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000));
        const recentDir = path.join(askpassBaseDir, 'recenthash');
        await fs.promises.mkdir(recentDir, { recursive: true });
        await fs.promises.writeFile(path.join(recentDir, 'test.txt'), 'recent');
        await setDirectoryMtime(recentDir, recentDate);
        // Call ensureAskpassScripts which should trigger garbage collection when creating a new directory
        await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        // Check that old directories were removed
        for (const dirName of oldDirs) {
            const dirPath = path.join(askpassBaseDir, dirName);
            const exists = await fs.promises.access(dirPath).then(() => true).catch(() => false);
            assert.strictEqual(exists, false, `Old directory ${dirName} should have been removed`);
        }
        // Check that recent directory still exists
        const recentExists = await fs.promises.access(recentDir).then(() => true).catch(() => false);
        assert.strictEqual(recentExists, true, 'Recent directory should still exist');
        // Check logs
        assert.ok(logger.hasLog('info', 'Removing old askpass directory'), 'Should log removal of old directories');
    });
    test('garbage collection skips non-directory entries', async function () {
        const storageDir = path.join(tempDir, 'storage');
        const askpassBaseDir = path.join(storageDir, 'askpass');
        const logger = new MockLogOutputChannel();
        // Create a file in the askpass directory (not a directory)
        await fs.promises.mkdir(askpassBaseDir, { recursive: true });
        const filePath = path.join(askpassBaseDir, 'somefile.txt');
        await fs.promises.writeFile(filePath, 'test');
        // Set old mtime
        const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
        await fs.promises.utimes(filePath, oldDate, oldDate);
        // Call ensureAskpassScripts which should trigger garbage collection
        await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        // Check that file still exists (should not be removed)
        const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
        assert.strictEqual(exists, true, 'Non-directory file should not be removed');
    });
    test('mtime is updated on existing directory', async function () {
        const storageDir = path.join(tempDir, 'storage');
        const logger = new MockLogOutputChannel();
        // Call ensureAskpassScripts to create the directory
        const paths1 = await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        // Get the directory path and its initial mtime
        const askpassDir = path.dirname(paths1.askpass);
        const stat1 = await fs.promises.stat(askpassDir);
        const mtime1 = stat1.mtime.getTime();
        // Wait a bit to ensure time difference
        await new Promise(resolve => setTimeout(resolve, 100));
        // Call again (should update mtime)
        await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        // Check that mtime was updated
        const stat2 = await fs.promises.stat(askpassDir);
        const mtime2 = stat2.mtime.getTime();
        assert.ok(mtime2 > mtime1, 'Mtime should be updated on subsequent calls');
    });
    test('garbage collection handles empty askpass directory', async function () {
        const storageDir = path.join(tempDir, 'storage');
        const logger = new MockLogOutputChannel();
        // Don't create any askpass directories, just call ensureAskpassScripts
        await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        // Should complete without errors
        assert.ok(true, 'Should handle empty or non-existent askpass directory gracefully');
    });
    test('current content-addressed directory is not removed', async function () {
        const storageDir = path.join(tempDir, 'storage');
        const logger = new MockLogOutputChannel();
        // Create the current content-addressed directory
        const paths = await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        const currentDir = path.dirname(paths.askpass);
        // Set its mtime to 8 days ago (would normally be removed)
        const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
        await setDirectoryMtime(currentDir, oldDate);
        // Call again which should trigger GC
        await (0, askpassManager_1.ensureAskpassScripts)(sourceDir, storageDir, logger);
        // Current directory should still exist
        const exists = await fs.promises.access(currentDir).then(() => true).catch(() => false);
        assert.strictEqual(exists, true, 'Current content-addressed directory should not be removed');
    });
});
//# sourceMappingURL=askpassManager.test.js.map