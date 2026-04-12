/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IEditorWorkerService } from '../../common/services/editorWorker.js';
import { registerEditorContribution } from '../editorExtensions.js';
import { EditorWorkerService } from './editorWorkerService.js';
import { MarkerDecorationsContribution } from './markerDecorations.js';
/* registers link detection and word based suggestions for any document */
registerSingleton(IEditorWorkerService, EditorWorkerService, 0 /* InstantiationType.Eager */);
// eager because it instantiates IMarkerDecorationsService which is responsible for rendering squiggles
registerEditorContribution(MarkerDecorationsContribution.ID, MarkerDecorationsContribution, 0 /* EditorContributionInstantiation.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBcUIsTUFBTSxzREFBc0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RSxPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDckcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFdkUsMEVBQTBFO0FBQzFFLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLG1CQUFtQixrQ0FBMEIsQ0FBQztBQUV0Rix1R0FBdUc7QUFDdkcsMEJBQTBCLENBQUMsNkJBQTZCLENBQUMsRUFBRSxFQUFFLDZCQUE2QixnREFBd0MsQ0FBQyJ9