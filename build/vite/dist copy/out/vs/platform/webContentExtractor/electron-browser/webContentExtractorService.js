/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerMainProcessRemoteService, registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { ISharedWebContentExtractorService, IWebContentExtractorService } from '../common/webContentExtractor.js';
registerMainProcessRemoteService(IWebContentExtractorService, 'webContentExtractor');
registerSharedProcessRemoteService(ISharedWebContentExtractorService, 'sharedWebContentExtractor');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2VsZWN0cm9uLWJyb3dzZXIvd2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDOUgsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEgsZ0NBQWdDLENBQUMsMkJBQTJCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztBQUNyRixrQ0FBa0MsQ0FBQyxpQ0FBaUMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDIn0=