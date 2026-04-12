/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BrowserMain } from '../../workbench/browser/web.main.js';
import { Workbench as SessionsWorkbench } from './workbench.js';
export class SessionsBrowserMain extends BrowserMain {
    createWorkbench(domElement, serviceCollection, logService) {
        console.log('[Sessions Web] Creating Sessions workbench (not standard workbench)');
        return new SessionsWorkbench(domElement, undefined, serviceCollection, logService);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLm1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9icm93c2VyL3dlYi5tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxXQUFXLEVBQXlCLE1BQU0scUNBQXFDLENBQUM7QUFDekYsT0FBTyxFQUFFLFNBQVMsSUFBSSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRWhFLE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxXQUFXO0lBRWhDLGVBQWUsQ0FBQyxVQUF1QixFQUFFLGlCQUFvQyxFQUFFLFVBQXVCO1FBQ3hILE9BQU8sQ0FBQyxHQUFHLENBQUMscUVBQXFFLENBQUMsQ0FBQztRQUNuRixPQUFPLElBQUksaUJBQWlCLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUNwRixDQUFDO0NBQ0QifQ==