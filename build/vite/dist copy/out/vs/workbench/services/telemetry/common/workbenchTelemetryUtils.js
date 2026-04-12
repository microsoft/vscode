/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
/**
 * Determines if experiment properties will be set on telemetry events.
 * When true, TelemetryService should buffer events until setExperimentProperty is called.
 */
export function experimentsEnabled(configurationService, productService, environmentService) {
    return getTelemetryLevel(configurationService) === 3 /* TelemetryLevel.USAGE */ &&
        !!productService.tasConfig &&
        !environmentService.disableExperiments &&
        !environmentService.extensionTestsLocationURI &&
        !environmentService.enableSmokeTestDriver &&
        configurationService.getValue('workbench.enableExperiments') === true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGVsZW1ldHJ5VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGVsZW1ldHJ5L2NvbW1vbi93b3JrYmVuY2hUZWxlbWV0cnlVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUc1Rjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsa0JBQWtCLENBQ2pDLG9CQUEyQyxFQUMzQyxjQUErQixFQUMvQixrQkFBZ0Q7SUFFaEQsT0FBTyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxpQ0FBeUI7UUFDdEUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTO1FBQzFCLENBQUMsa0JBQWtCLENBQUMsa0JBQWtCO1FBQ3RDLENBQUMsa0JBQWtCLENBQUMseUJBQXlCO1FBQzdDLENBQUMsa0JBQWtCLENBQUMscUJBQXFCO1FBQ3pDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLElBQUksQ0FBQztBQUN4RSxDQUFDIn0=