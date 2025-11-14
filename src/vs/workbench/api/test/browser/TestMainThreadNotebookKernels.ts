/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../test/common/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { INotebookKernel, INotebookKernelService } from '../../../contrib/notebook/common/notebookKernelService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { INotebookCellExecution, INotebookExecution, INotebookExecutionStateService } from '../../../contrib/notebook/common/notebookExecutionStateService.js';
import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { INotebookEditorService } from '../../../contrib/notebook/browser/services/notebookEditorService.js';
import { Event } from '../../../../base/common/event.js';
import { MainThreadNotebookKernels } from '../../browser/mainThreadNotebookKernels.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

export class TestMainThreadNotebookKernels extends Disposable {
	private readonly instantiationService: TestInstantiationService;
	private readonly registeredKernels = new Map<string, INotebookKernel>();
	private mainThreadNotebookKernels: MainThreadNotebookKernels;
	private kernelHandle = 0;

	constructor(extHostContext: IExtHostContext) {
		super();
		this.instantiationService = this._register(new TestInstantiationService());
		this.setupDefaultStubs();
		this.mainThreadNotebookKernels = this._register(this.instantiationService.createInstance(MainThreadNotebookKernels, extHostContext));
	}

	private setupDefaultStubs(): void {
		this.instantiationService.stub(ILanguageService, new class extends mock<ILanguageService>() {
			override getRegisteredLanguageIds() {
				return ['typescript', 'javascript', 'python'];
			}
		});

		this.instantiationService.stub(INotebookKernelService, new class extends mock<INotebookKernelService>() {
			constructor(private builder: TestMainThreadNotebookKernels) {
				super();
			}

			override registerKernel(kernel: INotebookKernel) {
				this.builder.registeredKernels.set(kernel.id, kernel);
				return Disposable.None;
			}
			override onDidChangeSelectedNotebooks = Event.None;
			override getMatchingKernel() {
				return {
					selected: undefined,
					suggestions: [],
					all: [],
					hidden: []
				};
			}
		}(this));

		this.instantiationService.stub(INotebookExecutionStateService, new class extends mock<INotebookExecutionStateService>() {
			override createCellExecution(): INotebookCellExecution {
				return new class extends mock<INotebookCellExecution>() { };
			}
			override createExecution(): INotebookExecution {
				return new class extends mock<INotebookExecution>() { };
			}
		});

		this.instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override getNotebookTextModel() {
				return undefined;
			}
		});

		this.instantiationService.stub(INotebookEditorService, new class extends mock<INotebookEditorService>() {
			override listNotebookEditors() {
				return [];
			}
			override onDidAddNotebookEditor = Event.None;
			override onDidRemoveNotebookEditor = Event.None;
		});
	}

	get instance(): MainThreadNotebookKernels {
		return this.mainThreadNotebookKernels;
	}

	async addKernel(id: string): Promise<void> {
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

	getKernel(id: string): INotebookKernel | undefined {
		return this.registeredKernels.get(id);
	}
}
