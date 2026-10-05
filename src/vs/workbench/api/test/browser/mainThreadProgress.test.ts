/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { MainThreadProgress } from '../../browser/mainThreadProgress.js';
import { ExtHostProgressShape, IProgressOptionsDto, IProgressStepDto } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { isLegacyExtensionLinkParsing } from '../../../../platform/notification/common/notificationLegacy.js';

suite('MainThreadProgress', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps extension progress messages serializable and the capability local to the bridge', () => {
		const contract: {
			titleIsString: IProgressOptionsDto['title'] extends string | undefined ? true : false;
			messageIsString: IProgressStepDto['message'] extends string | undefined ? true : false;
			exposesCapability: 'legacyExtensionLinkParsing' extends keyof IProgressOptionsDto ? true : false;
		} = { titleIsString: true, messageIsString: true, exposesCapability: false };
		assert.deepStrictEqual(contract, { titleIsString: true, messageIsString: true, exposesCapability: false });
	});

	for (const location of [ProgressLocation.Notification, ProgressLocation.Window]) {
		test(`preserves legacy extension links at progress location ${location}`, async () => {
			const options: IProgressOptions[] = [];
			const reports: IProgressStep[] = [];
			const service = store.add(new MainThreadProgress(
				SingleProxyRPCProtocol(new class extends mock<ExtHostProgressShape>() { }),
				new class extends mock<IProgressService>() {
					override withProgress<R>(value: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
						options.push(value);
						return task({ report: step => reports.push(step) });
					}
				},
				new class extends mock<ICommandService>() { },
			));
			const title = '[Show Logs](command:python.viewOutput)';
			const message = '[Check details](command:java.show.server.task.status)';

			const promise = service.$startProgress(1, { location, title }, 'test.extension');
			service.$progressReport(1, { message });
			service.$progressEnd(1);
			await promise;

			assert.deepStrictEqual({
				options: options.map(value => ({ location: value.location, title: value.title, legacy: isLegacyExtensionLinkParsing(value.legacyExtensionLinkParsing) })),
				reports,
			}, {
				options: [{ location, title, legacy: true }],
				reports: [{ message }],
			});
		});
	}
});
