/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { asPromise } from '../../../base/common/async.js';
import { DocumentSelector } from './extHostTypeConverters.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
export class ExtHostQuickDiff {
    static { this.handlePool = 0; }
    constructor(mainContext, uriTransformer) {
        this.uriTransformer = uriTransformer;
        this.providers = new Map();
        this.proxy = mainContext.getProxy(MainContext.MainThreadQuickDiff);
    }
    $provideOriginalResource(handle, uriComponents, token) {
        const uri = URI.revive(uriComponents);
        const provider = this.providers.get(handle);
        if (!provider) {
            return Promise.resolve(null);
        }
        return asPromise(() => provider.provideOriginalResource(uri, token))
            .then(r => r || null);
    }
    registerQuickDiffProvider(extension, selector, quickDiffProvider, id, label, rootUri) {
        const handle = ExtHostQuickDiff.handlePool++;
        this.providers.set(handle, quickDiffProvider);
        const extensionId = ExtensionIdentifier.toKey(extension.identifier);
        this.proxy.$registerQuickDiffProvider(handle, DocumentSelector.from(selector, this.uriTransformer), `${extensionId}.${id}`, label, rootUri);
        return {
            dispose: () => {
                this.proxy.$unregisterQuickDiffProvider(handle);
                this.providers.delete(handle);
            }
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFF1aWNrRGlmZi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RRdWlja0RpZmYudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQXVDLFdBQVcsRUFBNEIsTUFBTSx1QkFBdUIsQ0FBQztBQUNuSCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFOUQsT0FBTyxFQUFFLG1CQUFtQixFQUF5QixNQUFNLG1EQUFtRCxDQUFDO0FBRS9HLE1BQU0sT0FBTyxnQkFBZ0I7YUFDYixlQUFVLEdBQVcsQ0FBQyxBQUFaLENBQWE7SUFLdEMsWUFDQyxXQUF5QixFQUNSLGNBQTJDO1FBQTNDLG1CQUFjLEdBQWQsY0FBYyxDQUE2QjtRQUpyRCxjQUFTLEdBQTBDLElBQUksR0FBRyxFQUFFLENBQUM7UUFNcEUsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxNQUFjLEVBQUUsYUFBNEIsRUFBRSxLQUF3QjtRQUM5RixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QixDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLHVCQUF3QixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzthQUNuRSxJQUFJLENBQXVCLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCx5QkFBeUIsQ0FBQyxTQUFnQyxFQUFFLFFBQWlDLEVBQUUsaUJBQTJDLEVBQUUsRUFBVSxFQUFFLEtBQWEsRUFBRSxPQUFvQjtRQUMxTCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUM3QyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUU5QyxNQUFNLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLEdBQUcsV0FBVyxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM1SSxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixJQUFJLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNoRCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMvQixDQUFDO1NBQ0QsQ0FBQztJQUNILENBQUMifQ==