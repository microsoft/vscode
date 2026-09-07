/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { type ProgressParams } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IProgress, IProgressNotificationOptions, IProgressService, IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { ChatAIDisabledSettingId } from '../../../common/constants.js';
import { AgentHostDownloadProgress } from '../../../browser/agentSessions/agentHost/agentHostDownloadProgress.js';

interface IRecordedProgress {
	title: string | undefined;
	readonly steps: IProgressStep[];
	dismissed: boolean;
	/** Resolves once the backing notification promise settles (i.e. is dismissed). */
	settled: Promise<void>;
}

/** Records every `withProgress` invocation, the steps reported into it, and whether it resolved. */
class RecordingProgressService {
	readonly opened: IRecordedProgress[] = [];

	withProgress(options: IProgressNotificationOptions, task: (progress: IProgress<IProgressStep>) => Promise<unknown>): Promise<unknown> {
		const record: IRecordedProgress = { title: options.title, steps: [], dismissed: false, settled: Promise.resolve() };
		this.opened.push(record);
		const result = task({ report: step => { record.steps.push(step); } });
		record.settled = result.then(() => { record.dismissed = true; }, () => { record.dismissed = true; });
		return result;
	}
}

class FakeConfigurationService {
	constructor(private readonly _aiDisabled: boolean) { }
	getValue(key: string): unknown {
		return key === ChatAIDisabledSettingId ? this._aiDisabled : undefined;
	}
}

function frame(partial: Partial<ProgressParams> & Pick<ProgressParams, 'progressToken' | 'progress'>): ProgressParams {
	return { channel: 'ahp-root://root', ...partial };
}

suite('AgentHostDownloadProgress', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(aiDisabled = false) {
		const progressService = new RecordingProgressService();
		const configurationService = new FakeConfigurationService(aiDisabled);
		const controller = store.add(new AgentHostDownloadProgress(
			progressService as unknown as IProgressService,
			configurationService as unknown as IConfigurationService,
		));
		return { controller, progressService };
	}

	test('determinate download opens one notification, reports percent, dismisses on terminal frame', async () => {
		const { controller, progressService } = create();

		controller.handleProgress(frame({ progressToken: 'claude', progress: 0, total: 1000, message: 'Downloading Claude agent' }));
		controller.handleProgress(frame({ progressToken: 'claude', progress: 500, total: 1000, message: 'Downloading Claude agent' }));
		controller.handleProgress(frame({ progressToken: 'claude', progress: 1000, total: 1000, message: 'Downloading Claude agent' }));

		// The terminal frame resolves the notification promise asynchronously.
		await progressService.opened[0].settled;

		assert.deepStrictEqual(
			progressService.opened.map(o => ({ title: o.title, steps: o.steps.map(s => s.message), dismissed: o.dismissed })),
			[{ title: 'Downloading Claude agent', steps: ['0%', '50%'], dismissed: true }],
		);
	});

	test('indeterminate download (no total) reports megabytes received', () => {
		const { controller, progressService } = create();

		controller.handleProgress(frame({ progressToken: 'codex', progress: 5 * 1024 * 1024, message: 'Downloading Codex agent' }));

		assert.deepStrictEqual(
			progressService.opened.map(o => ({ title: o.title, steps: o.steps.map(s => s.message) })),
			[{ title: 'Downloading Codex agent', steps: ['5.0 MB'] }],
		);
	});

	test('no notification when AI features are disabled', () => {
		const { controller, progressService } = create(true);

		controller.handleProgress(frame({ progressToken: 'claude', progress: 0, total: 1000, message: 'Downloading Claude agent' }));

		assert.strictEqual(progressService.opened.length, 0);
	});
});
