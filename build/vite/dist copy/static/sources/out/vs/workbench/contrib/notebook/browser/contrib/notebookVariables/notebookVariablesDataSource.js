/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../nls.js';
import { variablePageSize } from '../../../common/notebookKernelService.js';
export class NotebookVariableDataSource {
    constructor(notebookKernelService) {
        this.notebookKernelService = notebookKernelService;
        this.cancellationTokenSource = new CancellationTokenSource();
    }
    hasChildren(element) {
        return element.kind === 'root' || element.hasNamedChildren || element.indexedChildrenCount > 0;
    }
    cancel() {
        this.cancellationTokenSource.cancel();
        this.cancellationTokenSource.dispose();
        this.cancellationTokenSource = new CancellationTokenSource();
    }
    async getChildren(element) {
        if (element.kind === 'empty') {
            return [];
        }
        else if (element.kind === 'root') {
            return this.getRootVariables(element.notebook);
        }
        else {
            return this.getVariables(element);
        }
    }
    async getVariables(parent) {
        const selectedKernel = this.notebookKernelService.getMatchingKernel(parent.notebook).selected;
        if (selectedKernel && selectedKernel.hasVariableProvider) {
            let children = [];
            if (parent.hasNamedChildren) {
                const variables = selectedKernel.provideVariables(parent.notebook.uri, parent.extHostId, 'named', 0, this.cancellationTokenSource.token);
                for await (const variable of variables) {
                    children.push(this.createVariableElement(variable, parent.notebook));
                }
            }
            if (parent.indexedChildrenCount > 0) {
                const childNodes = await this.getIndexedChildren(parent, selectedKernel);
                children = children.concat(childNodes);
            }
            return children;
        }
        return [];
    }
    async getIndexedChildren(parent, kernel) {
        const childNodes = [];
        if (parent.indexedChildrenCount > variablePageSize) {
            const nestedPageSize = Math.floor(Math.max(parent.indexedChildrenCount / variablePageSize, 100));
            const indexedChildCountLimit = 1_000_000;
            let start = parent.indexStart ?? 0;
            const last = start + Math.min(parent.indexedChildrenCount, indexedChildCountLimit);
            for (; start < last; start += nestedPageSize) {
                let end = start + nestedPageSize;
                if (end > last) {
                    end = last;
                }
                childNodes.push({
                    kind: 'variable',
                    notebook: parent.notebook,
                    id: parent.id + `${start}`,
                    extHostId: parent.extHostId,
                    name: `[${start}..${end - 1}]`,
                    value: '',
                    indexedChildrenCount: end - start,
                    indexStart: start,
                    hasNamedChildren: false
                });
            }
            if (parent.indexedChildrenCount > indexedChildCountLimit) {
                childNodes.push({
                    kind: 'variable',
                    notebook: parent.notebook,
                    id: parent.id + `${last + 1}`,
                    extHostId: parent.extHostId,
                    name: localize('notebook.indexedChildrenLimitReached', "Display limit reached"),
                    value: '',
                    indexedChildrenCount: 0,
                    hasNamedChildren: false
                });
            }
        }
        else if (parent.indexedChildrenCount > 0) {
            const variables = kernel.provideVariables(parent.notebook.uri, parent.extHostId, 'indexed', parent.indexStart ?? 0, this.cancellationTokenSource.token);
            for await (const variable of variables) {
                childNodes.push(this.createVariableElement(variable, parent.notebook));
                if (childNodes.length >= variablePageSize) {
                    break;
                }
            }
        }
        return childNodes;
    }
    async getRootVariables(notebook) {
        const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
        if (selectedKernel && selectedKernel.hasVariableProvider) {
            const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, this.cancellationTokenSource.token);
            const varElements = [];
            for await (const variable of variables) {
                varElements.push(this.createVariableElement(variable, notebook));
            }
            return varElements;
        }
        return [];
    }
    createVariableElement(variable, notebook) {
        return {
            ...variable,
            kind: 'variable',
            notebook,
            extHostId: variable.id,
            id: `${variable.id}`
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tWYXJpYWJsZXNEYXRhU291cmNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL25vdGVib29rVmFyaWFibGVzL25vdGVib29rVmFyaWFibGVzRGF0YVNvdXJjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEQsT0FBTyxFQUE0RCxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBNEJ0SSxNQUFNLE9BQU8sMEJBQTBCO0lBSXRDLFlBQTZCLHFCQUE2QztRQUE3QywwQkFBcUIsR0FBckIscUJBQXFCLENBQXdCO1FBQ3pFLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7SUFDOUQsQ0FBQztJQUVELFdBQVcsQ0FBQyxPQUFrRDtRQUM3RCxPQUFPLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsSUFBSSxPQUFPLENBQUMsb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFTSxNQUFNO1FBQ1osSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3RDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN2QyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO0lBQzlELENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQWdFO1FBQ2pGLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUM5QixPQUFPLEVBQUUs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