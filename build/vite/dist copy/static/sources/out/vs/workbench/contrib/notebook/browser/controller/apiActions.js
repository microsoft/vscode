/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as glob from '../../../../../base/common/glob.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { isDocumentExcludePattern } from '../../common/notebookCommon.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookService } from '../../common/notebookService.js';
CommandsRegistry.registerCommand('_resolveNotebookContentProvider', (accessor) => {
    const notebookService = accessor.get(INotebookService);
    const contentProviders = notebookService.getContributedNotebookTypes();
    return contentProviders.map(provider => {
        const filenamePatterns = provider.selectors.map(selector => {
            if (typeof selector === 'string') {
                return selector;
            }
            if (glob.isRelativePattern(selector)) {
                return selector;
            }
            if (isDocumentExcludePattern(selector)) {
                return {
                    include: selector.include,
                    exclude: selector.exclude
                };
            }
            return null;
        }).filter(pattern => pattern !== null);
        return {
            viewType: provider.id,
            displayName: provider.displayName,
            filenamePattern: filenamePatterns,
            options: {
                transientCellMetadata: provider.options.transientCellMetadata,
                transientDocumentMetadata: provider.options.transientDocumentMetadata,
                transientOutputs: provider.options.transientOutputs
            }
        };
    });
});
CommandsRegistry.registerCommand('_resolveNotebookKernels', async (accessor, args) => {
    const notebookKernelService = accessor.get(INotebookKernelService);
    const uri = URI.revive(args.uri);
    const kernels = notebookKernelService.getMatchingKernel({ uri, notebookType: args.viewType });
    return kernels.all.map(provider => ({
        id: provider.id,
        label: provider.label,
        description: provider.description,
        detail: provider.detail,
        isPreferred: false, // todo@jrieken,@rebornix
        preloads: provider.preloadUris,
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9hcGlBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxJQUFJLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsd0JBQXdCLEVBQW9ELE1BQU0sZ0NBQWdDLENBQUM7QUFDNUgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFbkUsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLGlDQUFpQyxFQUFFLENBQUMsUUFBUSxFQUt6RSxFQUFFO0lBQ0wsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBbUIsZ0JBQWdCLENBQUMsQ0FBQztJQUN6RSxNQUFNLGdCQUFnQixHQUFHLGVBQWUsQ0FBQywyQkFBMkIsRUFBRSxDQUFDO0lBQ3ZFLE9BQU8sZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3RDLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDMUQsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbEMsT0FBTyxRQUFRLENBQUM7WUFDakIsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLE9BQU8sUUFBUSxDQUFDO1lBQ2pCLENBQUM7WUFFRCxJQUFJLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLE9BQU87b0JBQ04sT0FBTyxFQUFFLFFBQVEsQ0FBQyxPQUFPO29CQUN6QixPQUFPLEVBQUUsUUFBUSxDQUFDLE9BQU87aUJBQ3pCLENBQUM7WUFDSCxDQUFDO1lBRUQsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUE4SCxDQUFDO1FBRXBLLE9BQU87WUFDTixRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQUU7WUFDckIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXO1lBQ2pDLGVBQWUsRUFBRSxnQkFBZ0I7WUFDakMsT0FBTyxFQUFFO2dCQUNSLHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMscUJBQXFCO2dCQUM3RCx5QkFBeUIsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLHlCQUF5QjtnQkFDckUsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0I7YUFDbkQ7U0FDRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILGdCQUFnQixDQUFDLGVBQWUsQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLElBRzVFLEVBT0ksRUFBRTtJQUNOLE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBQ25FLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQW9CLENBQUMsQ0FBQztJQUNsRCxNQUFNLE9BQU8sR0FBRyxxQkFBcUIsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFFOUYsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxFQUFFO1FBQ2YsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO1FBQ3JCLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVztRQUNqQyxNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07UUFDdkIsV0FBVyxFQUFFLEtBQUssRUFBRSx5QkFBeUI7UUFDN0MsUUFBUSxFQUFFLFFBQVEsQ0FBQyxXQUFXO0tBQzlCLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMifQ==