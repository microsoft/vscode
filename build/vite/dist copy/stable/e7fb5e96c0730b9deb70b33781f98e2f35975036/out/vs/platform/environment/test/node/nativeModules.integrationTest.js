/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { flakySuite } from '../../../../base/test/common/testUtils.js';
function testErrorMessage(module) {
    return `Unable to load "${module}" dependency. It was probably not compiled for the right operating system architecture or had missing build tools.`;
}
flakySuite('Native Modules (all platforms)', () => {
    (isMacintosh ? test.skip : test)('kerberos', async () => {
        const { default: kerberos } = await import('kerberos');
        assert.ok(typeof kerberos.initializeClient === 'function', testErrorMessage('kerberos'));
    });
    test('yauzl', async () => {
        const { default: yauzl } = await import('yauzl');
        assert.ok(typeof yauzl.ZipFile === 'function', testErrorMessage('yauzl'));
    });
    test('yazl', async () => {
        const { default: yazl } = await import('yazl');
        assert.ok(typeof yazl.ZipFile === 'function', testErrorMessage('yazl'));
    });
    test('v8-inspect-profiler', async () => {
        const { default: profiler } = await import('v8-inspect-profiler');
        assert.ok(typeof profiler.startProfiling === 'function', testErrorMessage('v8-inspect-profiler'));
    });
    test('native-is-elevated', async () => {
        const { default: isElevated } = await import('native-is-elevated');
        assert.ok(typeof isElevated === 'function', testErrorMessage('native-is-elevated '));
        const result = isElevated();
        assert.ok(typeof result === 'boolean', testErrorMessage('native-is-elevated'));
    });
    test('native-keymap', async () => {
        const keyMap = await import('native-keymap');
        assert.ok(typeof keyMap.onDidChangeKeyboardLayout === 'function', testErrorMessage('native-keymap'));
        assert.ok(typeof keyMap.getCurrentKeyboardLayout === 'function', testErrorMessage('native-keymap'));
        const result = keyMap.getCurrentKeyboardLayout();
        assert.ok(result, testErrorMessage('native-keymap'));
    });
    test('@vscode/native-watchdog', async () => {
        const watchDog = await import('@vscode/native-watchdog');
        assert.ok(typeof watchDog.start === 'function', testErrorMessage('@vscode/native-watchdog'));
    });
    test('@vscode/sudo-prompt', async () => {
        const prompt = await import('@vscode/sudo-prompt');
        assert.ok(typeof prompt.exec === 'function', testErrorMessage('@vscode/sudo-prompt'));
    });
    test('@vscode/policy-watcher', async () => {
        const watcher = await import('@vscode/policy-watcher');
        assert.ok(typeof watcher.createWatcher === 'function', testErrorMessage('@vscode/policy-watcher'));
    });
    test('node-pty', async () => {
        const nodePty = await import('node-pty');
        assert.ok(typeof nodePty.spawn === 'function', testErrorMessage('node-pty'));
    });
    test('@vscode/spdlog', async () => {
        const spdlog = await import('@vscode/spdlog');
        assert.ok(typeof spdlog.createRotatingLogger === 'function', testErrorMessage('@vscode/spdlog'));
        assert.ok(typeof spdlog.version === 'number', testErrorMessage('@vscode/spdlog'));
    });
    test('@parcel/watcher', async () => {
        const parcelWatcher = await import('@parcel/watcher');
        assert.ok(typeof parcelWatcher.subscribe === 'function', testErrorMessage('@parcel/watcher'));
    });
    test('@vscode/deviceid', async () => {
        const deviceIdPackage = await import('@vscode/deviceid');
        assert.ok(typeof deviceIdPackage.getDeviceId === 'function', testErrorMessage('@vscode/deviceid'));
    });
    test('@vscode/ripgrep', async () => {
        const ripgrep = await import('@vscode/ripgrep');
        assert.ok(typeof ripgrep.rgPath === 'string', testErrorMessage('@vscode/ripgrep'));
    });
    test('vscode-regexpp', async () => {
        const regexpp = await import('vscode-regexpp');
        assert.ok(typeof regexpp.RegExpParser === 'function', testErrorMessage('vscode-regexpp'));
    });
    test('@vscode/sqlite3', async () => {
        const { default: sqlite3 } = await import('@vscode/sqlite3');
        assert.ok(typeof sqlite3.Database === 'function', testErrorMessage('@vscode/sqlite3'));
    });
    test('http-proxy-agent', async () => {
        const { default: mod } = await import('http-proxy-agent');
        assert.ok(typeof mod.HttpProxyAgent === 'function', testErrorMessage('http-proxy-agent'));
    });
    test('https-proxy-agent', async () => {
        const { default: mod } = await import('https-proxy-agent');
        assert.ok(typeof mod.HttpsProxyAgent === 'function', testErrorMessage('https-proxy-agent'));
    });
    test('@vscode/proxy-agent', async () => {
        const proxyAgent = await import('@vscode/proxy-agent');
        // This call will load `@vscode/proxy-agent` which is a native module that we want to test on Windows
        const windowsCerts = await proxyAgent.loadSystemCertificates({
            loadSystemCertificatesFromNode: () => undefined,
            log: {
                trace: () => { },
                debug: () => { },
                info: () => { },
                warn: () => { },
                error: () => { }
            }
        });
        assert.ok(windowsCerts.length > 0, testErrorMessage('@vscode/proxy-agent'));
    });
});
(!isWindows ? suite.skip : suite)('Native Modules (Windows)', () => {
    test('@vscode/windows-mutex', async () => {
        const mutex = await import('@vscode/windows-mutex');
        assert.ok(mutex && typeof mutex.isActive === 'function', testErrorMessage('@vscode/windows-mutex'));
        assert.ok(typeof mutex.isActive === 'function', testErrorMessage('@vscode/windows-mutex'));
        assert.ok(typeof mutex.Mutex === 'function', testErrorMessage('@vscode/windows-mutex'));
    });
    test('windows-foreground-love', async () => {
        const foregroundLove = await import('windows-foreground-love');
        assert.ok(typeof foregroundLove.allowSetForegroundWindow === 'function', testErrorMessage('windows-foreground-love'));
        const result = foregroundLove.allowSetForegroundWindow(process.pid);
        assert.ok(typeof result === 'boolean', testErrorMessage('windows-foreground-love'));
    });
    test('@vscode/windows-process-tree', async () => {
        const processTree = await import('@vscode/windows-process-tree');
        assert.ok(typeof processTree.getProcessTree === 'function', testErrorMessage('@vscode/windows-process-tree'));
        return new Promise((resolve, reject) => {
            processTree.getProcessTree(process.pid, tree => {
                if (tree) {
                    resolve();
                }
                else {
                    reject(new Error(testErrorMessage('@vscode/windows-process-tree')));
                }
            });
        });
    });
    test('@vscode/windows-registry', async () => {
        const windowsRegistry = await import('@vscode/windows-registry');
        assert.ok(typeof windowsRegistry.GetStringRegKey === 'function', testErrorMessage('@vscode/windows-registry'));
        const result = windowsRegistry.GetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', 'EditionID');
        assert.ok(typeof result === 'string' || typeof result === 'undefined', testErrorMessage('@vscode/windows-registry'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlTW9kdWxlcy5pbnRlZ3JhdGlvblRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9lbnZpcm9ubWVudC90ZXN0L25vZGUvbmF0aXZlTW9kdWxlcy5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXZFLFNBQVMsZ0JBQWdCLENBQUMsTUFBYztJQUN2QyxPQUFPLG1CQUFtQixNQUFNLG9IQUFvSCxDQUFDO0FBQ3RKLENBQUM7QUFFRCxVQUFVLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBRWpELENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdkQsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sUUFBUSxDQUFDLGdCQUFnQixLQUFLLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQzFGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4QixNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxLQUFL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