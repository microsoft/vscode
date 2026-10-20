/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { after, afterEach, before, beforeEach, describe, test } from 'mocha';
import {
	CopilotShimFixtureRole,
	CopilotShimIdentity,
	CopilotShimPayloadKind,
	getCopilotShimFixture,
	getPreferredCopilotShimLifecycleFixture,
	ICopilotShimFixture,
} from './copilotShimFixtures.js';
import { CopilotShimPackageHarness } from './copilotShimHarness.js';
import { getCopilotShimTestRuntime } from './copilotShimRuntime.js';

const runtime = getCopilotShimTestRuntime();
const formatLabel = runtime.format.toUpperCase();
const brandedIdentities = ['code', 'code-insiders'] as const;

describe(`Copilot shim ${formatLabel} package lifecycle`, () => {
	let harness: CopilotShimPackageHarness;
	let harnessInitialized = false;
	let scenarioStarted = false;

	before(() => {
		harness = CopilotShimPackageHarness.create(runtime.fixtures, runtime.format);
		harnessInitialized = true;
		harness.inspectFixtureArtifacts();
	});

	beforeEach(function () {
		harness.startScenario(this.currentTest?.title ?? 'unnamed-scenario');
		scenarioStarted = true;
	});

	afterEach(function () {
		if (!scenarioStarted) {
			return;
		}
		try {
			harness.finishScenario(this.currentTest?.state === 'passed');
		} finally {
			scenarioStarted = false;
		}
	});

	after(() => {
		if (harnessInitialized) {
			harness.cleanupArtifactInspection();
		}
	});

	for (const identity of brandedIdentities) {
		test(`${formatLabel} K1 creates an unowned shared link for ${identity}`, () => {
			const initial = fixture(identity, 'initial', 'complete');
			install(initial);
			harness.assertSharedLink(identity);
			harness.assertInstalledFixtureOwnership(initial);
			harness.assertLauncherBehavior(initial);

			const upgradeFixture = fixture(identity, 'upgrade', 'complete');
			upgrade(upgradeFixture);
			harness.assertSharedLink(identity);
			harness.assertInstalledFixtureOwnership(upgradeFixture);
			harness.assertLauncherBehavior(upgradeFixture);
		});
	}

	for (const first of brandedIdentities) {
		test(`${formatLabel} K2 lets ${otherEdition(first)} take over ${first}`, () => {
			const second = otherEdition(first);
			install(fixture(first, 'initial'));
			install(fixture(second, 'initial'));
			harness.assertSharedLink(second);
		});
	}

	for (const upgraded of brandedIdentities) {
		test(`${formatLabel} K3 lets upgraded ${upgraded} take over from ${otherEdition(upgraded)}`, () => {
			const other = otherEdition(upgraded);
			install(fixture(upgraded, 'initial'));
			install(fixture(other, 'initial'));
			harness.assertSharedLink(other);
			upgrade(fixture(upgraded, 'upgrade'));
			harness.assertSharedLink(upgraded);
			harness.assertInstalledPackageVersion(fixture(upgraded, 'upgrade'));
		});
	}

	for (const upgradeOrder of [
		['code', 'code-insiders'],
		['code-insiders', 'code'],
	] as const) {
		test(`${formatLabel} K3 sequential upgrades take over in ${upgradeOrder.join(' then ')} order`, () => {
			const [first, second] = upgradeOrder;
			install(fixture(first, 'initial'));
			install(fixture(second, 'initial'));
			harness.assertSharedLink(second);
			upgrade(fixture(first, 'upgrade'));
			harness.assertSharedLink(first);
			upgrade(fixture(second, 'upgrade'));
			harness.assertSharedLink(second);
		});
	}

	for (const inputOrder of [
		['code', 'code-insiders'],
		['code-insiders', 'code'],
	] as const) {
		test(`${formatLabel} K3 batch install records actual hook order for ${inputOrder.join(' then ')}`, () => {
			const result = harness.packageBatch(inputOrder.map(identity => fixture(identity, 'initial')), 'install');
			for (const identity of inputOrder) {
				harness.assertPackageOperation(result, fixture(identity, 'initial'), true);
			}
			harness.assertFinalLinkMatchesLastSuccessfulHook();
		});

		test(`${formatLabel} K3 batch upgrade records actual hook order for ${inputOrder.join(' then ')}`, () => {
			for (const identity of brandedIdentities) {
				install(fixture(identity, 'initial'));
			}
			harness.clearHookObservation();
			const result = harness.packageBatch(inputOrder.map(identity => fixture(identity, 'upgrade')), 'upgrade');
			for (const identity of inputOrder) {
				harness.assertPackageOperation(result, fixture(identity, 'upgrade'), true);
				harness.assertInstalledPackageVersion(fixture(identity, 'upgrade'));
			}
			harness.assertFinalLinkMatchesLastSuccessfulHook();
		});
	}

	for (const owner of brandedIdentities) {
		test(`${formatLabel} K4 preserves ${owner} when ${otherEdition(owner)} is removed`, () => {
			const nonOwner = otherEdition(owner);
			install(fixture(nonOwner, 'initial'));
			install(fixture(owner, 'initial'));
			remove(fixture(nonOwner, 'initial'));
			harness.assertSharedLink(owner);
		});
	}

	for (const owner of brandedIdentities) {
		test(`${formatLabel} K5 falls back from ${owner} to a usable ${otherEdition(owner)} shim`, () => {
			const fallback = otherEdition(owner);
			install(fixture(fallback, 'initial'));
			install(fixture(owner, 'initial'));
			remove(fixture(owner, 'initial'));
			harness.assertSharedLink(fallback);
		});
	}

	for (const unavailableKind of ['missing', 'non-executable'] as const) {
		for (const owner of brandedIdentities) {
			test(`${formatLabel} K5 removes ${owner} when ${otherEdition(owner)} is ${unavailableKind}`, () => {
				const fallback = otherEdition(owner);
				install(fixture(fallback, 'initial'));
				install(fixture(owner, 'initial'));
				harness.makeShimUnavailable(fallback, unavailableKind);
				remove(fixture(owner, 'initial'));
				harness.assertNoSharedCommand();
			});
		}
	}

	for (const owner of brandedIdentities) {
		test(`${formatLabel} K5 rejects an older ${otherEdition(owner)} package with no shim as fallback`, () => {
			const oldEdition = otherEdition(owner);
			install(fixture(owner, 'initial'));
			install(fixture(oldEdition, 'legacy-no-shim'));
			remove(fixture(owner, 'initial'));
			harness.assertNoSharedCommand();
		});
	}

	for (const installationOrder of [
		['code', 'code-insiders'],
		['code-insiders', 'code'],
	] as const) {
		test(`${formatLabel} K6 removes both editions cleanly after owner-first removal (${installationOrder.join(' then ')})`, () => {
			const [fallback, owner] = installationOrder;
			install(fixture(fallback, 'initial'));
			install(fixture(owner, 'initial'));
			remove(fixture(owner, 'initial'));
			harness.assertSharedLink(fallback);
			remove(fixture(fallback, 'initial'));
			harness.assertNoSharedCommand();
		});
	}

	for (const owner of brandedIdentities) {
		test(`${formatLabel} K6 removes both editions cleanly after non-owner-first removal (${otherEdition(owner)} then ${owner})`, () => {
			const nonOwner = otherEdition(owner);
			install(fixture(nonOwner, 'initial'));
			install(fixture(owner, 'initial'));
			remove(fixture(nonOwner, 'initial'));
			harness.assertSharedLink(owner);
			remove(fixture(owner, 'initial'));
			harness.assertNoSharedCommand();
		});
	}

	for (const targetOwner of brandedIdentities) {
		test(`${formatLabel} K7 repairs a dangling ${targetOwner} target with ${otherEdition(targetOwner)}`, () => {
			const installingEdition = otherEdition(targetOwner);
			harness.seedRecognizedDanglingLink(targetOwner);
			install(fixture(installingEdition, 'initial'));
			harness.assertSharedLink(installingEdition);
		});
	}

	for (const foreignEntry of [
		{ name: 'regular executable', seed: () => harness.seedForeignRegularCommand() },
		{ name: 'valid absolute link', seed: () => harness.seedForeignAbsoluteLink(false) },
		{ name: 'dangling absolute link', seed: () => harness.seedForeignAbsoluteLink(true) },
	]) {
		test(`${formatLabel} K8 preserves a foreign ${foreignEntry.name}`, () => {
			const snapshot = foreignEntry.seed();
			install(fixture('code', 'initial'));
			harness.assertEntryUnchanged(snapshot);
			install(fixture('code-insiders', 'initial'));
			harness.assertEntryUnchanged(snapshot);
			upgrade(fixture('code', 'upgrade'));
			harness.assertEntryUnchanged(snapshot);
			upgrade(fixture('code-insiders', 'upgrade'));
			harness.assertEntryUnchanged(snapshot);
			remove(fixture('code', 'upgrade'));
			harness.assertEntryUnchanged(snapshot);
			remove(fixture('code-insiders', 'upgrade'));
			harness.assertEntryUnchanged(snapshot);
		});
	}

	test(`${formatLabel} K8 preserves relative and indirect healthy links to a recognized shim`, () => {
		install(fixture('code', 'initial'));
		const relative = harness.seedRelativeRecognizedLink('code');
		install(fixture('code-insiders', 'initial'));
		harness.assertEntryUnchanged(relative);
		upgrade(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(relative);
		upgrade(fixture('code-insiders', 'upgrade'));
		harness.assertEntryUnchanged(relative);
		remove(fixture('code-insiders', 'upgrade'));
		harness.assertEntryUnchanged(relative);
		remove(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(relative);

		harness.clearTestOwnedSharedCommand();
		install(fixture('code', 'initial'));
		const indirect = harness.seedIndirectRecognizedLink('code');
		install(fixture('code-insiders', 'initial'));
		harness.assertEntryUnchanged(indirect);
		upgrade(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(indirect);
		upgrade(fixture('code-insiders', 'upgrade'));
		harness.assertEntryUnchanged(indirect);
		remove(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(indirect);
		remove(fixture('code-insiders', 'upgrade'));
		harness.assertEntryUnchanged(indirect);
	});

	test(`${formatLabel} K8 preserves a foreign command owned by another package`, () => {
		const foreign = fixture('foreign-copilot-owner', 'foreign-owner');
		install(foreign);
		const snapshot = harness.captureSharedCommandEntry();
		harness.assertFileOwnedByPackage('/usr/bin/copilot', foreign.packageName);
		install(fixture('code', 'initial'));
		harness.assertEntryUnchanged(snapshot);
		harness.assertFileOwnedByPackage('/usr/bin/copilot', foreign.packageName);
		install(fixture('code-insiders', 'initial'));
		harness.assertEntryUnchanged(snapshot);
		upgrade(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(snapshot);
		harness.assertFileOwnedByPackage('/usr/bin/copilot', foreign.packageName);
		upgrade(fixture('code-insiders', 'upgrade'));
		harness.assertEntryUnchanged(snapshot);
		harness.assertFileOwnedByPackage('/usr/bin/copilot', foreign.packageName);
		remove(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(snapshot);
		remove(fixture('code-insiders', 'upgrade'));
		harness.assertEntryUnchanged(snapshot);
	});

	test(`${formatLabel} K8 preserves an administrator replacement after installation`, () => {
		install(fixture('code', 'initial'));
		const snapshot = harness.seedForeignRegularCommand();
		upgrade(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(snapshot);
		remove(fixture('code', 'upgrade'));
		harness.assertEntryUnchanged(snapshot);
	});

	test(`${formatLabel} K9 keeps repeated lifecycle calls safe and old-version cleanup from changing the selection`, () => {
		install(fixture('code-insiders', 'initial'));
		install(fixture('code', 'initial'));
		upgrade(fixture('code-insiders', 'upgrade'));
		harness.assertSharedLink('code-insiders');

		const reconfiguration = harness.reconfigure(fixture('code-insiders', 'upgrade'));
		harness.assertPackageOperation(reconfiguration, fixture('code-insiders', 'upgrade'), true);
		harness.assertSharedLink('code-insiders');

		remove(fixture('code', 'initial'));
		harness.assertSharedLink('code-insiders');
		remove(fixture('code-insiders', 'upgrade'));
		harness.assertNoSharedCommand();

		if (runtime.format === 'deb') {
			const purge = harness.remove(fixture('code-insiders', 'upgrade'), true);
			harness.assertPackageOperation(purge, fixture('code-insiders', 'upgrade'), false);
			const repeatPurge = harness.remove(fixture('code-insiders', 'upgrade'), true);
			harness.assertPackageOperation(repeatPurge, fixture('code-insiders', 'upgrade'), false);
		} else {
			const repeatErase = harness.remove(fixture('code-insiders', 'upgrade'));
			assert.notStrictEqual(repeatErase.status, 0, 'RPM must report the already-erased package rather than rerunning a lifecycle script.');
			harness.assertNoSharedCommand();
		}
	});

	test(`${formatLabel} OSS K9 never creates or changes the shared command`, () => {
		const foreign = harness.seedForeignRegularCommand();
		install(fixture('code-oss', 'oss-initial'));
		harness.assertEntryUnchanged(foreign);
		upgrade(fixture('code-oss', 'oss-upgrade'));
		harness.assertEntryUnchanged(foreign);
		remove(fixture('code-oss', 'oss-upgrade'));
		harness.assertEntryUnchanged(foreign);
	});

	test(`${formatLabel} OSS K9 leaves an absent shared command absent across install, upgrade, and removal`, () => {
		install(fixture('code-oss', 'oss-initial'));
		harness.assertNoSharedCommand();
		upgrade(fixture('code-oss', 'oss-upgrade'));
		harness.assertNoSharedCommand();
		remove(fixture('code-oss', 'oss-upgrade'));
		harness.assertNoSharedCommand();
	});

	test(`${formatLabel} OSS K9 keeps the shared helper a no-op for an unrecognized application`, () => {
		harness.assertUnrecognizedApplicationNoOp('code-exploration');
	});

	test(`${formatLabel} warns but configures when shared-link creation fails, then repairs on reinstall`, () => {
		const initial = fixture('code', 'initial');
		harness.injectMutationFailure('ln');
		const failedCreation = harness.package(initial);
		harness.assertPackageOperation(failedCreation, initial, true);
		harness.assertWarning(failedCreation, 'shared-link creation failure');
		harness.assertNoSharedCommand();

		harness.clearMutationFailure();
		const repair = harness.package(initial, 'reinstall');
		harness.assertPackageOperation(repair, initial, true);
		harness.assertSharedLink('code');
	});

	test(`${formatLabel} warns but configures when shared-link replacement fails, then repairs on reinstall`, () => {
		const stable = fixture('code', 'initial');
		const insiders = fixture('code-insiders', 'initial');
		install(stable);

		harness.injectMutationFailure('mv');
		const failedReplacement = harness.package(insiders);
		harness.assertPackageOperation(failedReplacement, insiders, true);
		harness.assertWarning(failedReplacement, 'shared-link replacement failure');
		harness.assertSharedLink('code');

		harness.clearMutationFailure();
		const repair = harness.package(insiders, 'reinstall');
		harness.assertPackageOperation(repair, insiders, true);
		harness.assertSharedLink('code-insiders');
	});

	test(`${formatLabel} warns but removes the package when final shared-link removal fails, then repairs later`, () => {
		const stable = fixture('code', 'initial');
		install(stable);

		harness.injectMutationFailure('rm');
		const failedRemoval = harness.remove(stable);
		harness.assertPackageOperation(failedRemoval, stable, false);
		harness.assertWarning(failedRemoval, 'shared-link removal failure');
		harness.assertSharedLinkText('code');

		harness.clearMutationFailure();
		install(fixture('code-insiders', 'initial'));
		harness.assertSharedLink('code-insiders');
	});

	function fixture(identity: CopilotShimIdentity, role: CopilotShimFixtureRole, payloadKind?: CopilotShimPayloadKind): ICopilotShimFixture {
		if (payloadKind) {
			return getCopilotShimFixture(runtime.fixtures, runtime.format, identity, role, payloadKind);
		}
		return getPreferredCopilotShimLifecycleFixture(runtime.fixtures, runtime.format, identity, role);
	}

	function install(packageFixture: ICopilotShimFixture): void {
		const result = harness.package(packageFixture);
		harness.assertPackageOperation(result, packageFixture, true);
		harness.assertInstalledPackageVersion(packageFixture);
	}

	function upgrade(packageFixture: ICopilotShimFixture): void {
		const result = harness.package(packageFixture, 'upgrade');
		harness.assertPackageOperation(result, packageFixture, true);
		harness.assertInstalledPackageVersion(packageFixture);
	}

	function remove(packageFixture: ICopilotShimFixture): void {
		const result = harness.remove(packageFixture);
		harness.assertPackageOperation(result, packageFixture, false);
	}
});

function otherEdition(identity: 'code' | 'code-insiders'): 'code' | 'code-insiders' {
	return identity === 'code' ? 'code-insiders' : 'code';
}
