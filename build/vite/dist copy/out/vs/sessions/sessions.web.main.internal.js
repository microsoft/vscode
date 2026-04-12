/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// This file is the web embedder entry point for the Sessions workbench.
// It mirrors workbench.web.main.internal.ts but loads the sessions entry
// point and factory instead of the standard workbench ones.
import './sessions.web.main.js';
import { create } from './browser/web.factory.js';
import { URI } from '../base/common/uri.js';
import { Event, Emitter } from '../base/common/event.js';
import { Disposable } from '../base/common/lifecycle.js';
import { LogLevel } from '../platform/log/common/log.js';
export { create, URI, Event, Emitter, Disposable, LogLevel, };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMud2ViLm1haW4uaW50ZXJuYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9zZXNzaW9ucy53ZWIubWFpbi5pbnRlcm5hbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyx3RUFBd0U7QUFDeEUseUVBQXlFO0FBQ3pFLDREQUE0RDtBQUU1RCxPQUFPLHdCQUF3QixDQUFDO0FBQ2hDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUMsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXpELE9BQU8sRUFDTixNQUFNLEVBQ04sR0FBRyxFQUNILEtBQUssRUFDTCxPQUFPLEVBQ1AsVUFBVSxFQUNWLFFBQVEsR0FDUixDQUFDIn0=