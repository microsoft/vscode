/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Part } from '../../browser/part.js';
import { isEmptyObject } from '../../../base/common/types.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { append, $, hide } from '../../../base/browser/dom.js';
import { TestLayoutService } from './workbenchTestServices.js';
import { TestStorageService } from '../common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { mainWindow } from '../../../base/browser/window.js';
suite('Workbench parts', () => {
    const disposables = new DisposableStore();
    class SimplePart extends Part {
        constructor() {
            super(...arguments);
            this.minimumWidth = 50;
            this.maximumWidth = 50;
            this.minimumHeight = 50;
            this.maximumHeight = 50;
        }
        layout(width, height) {
            throw new Error('Method not implemented.');
        }
        toJSON() {
            throw new Error('Method not implemented.');
        }
    }
    class MyPart extends SimplePart {
        constructor(expectedParent) {
            super('myPart', { hasTitle: true }, new TestThemeService(), disposables.add(new TestStorageService()), new TestLayoutService());
            this.expectedParent = expectedParent;
        }
        createTitleArea(parent) {
            assert.strictEqual(parent, this.expectedParent);
            return super.createTitleArea(parent);
        }
        createContentArea(parent) {
            assert.strictEqual(parent, this.expectedParent);
            return super.createContentArea(parent);
        }
        testGetMemento(scope, target) {
            return super.getMemento(scope, target);
        }
        testSaveState() {
            return super.saveState();
        }
    }
    class MyPart2 extends SimplePart {
        constructor() {
            super('myPart2', { hasTitle: true }, new TestThemeService(), disposables.add(new TestStorageService()), new TestLayoutService());
        }
        createTitleArea(parent) {
            const titleContainer = append(parent, $('div'));
            const titleLabel = append(titleContainer, $('span'));
            titleLabel.id = 'myPart.title';
            titleLabel.innerText = 'Title';
            return titleContainer;
        }
        createContentArea(parent) {
            const contentContainer = append(parent, $('div'));
            const contentSpan = append(contentContainer, $('span'));
            contentSpan.id = 'myPart.content';
            contentSpan.innerText = 'Content';
            return contentContainer;
        }
    }
    class MyPart3 extends SimplePart {
        constructor() {
            super('myPart2', { hasTitle: false }, new TestThemeService(), disposables.add(new TestStorageService()), new TestLayoutService());
        }
        createTitleArea(parent) {
            return null;
        }
        createContentArea(parent) {
            const contentContainer = append(parent, $('div'));
            const contentSpan = append(contentContainer, $('span'));
            contentSpan.id = 'myPart.content';
            contentSpan.innerText = 'Content';
            return contentContainer;
        }
    }
    let fixture;
    const fixtureId = 'workbench-part-fixture';
    setup(() => {
        fixture = document.createElement('div');
        fixture.id = fixtureId;
        mainWindow.document.body.appendChild(fixture);
    });
    teardown(() => {
        fixture.remove();
        disposables.clear();
    });
    test('Creation', () => {
        const b = document.createElement('div');
        mainWindow.document.getElementById(fixtureId).appendChild(b);
        hide(b);
        let part = disposables.add(new MyPart(b));
        part.create(b);
        assert.strictEqual(part.getId(), 'myPart');
        // Memento
        // eslint-disable-next-line local/code-no-any-casts
        let memento = part.testGetMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        assert(memento);
        memento.foo = 'bar';
        memento.bar = [1, 2, 3];
        part.testSaveState();
        // Re-Create to assert memento contents
        part = disposables.add(new MyPart(b));
        memento = part.testGetMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        assert(memento);
        assert.strictEqual(memento.foo, 'bar');
        assert.strictEqual(memento.bar.length, 3);
        // Empty Memento stores empty object
        delete memento.foo;
        delete memento.bar;
        part.testSaveState();
        part = disposables.add(new MyPart(b));
        memento = part.testGetMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        assert(memento);
        assert.strictEqual(isEmptyObject(memento), true);
    });
    test('Part Layout with Title and Content', function () {
        const b = document.createElement('div');
        mainWindow.document.getElementById(fixtureId).appendChild(b);
        hide(b);
        const part = disposables.add(new MyPart2());
        part.create(b);
        assert(mainWindow.document.getElementById('myPart.title'));
        assert(mainWindow.document.getElementById('myPart.content'));
    });
    test('Part Layout with Content only', function () {
        const b = document.createElement('div');
        mainWindow.document.getElementById(fixtureId).appendChild(b);
        hide(b);
        const part = disposables.add(new MyPart3());
        part.create(b);
        assert(!mainWindow.document.getElementById('myPart.title'));
        assert(mainWindow.document.getElementById('myPart.content'));
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFydC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9wYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM3QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFL0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUU3RCxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO0lBRTdCLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFFMUMsTUFBTSxVQUFXLFNBQVEsSUFBSTtRQUE3Qjs7WUFFQyxpQkFBWSxHQUFXLEVBQUUsQ0FBQztZQUMxQixpQkFBWSxHQUFXLEVBQUUsQ0FBQztZQUMxQixrQkFBYSxHQUFXLEVBQUUsQ0FBQztZQUMzQixrQkFBYSxHQUFXLEVBQUUsQ0FBQztRQVM1QixDQUFDO1FBUFMsTUFBTSxDQUFDLEtBQWEsRUFBRSxNQUFjO1lBQzVDLE1BQU0sSUFB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