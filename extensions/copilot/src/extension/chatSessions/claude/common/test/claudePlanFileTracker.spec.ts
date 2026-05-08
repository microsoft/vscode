/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { NullNativeEnvService } from '../../../../../platform/env/common/nullEnvService';
import { isLinux } from '../../../../../util/vs/base/common/platform';
import { URI } from '../../../../../util/vs/base/common/uri';
import { ClaudePlanFileTracker } from '../claudePlanFileTracker';

describe('ClaudePlanFileTracker', () => {
	function createTracker(): ClaudePlanFileTracker {
		// NullNativeEnvService.userHome === file:///home/testuser
		return new ClaudePlanFileTracker(new NullNativeEnvService());
	}

	const PLAN_DIR = '/home/testuser/.claude/plans';
	const SESSION = 'session-1';

	/** Compare against the platform's `URI.file` of the same path so
	 * Windows backslash-fsPath doesn't trip the suite. */
	function expectedFsPath(path: string): string {
		return URI.file(path).fsPath;
	}

	it('records markdown files written directly into ~/.claude/plans/', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile(SESSION, `${PLAN_DIR}/plan-a.md`);
		expect(tracker.getLastPlanFile(SESSION)?.fsPath).toBe(expectedFsPath(`${PLAN_DIR}/plan-a.md`));
	});

	it('overwrites the recorded URI with each subsequent record', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile(SESSION, `${PLAN_DIR}/plan-a.md`);
		tracker.recordIfPlanFile(SESSION, `${PLAN_DIR}/plan-b.md`);
		expect(tracker.getLastPlanFile(SESSION)?.fsPath).toBe(expectedFsPath(`${PLAN_DIR}/plan-b.md`));
	});

	it('keeps per-session state isolated', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile('s1', `${PLAN_DIR}/a.md`);
		tracker.recordIfPlanFile('s2', `${PLAN_DIR}/b.md`);
		expect(tracker.getLastPlanFile('s1')?.fsPath).toBe(expectedFsPath(`${PLAN_DIR}/a.md`));
		expect(tracker.getLastPlanFile('s2')?.fsPath).toBe(expectedFsPath(`${PLAN_DIR}/b.md`));
	});

	it('clear() drops state for the given session only', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile('s1', `${PLAN_DIR}/a.md`);
		tracker.recordIfPlanFile('s2', `${PLAN_DIR}/b.md`);
		tracker.clear('s1');
		expect(tracker.getLastPlanFile('s1')).toBeUndefined();
		expect(tracker.getLastPlanFile('s2')?.fsPath).toBe(expectedFsPath(`${PLAN_DIR}/b.md`));
	});

	it('ignores non-markdown files', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile(SESSION, `${PLAN_DIR}/plan.txt`);
		expect(tracker.getLastPlanFile(SESSION)).toBeUndefined();
	});

	it('ignores files outside the plan directory', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile(SESSION, `/home/testuser/.claude/notes/plan.md`);
		tracker.recordIfPlanFile(SESSION, `/tmp/plan.md`);
		expect(tracker.getLastPlanFile(SESSION)).toBeUndefined();
	});

	it('ignores files in nested subdirectories of the plan directory', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile(SESSION, `${PLAN_DIR}/sub/plan.md`);
		expect(tracker.getLastPlanFile(SESSION)).toBeUndefined();
	});

	it('ignores empty session id and empty path', () => {
		const tracker = createTracker();
		tracker.recordIfPlanFile('', `${PLAN_DIR}/plan.md`);
		tracker.recordIfPlanFile(SESSION, '');
		expect(tracker.getLastPlanFile(SESSION)).toBeUndefined();
	});

	// On case-insensitive filesystems (Windows, default macOS), the SDK can
	// hand back the plan path with different casing than `userHome`. On
	// Linux URI casing is preserved by `extUriBiasedIgnorePathCase`, so
	// only assert this behavior on platforms that actually ignore case.
	it.runIf(!isLinux)('matches paths case-insensitively when the platform is case-insensitive', () => {
		const tracker = createTracker();
		// `.md` extension still lower-cased so the early-exit doesn't fire.
		tracker.recordIfPlanFile(SESSION, '/home/TestUser/.Claude/Plans/plan.md');
		expect(tracker.getLastPlanFile(SESSION)?.fsPath).toBe(expectedFsPath('/home/TestUser/.Claude/Plans/plan.md'));
	});
});
