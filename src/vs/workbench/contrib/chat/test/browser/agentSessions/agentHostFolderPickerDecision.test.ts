/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { extUri, extUriIgnorePathCase, type IExtUri } from '../../../../../../base/common/resources.js';
import { FolderPickerDecisionUpdate, resolveFolderPickerDecisionUpdate } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';

suite('resolveFolderPickerDecisionUpdate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const provider = 'copilotcli';
	const sessionA = URI.parse('agent-host-copilotcli:/a');
	const sessionB = URI.parse('agent-host-copilotcli:/b');
	const frontend = URI.file('/ws/frontend');
	const backend = URI.file('/ws/backend');

	// Normalize URIs to strings so comparisons don't depend on URI internal caches.
	const norm = (update: FolderPickerDecisionUpdate) => update.kind === 'noop'
		? { kind: update.kind }
		: { kind: update.kind, visible: update.visible, tracked: update.trackedSessionResource?.toString(), select: update.selectPrimary?.toString() };

	// Thread the folder comparator explicitly (production passes IUriIdentityService.extUri)
	// so casing behavior is deterministic regardless of the test host's filesystem.
	const resolve = (
		sessionResource: URI | undefined,
		agentHostProviderId: string | undefined,
		decision: Parameters<typeof resolveFolderPickerDecisionUpdate>[2],
		previousTrackedSessionResource: URI | undefined,
		isSessionsWindow: boolean,
		sessionIsEmpty: boolean,
		currentSelectedFolder: URI | undefined,
		folderExtUri: IExtUri = extUri,
	) => resolveFolderPickerDecisionUpdate(sessionResource, agentHostProviderId, decision, previousTrackedSessionResource, isSessionsWindow, sessionIsEmpty, currentSelectedFolder, folderExtUri);

	test('hides the picker for a non-Agent-Host widget or when no session is bound', () => {
		assert.deepStrictEqual({
			noSession: norm(resolve(undefined, provider, { hidden: false }, sessionA, false, true, undefined)),
			noProvider: norm(resolve(sessionA, undefined, { hidden: false }, sessionA, false, true, undefined)),
		}, {
			noSession: { kind: 'apply', visible: false, tracked: undefined, select: undefined },
			noProvider: { kind: 'apply', visible: false, tracked: undefined, select: undefined },
		});
	});

	test('retains the current state on a transient missing decision for the same session, but resets (hidden) for a different one', () => {
		assert.deepStrictEqual({
			sameSession: norm(resolve(sessionA, provider, undefined, sessionA, false, true, undefined)),
			differentSession: norm(resolve(sessionB, provider, undefined, sessionA, false, true, undefined)),
			freshWidget: norm(resolve(sessionA, provider, undefined, undefined, false, true, undefined)),
		}, {
			sameSession: { kind: 'noop' },
			differentSession: { kind: 'apply', visible: false, tracked: sessionB.toString(), select: undefined },
			freshWidget: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: undefined },
		});
	});

	test('keeps the picker hidden and auto-selects the pinned primary only before the session starts, outside the Agents window', () => {
		const decision = { hidden: true, primary: backend.toString() };
		assert.deepStrictEqual({
			// Empty session, editor window, no prior pick → auto-select the primary.
			autoSelect: norm(resolve(sessionA, provider, decision, sessionA, false, true, undefined)),
			// Already selected → no redundant re-select.
			alreadySelected: norm(resolve(sessionA, provider, decision, sessionA, false, true, backend)),
			// Started session (has requests) → suppress auto-select, keep hidden.
			afterStart: norm(resolve(sessionA, provider, decision, sessionA, false, false, undefined)),
			// Agents window owns folder choice → never auto-select.
			sessionsWindow: norm(resolve(sessionA, provider, decision, sessionA, true, true, undefined)),
			// A prior (different) user pick is overridden, since a hidden picker leaves no way to choose.
			overridesPriorPick: norm(resolve(sessionA, provider, decision, sessionA, false, true, frontend)),
		}, {
			autoSelect: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: backend.toString() },
			alreadySelected: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: undefined },
			afterStart: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: undefined },
			sessionsWindow: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: undefined },
			overridesPriorPick: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: backend.toString() },
		});
	});

	test('reveals the picker without selecting anything when the harness does not pin a primary', () => {
		assert.deepStrictEqual({
			shownNoPrimary: norm(resolve(sessionA, provider, { hidden: false }, sessionA, false, true, undefined)),
			hiddenNoPrimary: norm(resolve(sessionA, provider, { hidden: true }, sessionA, false, true, frontend)),
		}, {
			shownNoPrimary: { kind: 'apply', visible: true, tracked: sessionA.toString(), select: undefined },
			hiddenNoPrimary: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: undefined },
		});
	});

	test('honors the provider comparator when checking the already-selected folder (resource equality, not string identity)', () => {
		const decision = { hidden: true, primary: backend.toString() };
		assert.deepStrictEqual({
			// Case-insensitive filesystem: `/ws/BACKEND` is the same folder as the
			// pinned `/ws/backend`, so no redundant re-select (nor spurious change event).
			caseInsensitive: norm(resolve(sessionA, provider, decision, sessionA, false, true, URI.file('/ws/BACKEND'), extUriIgnorePathCase)),
			// Case-sensitive filesystem (e.g. remote Linux): they are distinct folders,
			// so the pinned primary is selected.
			caseSensitive: norm(resolve(sessionA, provider, decision, sessionA, false, true, URI.file('/ws/BACKEND'), extUri)),
		}, {
			caseInsensitive: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: undefined },
			caseSensitive: { kind: 'apply', visible: false, tracked: sessionA.toString(), select: backend.toString() },
		});
	});
});
