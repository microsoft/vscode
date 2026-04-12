/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OpenerService } from '../../../browser/services/openerService.js';
import { TestCodeEditorService } from '../editorTestServices.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { NullCommandService } from '../../../../platform/commands/test/common/nullCommandService.js';
import { matchesScheme, matchesSomeScheme } from '../../../../base/common/network.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
suite('OpenerService', function () {
    const themeService = new TestThemeService();
    const editorService = new TestCodeEditorService(themeService);
    let lastCommand;
    const commandService = new (class {
        constructor() {
            this.onWillExecuteCommand = () => Disposable.None;
            this.onDidExecuteCommand = () => Disposable.None;
        }
        executeCommand(id, ...args) {
            lastCommand = { id, args };
            return Promise.resolve(undefined);
        }
    })();
    setup(function () {
        lastCommand = undefined;
    });
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('delegate to editorService, scheme:///fff', async function () {
        const openerService = new OpenerService(editorService, NullCommandService);
        await openerService.open(URI.parse('another:///somepath'));
        assert.strictEqual(editorService.lastInput.options.selection, undefined);
    });
    test('delegate to editorService, scheme:///fff#L123', async function () {
        const openerService = new OpenerService(editorService, NullCommandService);
        await openerService.open(URI.parse('file:///somepath#L23'));
        assert.strictEqual(editorService.lastInput.options.selection.startLineNumber, 23);
        assert.strictEqual(editorService.lastInput.options.selection.startColumn, 1);
        assert.strictEqual(editorService.lastInput.options.selection.endLineNumber, undefined);
        assert.strictEqual(editorService.lastInput.options.selection.endColumn, undefined);
        assert.strictEqual(editorService.lastInput.resource.fragment, '');
        await openerService.open(URI.parse('another:///somepath#L23'));
        assert.strictEqual(editorService.lastInput.options.selection.startLineNumber, 23);
        assert.strictEqual(editorService.lastInput.options.selection.startColumn, 1);
        await openerService.open(URI.parse('another:///somepath#L23,45'));
        assert.strictEqual(editorService.lastInput.options.selection.startLineNumber, 23);
        assert.strictEqual(editorService.lastInput.options.selection.startColumn, 45);
        assert.strictEqual(editorService.lastInput.options.selection.endLineNumber, undefined);
        assert.strictEqual(editorService.lastInput.options.selection.endColumn, undefined);
        assert.strictEqual(editorService.lastInput.resource.fragment, '');
    });
    test('delegate to editorService, scheme:///fff#123,123', async function () {
        const openerService = new OpenerService(editorService, NullCommandService);
        await openerService.open(URI.parse('file:///somepath#23'));
        assert.strictEqual(editorService.lastInput.options.selection.startLineNumber, 23);
        assert.strictEqual(editorService.lastInput.options.selection.startColumn, 1);
        assert.strictEqual(editorService.lastInput.options.selection.endLineNumber, undefined);
        assert.strictEqual(editorService.lastInput.options.selection.endColumn, undefined);
        assert.strictEqual(editorService.lastInput.resource.fragment, '');
        await openerService.open(URI.parse('file:///somepath#23,45'));
        assert.strictEqual(editorService.lastInput.options.selection.startLineNumber, 23);
        assert.strictEqual(editorService.lastInput.options.selection.startColumn, 45);
        assert.strictEqual(editorService.lastInput.options.selection.endLineNumber, undefined);
        assert.strictEqual(editorService.lastInput.options.selection.endColumn, undefined);
        assert.strictEqual(editorService.lastInput.resource.fragment, '');
    });
    test('delegate to commandsService, command:someid', async function () {
        const openerService = new OpenerService(editorService, commandService);
        const id = `aCommand${Math.random()}`;
        store.add(CommandsRegistry.registerCommand(id, function () { }));
        assert.strictEqual(lastCommand, undefined);
        await openerService.open(URI.parse('command:' + id));
        assert.strictEqual(lastCommand, undefined);
    });
    test('delegate to commandsService, command:someid, 2', async function () {
        const openerService = new OpenerService(editorService, commandService);
        const id = `aCommand${Math.random()}`;
        store.add(CommandsRegistry.registerCommand(id, function () { }));
        await openerService.open(URI.parse('command:' + id).with({ query: '\"123\"' }), { allowCommands: true });
        assert.strictEqual(lastCommand.id, id);
        assert.strictEqual(lastCommand.args.length, 1);
        assert.strictEqual(lastCommand.args[0], '123');
        await openerService.open(URI.parse('command:' + id), { allowCommands: true });
        assert.strictEqual(lastCommand.id, id);
        assert.strictEqual(lastCommand.args.length, 0);
        await openerService.open(URI.parse('command:' + id).with({ query: '123' }), { allowCommands: true });
        assert.strictEqual(lastCommand.id, id);
        assert.strictEqual(lastCommand.args.length, 1);
        assert.strictEqual(lastCommand.args[0], 123);
        await openerService.open(URI.parse('command:' + id).with({ query: JSON.stringify([12, true]) }), { allowCommands: true });
        assert.strictEqual(lastCommand.id, id);
        assert.strictEqual(lastCommand.args.length, 2);
        assert.strictEqual(lastCommand.args[0], 12);
        assert.strictEqual(lastCommand.args[1], true);
    });
    test('links are protected by validators', async function () {
        const openerService = new OpenerService(editorService, commandService);
        store.add(openerService.registerValidator({ shouldOpen: () => Promise.resolve(false) }));
        const httpResult = await openerService.open(URI.parse('https://www.microsoft.com'));
        const httpsResult = await openerService.open(URI.parse('https://www.microsoft.com'));
        assert.strictEqual(httpResult, false);
        assert.strictEqual(httpsResult, false);
    });
    test('links validated by validators go to openers', async function () {
        const openerService = new OpenerService(editorService, commandService);
        store.add(openerService.registerValidator({ shouldOpen: () => Promise.resolve(true) }));
        let openCount = 0;
        store.add(openerService.registerOpener({
            open: (resource) => {
                openCount++;
                return Promise.resolve(true);
            }
        }));
        await openerService.open(URI.parse('http://microsoft.com'));
        assert.strictEqual(openCount, 1);
        await openerService.open(URI.parse('https://microsoft.com'));
        assert.strictEqual(openCount, 2);
    });
    test('links aren\'t manipulated before being passed to validator: PR #118226', async function () {
        const openerService = new OpenerService(editorService, commandService);
        store.add(openerService.registerValidator({
            shouldOpen: (resource) => {
                // We don't want it to convert strings into URIs
                assert.strictEqual(resource instanceof URI, false);
                return Promise.resolve(false);
            }
        }));
        await openerService.open('https://wwww.microsoft.com');
        await openerService.open('https://www.microsoft.com??params=CountryCode%3DUSA%26Name%3Dvscode"');
    });
    test('links validated by multiple validators', async function () {
        const openerService = new OpenerService(editorService, commandService);
        let v1 = 0;
        openerService.registerValidator({
            shouldOpen: () => {
                v1++;
                return Promise.resolve(true);
            }
        });
        let v2 = 0;
        openerService.registerValidator({
            shouldOpen: () => {
                v2++;
                return Promise.resolve(true);
            }
        });
        let openCount = 0;
        openerService.registerOpener({
            open: (resource) => {
                openCount++;
                return Promise.resolve(true);
            }
        });
        await openerService.open(URI.parse('http://microsoft.com'));
        assert.strictEqual(openCount, 1);
        assert.strictEqual(v1, 1);
        assert.strictEqual(v2, 1);
        await openerService.open(URI.parse('https://microsoft.com'));
        assert.strictEqual(openCount, 2);
        assert.strictEqual(v1, 2);
        assert.strictEqual(v2, 2);
    });
    test('links invalidated by first validator do not continue validating', async function () {
        const openerService = new OpenerService(editorService, commandService);
        let v1 = 0;
        openerService.registerValidator({
            shouldOpen: () => {
                v1++;
                return Promise.resolve(false);
            }
        });
        let v2 = 0;
        openerService.registerValidator({
            shouldOpen: () => {
                v2++;
                return Promise.resolve(true);
            }
        });
        let openCount = 0;
        openerService.registerOpener({
            open: (resource) => {
                openCount++;
                return Promise.resolve(true);
            }
        });
        await openerService.open(URI.parse('http://microsoft.com'));
        assert.strictEqual(openCount, 0);
        assert.strictEqual(v1, 1);
        assert.strictEqual(v2, 0);
        await openerService.open(URI.parse('https://microsoft.com'));
        assert.strictEqual(openCount, 0);
        assert.strictEqual(v1, 2);
        assert.strictEqual(v2, 0);
    });
    test('matchesScheme', function () {
        assert.ok(matchesScheme('https://microsoft.com', 'https'));
        assert.ok(matchesScheme('http://microsoft.com', 'http'));
        assert.ok(matchesScheme('hTTPs://microsoft.com', 'https'));
        assert.ok(matchesScheme('httP://microsoft.com', 'http'));
        assert.ok(matchesScheme(URI.parse('https://microsoft.com'), 'https'));
        assert.ok(matchesScheme(URI.parse('http://microsoft.com'), 'http'));
        assert.ok(matchesScheme(URI.parse('hTTPs://microsoft.com'), 'https'));
        assert.ok(matchesScheme(URI.parse('httP://microsoft.com'), 'http'));
        assert.ok(!matchesScheme(URI.parse('https://microsoft.com'), 'http'));
        assert.ok(!matchesScheme(URI.parse('htt://microsoft.com'), 'http'));
        assert.ok(!matchesScheme(URI.parse('z://microsoft.com'), 'http'));
    });
    test('matchesSomeScheme', function () {
        assert.ok(matchesSomeScheme('https://microsoft.com', 'http', 'https'));
        assert.ok(matchesSomeScheme('http://microsoft.com', 'http', 'https'));
        assert.ok(!matchesSomeScheme('x://microsoft.com', 'http', 'https'));
    });
    test('resolveExternalUri', async function () {
        const openerService = new OpenerService(editorService, NullCommandService);
        try {
            await openerService.resolveExternalUri(URI.parse('file:///Users/user/folder'));
            assert.fail('Should not reach here');
        }
        catch {
            // OK
        }
        const disposable = openerService.registerExternalUriResolver({
            async resolveExternalUri(uri) {
                return { resolved: uri, dispose() { } };
            }
        });
        const result = await openerService.resolveExternalUri(URI.parse('file:///Users/user/folder'));
        assert.deepStrictEqual(result.resolved.toString(), 'file:///Users/user/folder');
        disposable.dispose();
    });
    test('vscode.open command can\'t open HTTP URL with hash (#) in it [extension development] #140907', async function () {
        const openerService = new OpenerService(editorService, NullCommandService);
        const actual = [];
        openerService.setDefaultExternalOpener({
            async openExternal(href) {
                actual.push(href);
                return true;
            }
        });
        const href = 'https://gitlab.com/viktomas/test-project/merge_requests/new?merge_request%5Bsource_branch%5D=test-%23-hash';
        const uri = URI.parse(href);
        assert.ok(await openerService.open(uri));
        assert.ok(await openerService.open(href));
        assert.deepStrictEqual(actual, [
            encodeURI(uri.toString(true)), // BAD, the encoded # (%23) is double encoded to %2523 (% is double encoded)
            href // good
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BlbmVyU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvYnJvd3Nlci9zZXJ2aWNlcy9vcGVuZXJTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBbUIsTUFBTSxrREFBa0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUVyRyxPQUFPLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFOUYsS0FBSyxDQUFDLGVBQWUsRUFBRTtJQUN0QixNQUFNLFlBQVksR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7SUFDNUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxxQkFBcUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUU5RCxJQUFJLFdBQW9ELENBQUM7SUFFekQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQUE7WUFFM0IseUJBQW9CLEdBQUcsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQztZQUM3Qyx3QkFBbUIsR0FBRyxHQUFH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