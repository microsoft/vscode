/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IToolInvocation } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { createWorkTestSession } from '../../../../services/sessions/test/common/sessionWorkTestUtils.js';
import { DashboardWorkTool, dashboardWorkToolData } from '../../browser/dashboardWorkTools.js';
import { IDashboardWorkService } from '../../common/dashboardWork.js';

suite('Dashboard work tool scoping', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const dashboardResource = URI.parse('agent-host-copilotcli:/dashboard');
	const regularResource = URI.parse('agent-host-copilotcli:/regular');
	const source = createWorkTestSession(dashboardResource).session;

	function setup() {
		let discovers = 0;
		const service = new class extends mock<IDashboardWorkService>() {
			override readonly sessions = constObservable([source]);
			override getSessionForChat(resource: URI) { return resource.toString() === dashboardResource.toString() ? source : undefined; }
			override async discover() { discovers++; return { revision: 1, candidates: [], targets: [] }; }
		}();
		return { tool: new DashboardWorkTool('dashboard_discover_work', service), count: () => discovers };
	}

	test('experimental tools are hidden from ordinary global tool selection', () => {
		assert.deepStrictEqual(dashboardWorkToolData.map(tool => ({ hidden: tool.when?.serialize(), scoped: tool.requiresSessionContext })),
			dashboardWorkToolData.map(() => ({ hidden: 'false', scoped: true })));
	});

	test('a model cannot opt its regular conversation in by passing another session as an argument', async () => {
		const { tool, count } = setup();
		const invocation: IToolInvocation = {
			callId: 'call', toolId: 'dashboard_discover_work', context: { sessionResource: regularResource },
			originSessionResource: regularResource, parameters: { sessionResource: dashboardResource.toString() },
		};
		await assert.rejects(() => tool.invoke(invocation, async () => 0, { report() { } }, CancellationToken.None), /only available to its dashboard/);
		assert.strictEqual(count(), 0);
	});

	test('trusted caller identity supports discovery without a mounted chat renderer', async () => {
		const { tool, count } = setup();
		const result = await tool.invoke({
			callId: 'call', toolId: 'dashboard_discover_work', context: undefined, originSessionResource: dashboardResource, parameters: {},
		}, async () => 0, { report() { } }, CancellationToken.None);
		assert.deepStrictEqual({ count: count(), result: result.content }, {
			count: 1, result: [{ kind: 'text', value: '{"revision":1,"candidates":[],"targets":[]}' }],
		});
	});

	test('side-effect descriptions state target, context-transfer and repeat-call boundaries', () => {
		const start = dashboardWorkToolData.find(tool => tool.id === 'dashboard_start_work')!;
		assert.deepStrictEqual({
			approval: start.canRequestPreApproval,
			discovery: start.modelDescription.includes('target returned by dashboard_discover_work'),
			transfer: start.modelDescription.includes('not parent history, local attachments, credentials, or permission grants'),
			retry: start.modelDescription.includes('never replace an uncertain operation with a new ID'),
		}, { approval: true, discovery: true, transfer: true, retry: true });
	});
});
