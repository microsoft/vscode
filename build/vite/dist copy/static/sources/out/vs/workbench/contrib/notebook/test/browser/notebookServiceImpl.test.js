/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NotebookProviderInfoStore } from '../../browser/services/notebookServiceImpl.js';
import { NotebookProviderInfo } from '../../common/notebookProvider.js';
import { EditorResolverService } from '../../../../services/editor/browser/editorResolverService.js';
import { RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('NotebookProviderInfoStore', function () {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    test('Can\'t open untitled notebooks in test #119363', function () {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const store = new NotebookProviderInfoStore(new class extends mock() {
            get() { return ''; }
            store() { }
            getObject() { return {}; }
        }, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidRegisterExtensions = Event.None;
            }
        }, disposables.add(instantiationService.createInstance(EditorResolverService)), new TestConfigurationService(), new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeScreenReaderOptimized = Event.None;
            }
        }, instantiationService, new class extends mock() {
            hasProvider() { return true; }
        }, new class extends mock() {
        }, new class extends mock() {
        });
        disposables.add(store);
        const fooInfo = new NotebookProviderInfo({
            extension: nullExtensionDescription.identifier,
            id: 'foo',
            displayName: 'foo',
            selectors: [{ filenamePattern: '*.foo' }],
            priority: RegisteredEditorPriority.default,
            providerDisplayName: 'foo',
        });
        const barInfo = new NotebookProviderInfo({
            extension: nullExtensionDescription.identifier,
            id: 'bar',
            displayName: 'bar',
            selectors: [{ filenamePattern: '*.bar' }],
            priority: RegisteredEditorPriority.default,
            providerDisplayName: 'bar',
        });
        store.add(fooInfo);
        store.add(barInfo);
        assert.ok(store.get('foo'));
        assert.ok(store.get('bar'));
        assert.ok(!store.get('barfoo'));
        let providers = store.getContributedNotebook(URI.parse('file:///test/nb.foo'));
        assert.strictEqual(providers.length, 1);
        assert.strictEqual(providers[0] === fooInfo, true);
        providers = store.getContributedNotebook(URI.parse('file:///test/nb.bar'));
        assert.strictEqual(providers.length, 1);
        assert.strictEqual(providers[0] === barInfo, true);
        providers = store.getContributedNotebook(URI.parse('untitled:///Untitled-1'));
        assert.strictEqual(providers.length, 2);
        assert.strictEqual(providers[0] === fooInfo, true);
        assert.strictEqual(providers[1] === barInfo, true);
        providers = store.getContributedNotebook(URI.parse('untitled:///test/nb.bar'));
        assert.strictEqual(providers.length, 1);
        assert.strictEqual(providers[0] === barInfo, true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTZXJ2aWNlSW1wbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL25vdGVib29rU2VydmljZUltcGwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFJekgsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDckcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDdkcsT0FBTyxFQUFxQix3QkFBd0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ25ILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxHLEtBQUssQ0FBQywyQkFBMkIsRUFBRTtJQUNsQyxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBa0MsQ0FBQztJQUU5RixJQUFJLENBQUMsZ0RBQWdELEVBQUU7UUFDdEQsTUFBTSxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENB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