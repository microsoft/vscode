/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Test entry point for the Sessions workbench with mock services.
// Mirrors sessions.web.main.internal.ts but uses TestSessionsBrowserMain.
import '../sessions.web.main.js';
import { create } from './web.test.factory.js';
import { URI } from '../../base/common/uri.js';
import { Event, Emitter } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { LogLevel } from '../../platform/log/common/log.js';
export { create, URI, Event, Emitter, Disposable, LogLevel, };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMud2ViLnRlc3QuaW50ZXJuYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy90ZXN0L3Nlc3Npb25zLndlYi50ZXN0LmludGVybmFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLGtFQUFrRTtBQUNsRSwwRUFBMEU7QUFFMUUsT0FBTyx5QkFBeUIsQ0FBQztBQUNqQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDL0MsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RCxPQUFPLEVBQ04sTUFBTSxFQUNOLEdBQUcsRUFDSCxLQUFLLEVBQ0wsT0FBTyxFQUNQLFVBQVUsRUFDVixRQUFRLEdBQ1IsQ0FBQyJ9