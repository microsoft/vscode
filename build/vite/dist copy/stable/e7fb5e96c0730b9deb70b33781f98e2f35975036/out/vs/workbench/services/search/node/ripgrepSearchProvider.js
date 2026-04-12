/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { RipgrepTextSearchEngine } from './ripgrepTextSearchEngine.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { Schemas } from '../../../../base/common/network.js';
export class RipgrepSearchProvider {
    constructor(outputChannel, getNumThreads) {
        this.outputChannel = outputChannel;
        this.getNumThreads = getNumThreads;
        this.inProgress = new Set();
        process.once('exit', () => this.dispose());
    }
    async provideTextSearchResults(query, options, progress, token) {
        const numThreads = await this.getNumThreads();
        const engine = new RipgrepTextSearchEngine(this.outputChannel, numThreads);
        return Promise.all(options.folderOptions.map(folderOption => {
            const extendedOptions = {
                folderOptions: folderOption,
                numThreads,
                maxResults: options.maxResults,
                previewOptions: options.previewOptions,
                maxFileSize: options.maxFileSize,
                surroundingContext: options.surroundingContext
            };
            if (folderOption.folder.scheme === Schemas.vscodeUserData) {
                // Ripgrep search engine can only provide file-scheme results, but we want to use it to search some schemes that are backed by the filesystem, but with some other provider as the frontend,
                // case in point vscode-userdata. In these cases we translate the query to a file, and translate the results back to the frontend scheme.
                const translatedOptions = { ...extendedOptions, folder: folderOption.folder.with({ scheme: Schemas.file }) };
                const progressTranslator = new Progress(data => progress.report({ ...data, uri: data.uri.with({ scheme: folderOption.folder.scheme }) }));
                return this.withToken(token, token => engine.provideTextSearchResultsWithRgOptions(query, translatedOptions, progressTranslator, token));
            }
            else {
                return this.withToken(token, token => engine.provideTextSearchResultsWithRgOptions(query, extendedOptions, progress, token));
            }
        })).then((e => {
            const complete = {
                // todo: get this to actually check
                limitHit: e.some(complete => !!complete && complete.limitHit)
            };
            return complete;
        }));
    }
    async withToken(token, fn) {
        const merged = mergedTokenSource(token);
        this.inProgress.add(merged);
        const result = await fn(merged.token);
        this.inProgress.delete(merged);
        return result;
    }
    dispose() {
        this.inProgress.forEach(engine => engine.cancel());
    }
}
function mergedTokenSource(token) {
    const tokenSource = new CancellationTokenSource();
    token.onCancellationRequested(() => tokenSource.cancel());
    return tokenSource;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmlwZ3JlcFNlYXJjaFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9ub2RlL3JpcGdyZXBTZWFyY2hQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQXFCLE1BQU0seUNBQXlDLENBQUM7QUFFckcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUc3RCxNQUFNLE9BQU8scUJBQXFCO0lBR2pDLFlBQW9CLGFBQTRCLEVBQVUsYUFBZ0Q7UUFBdEYsa0JBQWEsR0FBYixhQUFhLENBQWU7UUFBVSxrQkFBYSxHQUFiLGFBQWEsQ0FBbUM7UUFGbEcsZUFBVSxHQUFpQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRzVELE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxLQUFLLENBQUMsd0JBQXdCLENBQUMsS0FBdUIsRUFBRSxPQUFrQyxFQUFFLFFBQXFDLEVBQUUsS0FBd0I7UUFDMUosTUFBTSxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUMsTUFBTSxNQUFNLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTNFLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUUzRCxNQUFNLGVBQWUsR0FBNkI7Z0JBQ2pELGFBQWEsRUFBRSxZQUFZO2dCQUMzQixVQUFVO2dCQUNWLFVBQVUsRUFBRSxPQUFPLENBQUMsVUFBVTtnQkFDOUIsY0FBYyxFQUFFLE9BQU8sQ0FBQyxjQUFjO2dCQUN0QyxXQUFXLEVBQUUsT0FBTyxDQUFDLFdBQVc7Z0JBQ2hDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxrQkFBa0I7YUFDOUMsQ0FBQztZQUNGLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUMzRCw0TEFBNEw7Z0JBQzVMLHlJQUF5STtnQkFDekksTUFBTSxpQkFBaUIsR0FBRyxFQUFFLEdBQUcsZUFBZSxFQUFFLE1BQU0sRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUM3RyxNQUFNLGtCQUFrQixHQUFHLElBQUksUUFBUSxDQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3SixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLHFDQUFxQyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzFJLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLHFDQUFxQyxDQUFDLEtBQUssRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDOUgsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDYixNQUFNLFFBQVEsR0FBd0I7Z0JBQ3JDLG1DQUFtQztnQkFDbkMsUUFBUSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUM7YUFDN0QsQ0FBQztZQUNGLE9BQU8sUUFBUSxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFTCxDQUFDO0lBRU8sS0FBSyxDQUFDLFNBQVMsQ0FBSSxLQUF3QixFQUFFLEVBQTRDO1FBQ2hHLE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVCLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUvQixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxPQUFPO1FBQ2QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNwRCxDQUFDO0NBQ0Q7QUFFRCxTQUFTLGlCQUFpQixDQUFDLEtBQXdCO0lBQ2xELE1BQU0sV0FBVyxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztJQUNsRCxLQUFLLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFFMUQsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQyJ9