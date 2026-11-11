/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ServicesAccessor, ServiceIdentifier } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAgentHostDebugLogsExportService } from '../../../../../../workbench/contrib/chat/browser/actions/exportAgentHostDebugLogsAction.js';
import { IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostKind } from '../../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ExportAgentHostDebugLogsAction } from '../../browser/exportDebugLogsAction.js';

suite('Sessions - Export Agent Host Debug Logs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** Whether running the action with `args` starts the export, which first gets the export service. */
	async function startsExport(...args: unknown[]): Promise<boolean> {
		const services = new Map<ServiceIdentifier<unknown>, unknown>([
			[ILogService, new NullLogService()],
			[ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined })],
			[ISessionHostService, upcastPartial<ISessionHostService>({})],
			// An empty composer: the focused host shows no session.
			[IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({
				getFocusedHost: () => upcastPartial<ISessionHost>({ kind: SessionHostKind.MainWindow, session: constObservable(undefined), chat: constObservable(undefined) }),
			})],
			[ISessionsManagementService, upcastPartial<ISessionsManagementService>({ getSession: () => undefined, getSessionForChatResource: () => undefined })],
		]);
		let started = false;
		const accessor: ServicesAccessor = {
			get: <T>(id: ServiceIdentifier<T>): T => {
				if (id === IAgentHostDebugLogsExportService) {
					started = true;
					throw new Error('export started');
				}
				return services.get(id) as T;
			},
		};
		try {
			await new ExportAgentHostDebugLogsAction().run(accessor, ...args);
		} catch {
			// The export stops at the first service it gets.
		}
		return started;
	}

	test('a session that is gone does not export, while no arguments export the generic logs', async () => {
		assert.deepStrictEqual({
			stale: await startsExport(URI.parse('agent-host-copilotcli:/gone')),
			noArguments: await startsExport(),
		}, { stale: false, noArguments: true });
	});
});
