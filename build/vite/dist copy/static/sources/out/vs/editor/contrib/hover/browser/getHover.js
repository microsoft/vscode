/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AsyncIterableProducer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { registerModelAndPositionCommand } from '../../../browser/editorExtensions.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
export class HoverProviderResult {
    constructor(provider, hover, ordinal) {
        this.provider = provider;
        this.hover = hover;
        this.ordinal = ordinal;
    }
}
/**
 * Does not throw or return a rejected promise (returns undefined instead).
 */
async function executeProvider(provider, ordinal, model, position, token) {
    const result = await Promise
        .resolve(provider.provideHover(model, position, token))
        .catch(onUnexpectedExternalError);
    if (!result || !isValid(result)) {
        return undefined;
    }
    return new HoverProviderResult(provider, result, ordinal);
}
export function getHoverProviderResultsAsAsyncIterable(registry, model, position, token, recursive = false) {
    const providers = registry.ordered(model, recursive);
    const promises = providers.map((provider, index) => executeProvider(provider, index, model, position, token));
    return AsyncIterableProducer.fromPromisesResolveOrder(promises).coalesce();
}
export async function getHoversPromise(registry, model, position, token, recursive = false) {
    const out = [];
    for await (const item of getHoverProviderResultsAsAsyncIterable(registry, model, position, token, recursive)) {
        out.push(item.hover);
    }
    return out;
}
registerModelAndPositionCommand('_executeHoverProvider', (accessor, model, position) => {
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    return getHoversPromise(languageFeaturesService.hoverProvider, model, position, CancellationToken.None);
});
registerModelAndPositionCommand('_executeHoverProvider_recursive', (accessor, model, position) => {
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    return getHoversPromise(languageFeaturesService.hoverProvider, model, position, CancellationToken.None, true);
});
function isValid(result) {
    const hasRange = (typeof result.range !== 'undefined');
    const hasHtmlContent = typeof result.contents !== 'undefined' && result.contents && result.contents.length > 0;
    return hasRange && hasHtmlContent;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0SG92ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2dldEhvdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBS3ZGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXhGLE1BQU0sT0FBTyxtQkFBbUI7SUFDL0IsWUFDaUIsUUFBdUIsRUFDdkIsS0FBWSxFQUNaLE9BQWU7UUFGZixhQUFRLEdBQVIsUUFBUSxDQUFlO1FBQ3ZCLFVBQUssR0FBTCxLQUFLLENBQU87UUFDWixZQUFPLEdBQVAsT0FBTyxDQUFRO0lBQzVCLENBQUM7Q0FDTDtBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLGVBQWUsQ0FBQyxRQUF1QixFQUFFLE9BQWUsRUFBRSxLQUFpQixFQUFFLFFBQWtCLEVBQUUsS0FBd0I7SUFDdkksTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPO1NBQzFCLE9BQU8sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDdEQsS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDbkMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQ2pDLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFDRCxPQUFPLElBQUksbUJBQW1CLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBRUQsTUFBTSxVQUFVLHNDQUFzQyxDQUFDLFFBQWdELEVBQUUsS0FBaUIsRUFBRSxRQUFrQixFQUFFLEtBQXdCLEVBQUUsU0FBUyxHQUFHLEtBQUs7SUFDMUwsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDckQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM5RyxPQUFPLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0FBQzVFLENBQUM7QUFFRCxNQUFNLENBQUMsS0FBSyxVQUFVLGdCQUFnQixDQUFDLFFBQWdELEVBQUUsS0FBaUIsRUFBRSxRQUFrQixFQUFFLEtBQXdCLEVBQUUsU0FBUyxHQUFHLEtBQUs7SUFDMUssTUFBTSxHQUFHLEdBQVksRUFBRSxDQUFDO0lBQ3hCLElBQUksS0FBSyxFQUFFLE1BQU0sSUFBSSxJQUFJLHNDQUFzQyxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQzlHLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3RCLENBQUM7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNaLENBQUM7QUFFRCwrQkFBK0IsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFvQixFQUFFO0lBQ3hHLE1BQU0sdUJBQXVCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3ZFLE9BQU8sZ0JBQWdCLENBQUMsdUJBQXVCLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekcsQ0FBQyxDQUFDLENBQUM7QUFFSCwrQkFBK0IsQ0FBQyxpQ0FBaUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFvQixFQUFFO0lBQ2xILE1BQU0sdUJBQXVCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3ZFLE9BQU8sZ0JBQWdCLENBQUMsdUJBQXVCLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQy9HLENBQUMsQ0FBQyxDQUFDO0FBRUgsU0FBUyxPQUFPLENBQUMsTUFBYTtJQUM3QixNQUFNLFFBQVEsR0FBRyxDQUFDLE9BQU8sTUFBTSxDQUFDLEtBQUssS0FBSyxXQUFXLENBQUMsQ0FBQztJQUN2RCxNQUFNLGNBQWMsR0FBRyxPQUFPLE1BQU0sQ0FBQyxRQUFRLEtBQUssV0FBVyxJQUFJLE1BQU0sQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQy9HLE9BQU8sUUFBUSxJQUFJLGNBQWMsQ0FBQztBQUNuQyxDQUFDIn0=