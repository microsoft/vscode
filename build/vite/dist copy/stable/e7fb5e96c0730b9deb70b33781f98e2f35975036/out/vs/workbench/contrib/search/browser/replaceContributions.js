/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IReplaceService } from './replace.js';
import { ReplaceService, ReplacePreviewContentProvider } from './replaceService.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
export function registerContributions() {
    registerSingleton(IReplaceService, ReplaceService, 1 /* InstantiationType.Delayed */);
    registerWorkbenchContribution2(ReplacePreviewContentProvider.ID, ReplacePreviewContentProvider, 1 /* WorkbenchPhase.BlockStartup */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGFjZUNvbnRyaWJ1dGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9yZXBsYWNlQ29udHJpYnV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUMvQyxPQUFPLEVBQUUsY0FBYyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDcEYsT0FBTyxFQUFrQiw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWxHLE1BQU0sVUFBVSxxQkFBcUI7SUFDcEMsaUJBQWlCLENBQUMsZUFBZSxFQUFFLGNBQWMsb0NBQTRCLENBQUM7SUFDOUUsOEJBQThCLENBQUMsNkJBQTZCLENBQUMsRUFBRSxFQUFFLDZCQUE2QixzQ0FBc0QsQ0FBQztBQUN0SixDQUFDIn0=