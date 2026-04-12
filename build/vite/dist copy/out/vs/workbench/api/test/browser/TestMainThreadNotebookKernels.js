/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mock } from '../../../test/common/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotebookKernelService } from '../../../contrib/notebook/common/notebookKernelService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { INotebookExecutionStateService } from '../../../contrib/notebook/common/notebookExecutionStateService.js';
import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { INotebookEditorService } from '../../../contrib/notebook/browser/services/notebookEditorService.js';
import { Event } from '../../../../base/common/event.js';
import { MainThreadNotebookKernels } from '../../browser/mainThreadNotebookKernels.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
export class TestMainThreadNotebookKernels extends Disposable {
    constructor(extHostContext) {
        super();
        this.registeredKernels = new Map();
        this.kernelHandle = 0;
        this.instantiationService = this._register(new TestInstantiationService());
        this.setupDefaultStubs();
        this.mainThreadNotebookKernels = this._register(this.instantiationService.createInstance(MainThreadNotebookKernels, extHostContext));
    }
    setupDefaultStubs() {
        this.instantiationService.stub(ILanguageService, new class extends mock() {
            getRegisteredLanguageIds() {
                return ['typescript', 'javascript', 'python'];
            }
        });
        this.instantiationService.stub(INotebookKernelService, new class extends mock() {
            constructor(builder) {
                super();
                this.builder = builder;
                this.onDidChangeSelectedNotebooks = Event.None;
            }
            registerKernel(kernel) {
                this.builder.registeredKernels.set(kernel.id, kernel);
                return Disposable.None;
            }
            getMatchingKernel() {
                return {
                    selected: undefined,
                    suggestions: [],
                    all: [],
                    hidden: []
                };
            }
        }(this));
        this.instantiationService.stub(INotebookExecutionStateService, new class extends mock() {
            createCellExecution() {
                return new class extends mock() {
                };
            }
            createExecution() {
                return new class extends mock() {
                };
            }
        });
        this.instantiationService.stub(INotebookService, new class extends mock() {
            getNotebookTextModel() {
                return undefined;
            }
        });
        this.instantiationService.stub(INotebookEditorService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidAddNotebookEditor = Event.None;
                this.onDidRemoveNotebookEditor = Event.None;
            }
            listNotebookEditors() {
                return [];
            }
        });
    }
    get instance() {
        return this.mainThreadNotebookKernels;
    }
    async addKernel(id) {
        const handle = this.kernelHandle++;
        await this.instance.$addKernel(handle, {
            id,
            notebookType: 'test-notebook',
            extensionId: new ExtensionIdentifier('test.extension'),
            extensionLocation: { scheme: 'test', path: '/test' },
            label: 'Test Kernel',
            description: 'A test kernel',
            hasVariableProvider: true
        });
    }
    getKernel(id) {
        return this.registeredKernels.get(id);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGVzdE1haW5UaHJlYWROb3RlYm9va0tlcm5lbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9UZXN0TWFpblRocmVhZE5vdGVib29rS2VybmVscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDckUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFFdEgsT0FBTyxFQUFtQixzQkFBc0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3BILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQThDLDhCQUE4QixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDL0osT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDN0csT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTNGLE1BQU0sT0FBTyw2QkFBOEIsU0FBUSxVQUFVO0lBTTVELFlBQVksY0FBK0I7UUFDMUMsS0FBSyxFQUFFLENBQUM7UUFMUSxzQkFBaUIsR0FBRyxJQUFJLEdBQUcsRUFBMkIsQ0FBQztRQUVoRSxpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUl4QixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJ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