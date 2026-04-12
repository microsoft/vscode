/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const ID = 'diagnosticsService';
export const IDiagnosticsService = createDecorator(ID);
export function isRemoteDiagnosticError(x) {
    const candidate = x;
    return !!candidate?.hostName && !!candidate?.errorMessage;
}
export class NullDiagnosticsService {
    async getPerformanceInfo(mainProcessInfo, remoteInfo) {
        return {};
    }
    async getSystemInfo(mainProcessInfo, remoteInfo) {
        return {
            processArgs: 'nullProcessArgs',
            gpuStatus: 'nullGpuStatus',
            screenReader: 'nullScreenReader',
            remoteData: [],
            os: 'nullOs',
            memory: 'nullMemory',
            vmHint: 'nullVmHint',
        };
    }
    async getDiagnostics(mainProcessInfo, remoteInfo) {
        return '';
    }
    async getWorkspaceFileExtensions(workspace) {
        return { extensions: [] };
    }
    async reportWorkspaceStats(workspace) { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhZ25vc3RpY3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9kaWFnbm9zdGljcy9jb21tb24vZGlhZ25vc3RpY3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzlFLE1BQU0sQ0FBQyxNQUFNLEVBQUUsR0FBRyxvQkFBb0IsQ0FBQztBQUN2QyxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLEVBQUUsQ0FBQyxDQUFDO0FBbUY1RSxNQUFNLFVBQVUsdUJBQXVCLENBQUMsQ0FBVTtJQUNqRCxNQUFNLFNBQVMsR0FBRyxDQUF1QyxDQUFDO0lBQzFELE9BQU8sQ0FBQyxDQUFDLFNBQVMsRUFBRSxRQUFRLElBQUksQ0FBQyxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUM7QUFDM0QsQ0FBQztBQUVELE1BQU0sT0FBTyxzQkFBc0I7SUFHbEMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLGVBQXdDLEVBQUUsVUFBOEQ7UUFDaEksT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxlQUF3QyxFQUFFLFVBQThEO1FBQzNILE9BQU87WUFDTixXQUFXLEVBQUUsaUJBQWlCO1lBQzlCLFNBQVMsRUFBRSxlQUFlO1lBQzFCLFlBQVksRUFBRSxrQkFBa0I7WUFDaEMsVUFBVSxFQUFFLEVBQUU7WUFDZCxFQUFFLEVBQUUsUUFBUTtZQUNaLE1BQU0sRUFBRSxZQUFZO1lBQ3BCLE1BQU0sRUFBRSxZQUFZO1NBQ3BCLENBQUM7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxlQUF3QyxFQUFFLFVBQThEO1FBQzVILE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxTQUFxQjtRQUNyRCxPQUFPLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsU0FBZ0MsSUFBbUIsQ0FBQztDQUUvRSJ9