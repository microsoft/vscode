/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	CopilotShimIdentity,
	CopilotShimPackageFormat,
	CopilotShimPayloadKind,
	copilotShimInstallHookInstrumentation,
	copilotShimInstallHookLogEnvironmentVariable,
	debPackageMetadataFormat,
	getCopilotShimFixturesForFormat,
	getCopilotShimTarget,
	ICopilotShimFixture,
	ICopilotShimFixtureManifest,
	isCurrentCopilotShimFixture,
	sha256File,
} from './copilotShimFixtures.js';
import {
	assertCopilotLinkHelperSource,
	assertCopilotLinkLifecycleCall,
	assertEmbeddedCopilotLinkHelper,
} from './copilotShimRendering.js';

const runnerMarkerEnvironmentVariable = 'VSCODE_COPILOT_SHIM_RUNNER_MARKER';
const runnerMarkerDirectory = '/run/vscode-copilot-shim-package-lifecycle';
const runnerMarkerPurpose = 'vscode-copilot-shim-package-lifecycle';
const sharedCommandPath = '/usr/bin/copilot';
const knownPackageNames = ['code', 'code-insiders', 'code-oss'];

type CopilotShimMutationCommand = 'ln' | 'mv' | 'rm';
type CopilotShimPackageOperation = 'install' | 'upgrade' | 'reinstall';

interface ICommandResult {
	command: string;
	args: readonly string[];
	status: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
	error: string | undefined;
}

interface IRunnerMarker {
	schemaVersion: 1;
	purpose: typeof runnerMarkerPurpose;
	runnerId: string;
	mountNamespace: string;
	workRoot: string;
	evidenceRoot: string;
	usrProbe: string;
	etcProbe: string;
}

interface IEntrySnapshot {
	kind: 'absent' | 'file' | 'symlink';
	mode?: number;
	hash?: string;
	target?: string;
}

interface IFileRestore {
	path: string;
	mode: number;
	backupPath: string;
}

interface IScenario {
	name: string;
	root: string;
	home: string;
	wrapperDirectory: string;
	commandLogPath: string;
	downloadLogPath: string;
	hookLogPath: string;
	installHookLogPath: string;
	independentCliPath: string;
	independentDataPath: string;
	independentCliHash: string;
	independentDataHash: string;
	installedPackages: string[];
	fileRestores: IFileRestore[];
	mutationFailure: CopilotShimMutationCommand | undefined;
	commandEntryOwned: boolean;
	acceptedResidualSharedCommand: IEntrySnapshot | undefined;
}

/**
 * Exercises package-manager lifecycle scripts only after a provisioned disposable Linux runner
 * proves that `/usr` and `/etc` belong to the test environment.
 */
export class CopilotShimPackageHarness {
	private readonly packageManagerPath: string;
	private readonly mutationCommandPaths: Readonly<Record<CopilotShimMutationCommand, string>>;
	private readonly marker: IRunnerMarker;
	private readonly helperSource: string;
	private scenario: IScenario | undefined;
	private sequence = 0;
	private retainedFailure = false;

	public static create(manifest: ICopilotShimFixtureManifest, format: CopilotShimPackageFormat): CopilotShimPackageHarness {
		return new CopilotShimPackageHarness(manifest, format);
	}

	private constructor(
		public readonly manifest: ICopilotShimFixtureManifest,
		public readonly format: CopilotShimPackageFormat,
	) {
		this.marker = this.readAndValidateRunnerMarker();
		this.packageManagerPath = this.findRequiredExecutable(format === 'deb' ? 'dpkg' : 'rpm');
		this.mutationCommandPaths = {
			ln: this.findRequiredExecutable('ln'),
			mv: this.findRequiredExecutable('mv'),
			rm: this.findRequiredExecutable('rm'),
		};
		this.helperSource = fs.readFileSync(manifest.helper.sourcePath, 'utf8');

		this.preflight();
	}

	/**
	 * Starts an isolated test scenario. A prior failed scenario deliberately blocks further mutation.
	 */
	public startScenario(name: string): void {
		if (this.retainedFailure) {
			throw new Error('A prior Copilot shim scenario failed and retained its package state and evidence. Start a fresh disposable runner before attempting another scenario.');
		}
		if (this.scenario) {
			throw new Error(`Scenario ${this.scenario.name} is already active.`);
		}

		this.assertCleanEnvironment();
		const scenarioName = `${String(++this.sequence).padStart(2, '0')}-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
		const root = path.join(this.marker.workRoot, 'scenarios', scenarioName);
		const home = path.join(root, 'home');
		const wrapperDirectory = path.join(root, 'wrappers');
		const independentCliPath = path.join(root, 'independent-cli', 'copilot');
		const independentDataPath = path.join(home, '.local', 'share', 'github-copilot', 'sentinel');

		fs.mkdirSync(home, { recursive: true, mode: 0o700 });
		fs.mkdirSync(wrapperDirectory, { recursive: true, mode: 0o700 });
		fs.mkdirSync(path.dirname(independentCliPath), { recursive: true, mode: 0o700 });
		fs.mkdirSync(path.dirname(independentDataPath), { recursive: true, mode: 0o700 });
		fs.writeFileSync(independentCliPath, '#!/bin/sh\nprintf "%s\\n" independent-copilot-cli\n', { mode: 0o700 });
		fs.writeFileSync(independentDataPath, `fixture-set=${this.manifest.fixtureSetId}\nscenario=${scenarioName}\n`, { mode: 0o600 });

		this.scenario = {
			name: scenarioName,
			root,
			home,
			wrapperDirectory,
			commandLogPath: path.join(root, 'commands.log'),
			downloadLogPath: path.join(root, 'unexpected-downloaders.log'),
			hookLogPath: path.join(root, 'hook-order.log'),
			installHookLogPath: path.join(root, 'install-hook-order.log'),
			independentCliPath,
			independentDataPath,
			independentCliHash: sha256File(independentCliPath),
			independentDataHash: sha256File(independentDataPath),
			installedPackages: [],
			fileRestores: [],
			mutationFailure: undefined,
			commandEntryOwned: false,
			acceptedResidualSharedCommand: undefined,
		};

		this.createDownloadWrappers();
		for (const command of ['ln', 'mv', 'rm'] as const) {
			this.createMutationWrapper(command);
		}
		this.writeScenarioEvidence(`Started scenario ${scenarioName}.\n`);
	}

	/**
	 * Cleans successful scenarios. Failed scenarios preserve package state and diagnostics for investigation.
	 */
	public finishScenario(succeeded: boolean): void {
		const scenario = this.requireScenario();
		if (!succeeded) {
			this.retainScenarioEvidence(`Scenario ${scenario.name} failed; package state and evidence were retained.`);
			this.scenario = undefined;
			this.retainedFailure = true;
			return;
		}

		try {
			this.assertIndependentCopilotState();
			this.assertNoInstallerDownload();
			this.restoreFixtureFiles();
			this.cleanupScenarioPackages();
			this.removeTestOwnedSharedCommand();
			this.assertCleanEnvironment();
			fs.rmSync(scenario.root, { recursive: true, force: true });
		} catch (error) {
			this.retainScenarioEvidence(`Scenario ${scenario.name} failed during post-test verification or cleanup: ${errorMessage(error)}`);
			this.retainedFailure = true;
			throw error;
		} finally {
			this.scenario = undefined;
		}
	}

	private assertInstallHookInstrumentation(fixture: ICopilotShimFixture, installScript: string, removeScript: string, scriptName: string): void {
		const phase = this.format === 'deb' ? 'deb-postinst-configure' : 'rpm-post';
		const recorder = `'${phase}' '${fixture.identity}' >> "$${copilotShimInstallHookLogEnvironmentVariable}"`;
		assert.ok(fixture.provenance.fixtureAdjustments.includes(copilotShimInstallHookInstrumentation), `${fixture.id} must record its test-only installation-hook instrumentation in provenance.`);
		assert.ok(installScript.includes(copilotShimInstallHookLogEnvironmentVariable), `${scriptName} does not record its test-only installation hook.`);
		assert.strictEqual(installScript.split(recorder).length - 1, 1, `${scriptName} must contain exactly one installation-hook recorder.`);
		if (fixture.format === 'deb') {
			assert.ok(!removeScript.includes(copilotShimInstallHookLogEnvironmentVariable), `${scriptName} must not instrument a DEB removal hook.`);
		}
	}

	/**
	 * Installs, upgrades, or reinstalls a fixture through the real selected package manager.
	 */
	public package(fixture: ICopilotShimFixture, operation: CopilotShimPackageOperation = 'install'): ICommandResult {
		this.assertFixtureFormat(fixture);
		const args = this.packageArguments(operation, [fixture.packagePath]);
		const result = this.run(this.packageManagerPath, args);
		if (result.status === 0 && !this.requireScenario().installedPackages.includes(fixture.packageName)) {
			this.requireScenario().installedPackages.push(fixture.packageName);
		}
		if (result.status === 0) {
			this.clearAcceptedResidualIfRepaired();
		}
		return result;
	}

	/**
	 * Runs one actual package transaction over several fixtures and records hook mutations in order.
	 */
	public packageBatch(fixtures: readonly ICopilotShimFixture[], operation: 'install' | 'upgrade'): ICommandResult {
		if (fixtures.length === 0) {
			throw new Error('A package batch must contain at least one fixture.');
		}
		for (const fixture of fixtures) {
			this.assertFixtureFormat(fixture);
		}

		const result = this.run(this.packageManagerPath, this.packageArguments(operation, fixtures.map(fixture => fixture.packagePath)));
		if (result.status === 0) {
			const scenario = this.requireScenario();
			for (const fixture of fixtures) {
				if (!scenario.installedPackages.includes(fixture.packageName)) {
					scenario.installedPackages.push(fixture.packageName);
				}
			}
			this.clearAcceptedResidualIfRepaired();
		}
		return result;
	}

	/**
	 * Removes or purges one fixture through its real package manager.
	 */
	public remove(fixture: ICopilotShimFixture, purge = false): ICommandResult {
		this.assertFixtureFormat(fixture);
		let args: string[];
		if (this.format === 'deb') {
			args = [purge ? '--purge' : '--remove', fixture.packageName];
		} else {
			if (purge) {
				throw new Error('RPM has no separate purge lifecycle. Use the normal final erase operation.');
			}
			args = ['-e', fixture.packageName];
		}

		const result = this.run(this.packageManagerPath, args);
		if (result.status === 0) {
			const scenario = this.requireScenario();
			scenario.installedPackages = scenario.installedPackages.filter(packageName => packageName !== fixture.packageName);
			if (scenario.mutationFailure === 'rm') {
				scenario.acceptedResidualSharedCommand = this.getAcceptedFailedRemovalResidual(fixture);
			}
		}
		return result;
	}

	/**
	 * Re-runs an installed package lifecycle without using private sanity helpers.
	 */
	public reconfigure(fixture: ICopilotShimFixture): ICommandResult {
		if (this.format === 'deb') {
			return this.run(this.findRequiredExecutable('dpkg-reconfigure'), ['--frontend=noninteractive', fixture.packageName]);
		}
		return this.package(fixture, 'reinstall');
	}

	/**
	 * Makes a specific helper mutation fail through a narrowly scoped test-local PATH wrapper.
	 */
	public injectMutationFailure(command: CopilotShimMutationCommand): void {
		const scenario = this.requireScenario();
		scenario.mutationFailure = command;
		this.createMutationWrapper(command);
	}

	/**
	 * Stops injecting helper mutation failures while retaining hook-order observation.
	 */
	public clearMutationFailure(): void {
		this.requireScenario().mutationFailure = undefined;
	}

	/**
	 * Verifies an operation succeeded and the package database reached the expected state.
	 */
	public assertPackageOperation(result: ICommandResult, fixture: ICopilotShimFixture, expectedInstalled: boolean): void {
		this.assertCommandSucceeded(result, `${fixture.packageName} package transaction`);
		assert.strictEqual(this.isPackageInstalled(fixture.packageName), expectedInstalled, `Unexpected installed state for ${fixture.packageName}.`);
	}

	/**
	 * Verifies the helper emitted its clear warning and did not turn the package operation into a failure.
	 */
	public assertWarning(result: ICommandResult, description: string): void {
		const output = `${result.stdout}\n${result.stderr}`;
		assert.match(output, /warning:\s*vscode_copilot_link:/iu, `${description} did not emit a vscode_copilot_link warning.\n${this.formatCommandResult(result)}`);
	}

	/**
	 * Verifies a literal shared command link and the target's current usability.
	 */
	public assertSharedLink(identity: 'code' | 'code-insiders'): void {
		this.assertSharedLinkText(identity);
		this.assertExecutableFile(getCopilotShimTarget(identity), `${identity} Copilot shim`);
		this.assertSharedCommandHasNoPackageOwner();
	}

	/**
	 * Verifies literal recognized link text without requiring a target that may intentionally be dangling.
	 */
	public assertSharedLinkText(identity: 'code' | 'code-insiders'): void {
		const target = getCopilotShimTarget(identity);
		const stat = fs.lstatSync(sharedCommandPath);
		assert.ok(stat.isSymbolicLink(), `${sharedCommandPath} must be a symbolic link.`);
		assert.strictEqual(fs.readlinkSync(sharedCommandPath), target, `${sharedCommandPath} must use its literal expected target.`);
	}

	/**
	 * Verifies that no shared command entry remains.
	 */
	public assertNoSharedCommand(): void {
		assert.strictEqual(this.lstat(sharedCommandPath), undefined, `${sharedCommandPath} must be absent.`);
	}

	/**
	 * Verifies that a command entry stayed byte-for-byte or link-text unchanged.
	 */
	public assertEntryUnchanged(snapshot: IEntrySnapshot): void {
		assert.deepStrictEqual(this.snapshotEntry(sharedCommandPath), snapshot, `${sharedCommandPath} changed despite being foreign.`);
	}

	/**
	 * Seeds a regular foreign command that package lifecycle logic must preserve.
	 */
	public seedForeignRegularCommand(): IEntrySnapshot {
		this.replaceSharedCommandWithFile('#!/bin/sh\nprintf "%s\\n" foreign-copilot-command\n');
		return this.snapshotEntry(sharedCommandPath);
	}

	/**
	 * Seeds a foreign valid or dangling absolute symbolic link.
	 */
	public seedForeignAbsoluteLink(dangling: boolean): IEntrySnapshot {
		const scenario = this.requireScenario();
		const target = path.join(scenario.root, 'foreign-command-target');
		if (!dangling) {
			fs.writeFileSync(target, '#!/bin/sh\nprintf "%s\\n" foreign-link-target\n', { mode: 0o700 });
		}
		this.replaceSharedCommandWithLink(target);
		return this.snapshotEntry(sharedCommandPath);
	}

	/**
	 * Replaces the selected command with a relative link to a healthy recognized shim.
	 */
	public seedRelativeRecognizedLink(identity: 'code' | 'code-insiders'): IEntrySnapshot {
		const target = identity === 'code'
			? '../share/code/bin/copilot-shim/copilot'
			: '../share/code-insiders/bin/copilot-shim/copilot';
		this.replaceSharedCommandWithLink(target);
		return this.snapshotEntry(sharedCommandPath);
	}

	/**
	 * Replaces the selected command with an indirect, healthy foreign link.
	 */
	public seedIndirectRecognizedLink(identity: 'code' | 'code-insiders'): IEntrySnapshot {
		const scenario = this.requireScenario();
		const indirectTarget = path.join(scenario.root, 'indirect-recognized-link');
		fs.symlinkSync(getCopilotShimTarget(identity), indirectTarget);
		this.replaceSharedCommandWithLink(indirectTarget);
		return this.snapshotEntry(sharedCommandPath);
	}

	/**
	 * Seeds a literal recognized dangling link that a later install must repair.
	 */
	public seedRecognizedDanglingLink(identity: 'code' | 'code-insiders'): void {
		this.replaceSharedCommandWithLink(getCopilotShimTarget(identity));
	}

	/**
	 * Makes the other edition's installed shim unavailable without touching an unrelated path.
	 */
	public makeShimUnavailable(identity: 'code' | 'code-insiders', kind: 'missing' | 'non-executable'): void {
		const target = getCopilotShimTarget(identity);
		const stat = fs.statSync(target);
		const scenario = this.requireScenario();
		const backupPath = path.join(scenario.root, `restore-${identity}-copilot`);
		fs.copyFileSync(target, backupPath);
		scenario.fileRestores.push({ path: target, mode: stat.mode, backupPath });

		if (kind === 'missing') {
			fs.rmSync(target);
		} else {
			fs.chmodSync(target, stat.mode & ~0o111);
		}
	}

	/**
	 * Verifies package ownership for a nested shim, the selected launcher, and the intentionally unowned shared path.
	 */
	public assertInstalledFixtureOwnership(fixture: ICopilotShimFixture): void {
		if (!fixture.payload.shimPath || !fixture.payload.launcherPath) {
			throw new Error(`Fixture ${fixture.id} does not declare its nested shim and launcher paths.`);
		}
		this.assertExecutableFile(fixture.payload.shimPath, `${fixture.id} nested shim`);
		this.assertExecutableFile(fixture.payload.launcherPath, `${fixture.id} launcher`);
		this.assertFileOwnedByPackage(fixture.payload.shimPath, fixture.packageName);
		this.assertFileOwnedByPackage(fixture.payload.launcherPath, fixture.packageName);
		this.assertSharedCommandHasNoPackageOwner();
	}

	/**
	 * Runs complete package launchers and explicitly records that minimal fixtures cannot prove launcher behavior.
	 */
	public assertLauncherBehavior(fixture: ICopilotShimFixture): void {
		if (!fixture.payload.launcherPath) {
			throw new Error(`Fixture ${fixture.id} has no launcherPath.`);
		}

		this.assertExecutableFile(fixture.payload.launcherPath, `${fixture.id} launcher`);
		if (fixture.payload.kind === 'minimal-lifecycle') {
			this.writeScenarioEvidence(`Fixture ${fixture.id} uses a minimal lifecycle payload. Its launcher was not executed and it does not establish full product launcher behavior.\n`);
			return;
		}

		const result = this.run(fixture.payload.launcherPath, [
			'--user-data-dir', path.join(this.requireScenario().root, 'user-data'),
			'--no-sandbox',
			'--version',
		]);
		this.assertCommandSucceeded(result, `${fixture.id} complete-package launcher`);
	}

	/**
	 * Exercises the shipped helper source in the disposable runner for an unrecognized app name.
	 */
	public assertUnrecognizedApplicationNoOp(applicationName: string): void {
		const scenario = this.requireScenario();
		const helperPath = path.join(scenario.root, 'copilot-link-helper.sh');
		fs.writeFileSync(helperPath, this.helperSource, { mode: 0o700 });
		const script = `. ${shellQuote(helperPath)}
vscode_copilot_link install ${shellQuote(applicationName)}
vscode_copilot_link remove ${shellQuote(applicationName)}
`;
		const result = this.run(this.findRequiredExecutable('sh'), ['-c', script]);
		this.assertCommandSucceeded(result, `unrecognized application helper no-op for ${applicationName}`);
		this.assertNoSharedCommand();
	}

	/**
	 * Verifies actual package metadata, payload ownership lists, DEB scripts, and RPM macro-expanded scriptlets.
	 */
	public inspectFixtureArtifacts(): void {
		const fixtures = getCopilotShimFixturesForFormat(this.manifest, this.format);
		assert.ok(fixtures.length > 0, `No ${this.format} fixtures were selected.`);
		assertCopilotLinkHelperSource(this.helperSource, this.manifest.helper.sourcePath);

		for (const fixture of fixtures) {
			this.inspectFixtureArtifact(fixture);
		}

		for (const identity of ['code', 'code-insiders'] as const) {
			this.assertDistinctUpgradeFixtures(identity, 'initial', 'upgrade');
		}
		this.assertDistinctUpgradeFixtures('code-oss', 'oss-initial', 'oss-upgrade');
	}

	/**
	 * Verifies that the actual install/configure hook order, rather than package argument order or removal hooks, chose the final link target.
	 */
	public assertFinalLinkMatchesLastSuccessfulHook(): void {
		const hooks = this.getInstallHookEvents();
		assert.ok(hooks.length > 0, `No installation hooks were observed in ${this.requireScenario().installHookLogPath}.`);
		const expectedPhase = this.format === 'deb' ? 'deb-postinst-configure' : 'rpm-post';
		for (const hook of hooks) {
			assert.strictEqual(hook.phase, expectedPhase, `Unexpected ${this.format} installation hook phase: ${hook.phase}.`);
		}
		this.assertSharedLink(hooks.at(-1)!.identity);
	}

	/**
	 * Verifies that an installed package has the exact version declared by its fixture.
	 */
	public assertInstalledPackageVersion(fixture: ICopilotShimFixture): void {
		const version = this.getInstalledPackageVersion(fixture.packageName);
		assert.strictEqual(version, fixture.packageVersion, `${fixture.packageName} does not have the expected installed fixture revision.`);
	}

	/**
	 * Clears the test-local hook observation before a batched transaction.
	 */
	public clearHookObservation(): void {
		const scenario = this.requireScenario();
		fs.rmSync(scenario.hookLogPath, { force: true });
		fs.rmSync(scenario.installHookLogPath, { force: true });
	}

	/**
	 * Captures the current command entry so a test can prove package lifecycle leaves it unchanged.
	 */
	public captureSharedCommandEntry(): IEntrySnapshot {
		return this.snapshotEntry(sharedCommandPath);
	}

	/**
	 * Removes only a command entry that the active test scenario created.
	 */
	public clearTestOwnedSharedCommand(): void {
		const scenario = this.requireScenario();
		if (!scenario.commandEntryOwned) {
			throw new Error('The active scenario does not own the shared command entry.');
		}
		this.removeCurrentSharedCommandEntry();
		scenario.commandEntryOwned = false;
	}

	/**
	 * Removes test-only artifact inspection output after the suite completes.
	 */
	public cleanupArtifactInspection(): void {
		fs.rmSync(path.join(this.marker.workRoot, 'artifact-inspection'), { recursive: true, force: true });
	}

	private preflight(): void {
		if (os.platform() !== 'linux') {
			throw new Error(`Copilot shim package lifecycle tests require Linux, not ${os.platform()}.`);
		}
		if (process.getuid?.() !== 0) {
			throw new Error('Copilot shim package lifecycle tests require root inside the provisioned disposable runner. Root alone is not accepted without the runner marker.');
		}
		if (this.currentMountNamespace() !== this.marker.mountNamespace) {
			throw new Error('The Copilot shim runner marker belongs to a different mount namespace. Refusing to mutate package state.');
		}
		this.assertProvisionedDirectory(this.marker.workRoot, '/var/lib/vscode-copilot-shim-package-lifecycle', 'workRoot');
		this.assertProvisionedDirectory(this.marker.usrProbe, '/usr/share/vscode-copilot-shim-package-lifecycle', 'usrProbe');
		this.assertProvisionedDirectory(this.marker.etcProbe, '/etc/vscode-copilot-shim-package-lifecycle', 'etcProbe');
		if (!fs.statSync(this.marker.evidenceRoot).isDirectory()) {
			throw new Error(`Runner evidenceRoot is not a directory: ${this.marker.evidenceRoot}.`);
		}
		this.assertNoHostBindMount('/usr');
		this.assertNoHostBindMount('/etc');
		this.assertArchitecture();
		this.assertPackageManagerUsable();
		if (this.format === 'deb') {
			this.findRequiredExecutable('dpkg-deb');
			this.findRequiredExecutable('dpkg-query');
		}
		this.assertCleanEnvironment();
	}

	private readAndValidateRunnerMarker(): IRunnerMarker {
		const markerPath = process.env[runnerMarkerEnvironmentVariable];
		if (!markerPath) {
			throw new Error(`${runnerMarkerEnvironmentVariable} is required. Set it only through scripts/provision-copilot-shim-runner.sh in a disposable container or VM.`);
		}

		const normalizedMarkerPath = path.resolve(markerPath);
		const relativeMarkerPath = path.relative(runnerMarkerDirectory, normalizedMarkerPath);
		if (relativeMarkerPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeMarkerPath) || !relativeMarkerPath.endsWith(`${path.sep}marker.json`)) {
			throw new Error(`${runnerMarkerEnvironmentVariable} must point to /run/vscode-copilot-shim-package-lifecycle/<runner-id>/marker.json.`);
		}

		const markerStat = fs.lstatSync(normalizedMarkerPath);
		if (!markerStat.isFile() || markerStat.uid !== 0) {
			throw new Error(`Runner marker must be a root-owned regular file: ${normalizedMarkerPath}.`);
		}

		let value: unknown;
		try {
			value = JSON.parse(fs.readFileSync(normalizedMarkerPath, 'utf8')) as unknown;
		} catch (error) {
			throw new Error(`Unable to parse runner marker ${normalizedMarkerPath}: ${errorMessage(error)}`);
		}
		const record = asRecord(value, 'runner marker');
		const marker: IRunnerMarker = {
			schemaVersion: asMarkerSchemaVersion(record.schemaVersion),
			purpose: asMarkerPurpose(record.purpose),
			runnerId: asMarkerString(record.runnerId, 'runnerId'),
			mountNamespace: asMarkerString(record.mountNamespace, 'mountNamespace'),
			workRoot: asMarkerString(record.workRoot, 'workRoot'),
			evidenceRoot: asMarkerString(record.evidenceRoot, 'evidenceRoot'),
			usrProbe: asMarkerString(record.usrProbe, 'usrProbe'),
			etcProbe: asMarkerString(record.etcProbe, 'etcProbe'),
		};

		if (!/^[A-Za-z0-9_-]+$/u.test(marker.runnerId)) {
			throw new Error(`Runner marker has an invalid runnerId: ${marker.runnerId}.`);
		}
		const expectedMarkerPath = path.join(runnerMarkerDirectory, marker.runnerId, 'marker.json');
		if (normalizedMarkerPath !== expectedMarkerPath) {
			throw new Error(`Runner marker path does not match its runnerId. Expected ${expectedMarkerPath}, got ${normalizedMarkerPath}.`);
		}
		if (marker.workRoot !== path.join('/var/lib/vscode-copilot-shim-package-lifecycle', marker.runnerId, 'work')
			|| marker.usrProbe !== path.join('/usr/share/vscode-copilot-shim-package-lifecycle', marker.runnerId)
			|| marker.etcProbe !== path.join('/etc/vscode-copilot-shim-package-lifecycle', marker.runnerId)) {
			throw new Error('Runner marker has noncanonical provisioned paths. Run scripts/provision-copilot-shim-runner.sh inside a fresh disposable runner.');
		}
		return marker;
	}

	private assertProvisionedDirectory(directory: string, allowedPrefix: string, propertyName: string): void {
		const relativePath = path.relative(allowedPrefix, directory);
		if (relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
			throw new Error(`Runner marker ${propertyName} must stay below ${allowedPrefix}, got ${directory}.`);
		}
		const stat = fs.statSync(directory);
		if (!stat.isDirectory() || stat.uid !== 0) {
			throw new Error(`Runner marker ${propertyName} is not a root-owned provisioned directory: ${directory}.`);
		}
	}

	private assertNoHostBindMount(mountPoint: '/usr' | '/etc'): void {
		const mountLines = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
		for (const line of mountLines) {
			const fields = line.split(' ');
			if (fields[4] !== mountPoint) {
				continue;
			}
			if (fields[3] !== '/') {
				throw new Error(`${mountPoint} is a subdirectory or bind mount (${line}); a host /usr or /etc mount is prohibited for this runner.`);
			}
		}
	}

	private assertArchitecture(): void {
		let expectedArchitecture: string;
		switch (process.arch) {
			case 'x64':
				expectedArchitecture = this.format === 'deb' ? 'amd64' : 'x86_64';
				break;
			case 'arm64':
				expectedArchitecture = this.format === 'deb' ? 'arm64' : 'aarch64';
				break;
			case 'arm':
				expectedArchitecture = this.format === 'deb' ? 'armhf' : 'armv7hl';
				break;
			default:
				throw new Error(`Unsupported Node architecture for ${this.format} fixtures: ${process.arch}.`);
		}

		for (const fixture of getCopilotShimFixturesForFormat(this.manifest, this.format)) {
			if (fixture.architecture !== expectedArchitecture) {
				throw new Error(`Fixture ${fixture.id} has ${fixture.architecture}, but this ${process.arch} runner requires ${expectedArchitecture}.`);
			}
		}
	}

	private assertPackageManagerUsable(): void {
		const result = this.run(this.packageManagerPath, this.format === 'deb' ? ['--version'] : ['--version']);
		this.assertCommandSucceeded(result, `${this.format} package manager`);
	}

	private assertCleanEnvironment(): void {
		for (const packageName of knownPackageNames) {
			if (this.isPackageInstalled(packageName)) {
				throw new Error(`Refusing to run with pre-existing VS Code package ${packageName}. Use a freshly provisioned disposable runner.`);
			}
		}

		const commandEntries = new Set([
			sharedCommandPath,
			'/usr/local/bin/copilot',
			...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(directory => path.join(directory, 'copilot')),
		]);
		for (const entry of [
			...commandEntries,
			'/etc/vscode/policy.json',
			'/usr/share/code',
			'/usr/share/code-insiders',
			'/usr/share/code-oss',
			'/usr/bin/code',
			'/usr/bin/code-insiders',
			'/usr/bin/code-oss',
		]) {
			if (this.lstat(entry)) {
				throw new Error(`Refusing to run with pre-existing or unexplained entry ${entry}. The runner must be provisioned cleanly before fixture seeding.`);
			}
		}
	}

	private packageArguments(operation: CopilotShimPackageOperation, packagePaths: readonly string[]): string[] {
		if (this.format === 'deb') {
			return ['-i', ...packagePaths];
		}

		switch (operation) {
			case 'install':
				return ['-i', '--nosignature', ...packagePaths];
			case 'upgrade':
				return ['-U', '--nosignature', ...packagePaths];
			case 'reinstall':
				return ['-U', '--replacepkgs', '--nosignature', ...packagePaths];
		}
	}

	private inspectFixtureArtifact(fixture: ICopilotShimFixture): void {
		if (this.format === 'deb') {
			this.inspectDebFixtureArtifact(fixture);
		} else {
			this.inspectRpmFixtureArtifact(fixture);
		}
	}

	private inspectDebFixtureArtifact(fixture: ICopilotShimFixture): void {
		const metadata = this.run(this.findRequiredExecutable('dpkg-deb'), ['--show', `--showformat=${debPackageMetadataFormat}`, fixture.packagePath]);
		this.assertCommandSucceeded(metadata, `DEB metadata for ${fixture.id}`);
		const [packageName, packageVersion, architecture] = metadata.stdout.trim().split(/\r?\n/u);
		assert.deepStrictEqual(
			{ packageName, packageVersion, architecture },
			{ packageName: fixture.packageName, packageVersion: fixture.packageVersion, architecture: fixture.architecture },
			`DEB metadata does not match fixture manifest for ${fixture.id}.`,
		);

		const contents = this.run(this.findRequiredExecutable('dpkg-deb'), ['-c', fixture.packagePath]);
		this.assertCommandSucceeded(contents, `DEB payload list for ${fixture.id}`);
		this.assertPayloadPaths(fixture, contents.stdout.split(/\r?\n/u).map(line => line.trim().split(/\s+/u).at(-1) ?? ''));
		if (fixture.role === 'foreign-owner') {
			return;
		}

		const controlDirectory = path.join(this.marker.workRoot, 'artifact-inspection', fixture.id);
		fs.rmSync(controlDirectory, { recursive: true, force: true });
		fs.mkdirSync(controlDirectory, { recursive: true, mode: 0o700 });
		const controls = this.run(this.findRequiredExecutable('dpkg-deb'), ['-e', fixture.packagePath, controlDirectory]);
		this.assertCommandSucceeded(controls, `DEB maintainer script extraction for ${fixture.id}`);

		const postinst = this.readArtifactScript(path.join(controlDirectory, 'postinst'), `${fixture.id} postinst`);
		const postrm = this.readArtifactScript(path.join(controlDirectory, 'postrm'), `${fixture.id} postrm`);
		this.assertMaintainerScriptContract(fixture, postinst, postrm, `${fixture.id} DEB`);
	}

	private inspectRpmFixtureArtifact(fixture: ICopilotShimFixture): void {
		const rpm = this.findRequiredExecutable('rpm');
		const metadata = this.run(rpm, ['-qp', '--nosignature', '--qf', '%{NAME}\n%{EPOCHNUM}:%{VERSION}-%{RELEASE}\n%{ARCH}\n', fixture.packagePath]);
		this.assertCommandSucceeded(metadata, `RPM metadata for ${fixture.id}`);
		const [packageName, packageVersion, architecture] = metadata.stdout.trim().split(/\r?\n/u);
		assert.deepStrictEqual(
			{ packageName, packageVersion, architecture },
			{ packageName: fixture.packageName, packageVersion: fixture.packageVersion, architecture: fixture.architecture },
			`RPM metadata does not match fixture manifest for ${fixture.id}.`,
		);

		const contents = this.run(rpm, ['-qlp', '--nosignature', fixture.packagePath]);
		this.assertCommandSucceeded(contents, `RPM payload list for ${fixture.id}`);
		this.assertPayloadPaths(fixture, contents.stdout.split(/\r?\n/u));
		if (fixture.role === 'foreign-owner') {
			return;
		}

		const scriptlets = this.run(rpm, ['-qp', '--nosignature', '--scripts', fixture.packagePath]);
		this.assertCommandSucceeded(scriptlets, `RPM macro-expanded scriptlets for ${fixture.id}`);
		this.assertMaintainerScriptContract(fixture, scriptlets.stdout, scriptlets.stdout, `${fixture.id} RPM macro-expanded scriptlets`);
	}

	private assertPayloadPaths(fixture: ICopilotShimFixture, paths: readonly string[]): void {
		if (fixture.role === 'foreign-owner') {
			assert.ok(paths.includes(sharedCommandPath) || paths.includes(`.${sharedCommandPath}`), `${fixture.id} must own its test-only foreign ${sharedCommandPath} fixture.`);
			return;
		}

		assert.ok(!paths.includes(sharedCommandPath) && !paths.includes(`.${sharedCommandPath}`), `${fixture.id} must not own ${sharedCommandPath} as a package payload.`);
		if (fixture.payload.hasCopilotShim) {
			assert.ok(fixture.payload.shimPath, `${fixture.id} must declare its shim payload path.`);
			assert.ok(paths.includes(fixture.payload.shimPath!) || paths.includes(`.${fixture.payload.shimPath}`), `${fixture.id} package payload does not include its nested Copilot shim.`);
		}
		if (fixture.role === 'legacy-no-shim' && (fixture.identity === 'code' || fixture.identity === 'code-insiders')) {
			const expectedShimPath = getCopilotShimTarget(fixture.identity);
			assert.ok(!paths.includes(expectedShimPath) && !paths.includes(`.${expectedShimPath}`), `${fixture.id} unexpectedly includes the legacy-unavailable Copilot shim.`);
		}
		if (fixture.payload.launcherPath) {
			assert.ok(paths.includes(fixture.payload.launcherPath) || paths.includes(`.${fixture.payload.launcherPath}`), `${fixture.id} package payload does not include its launcher.`);
		}
	}

	private assertMaintainerScriptContract(fixture: ICopilotShimFixture, installScript: string, removeScript: string, scriptName: string): void {
		const combined = `${installScript}\n${removeScript}`;
		assert.ok(!/gh\.io\/copilot-install|copilot-install|\b(?:curl|wget)\b/u.test(combined), `${scriptName} must not install or download the real Copilot CLI.`);

		if (isCurrentCopilotShimFixture(fixture)) {
			assertEmbeddedCopilotLinkHelper(installScript, this.helperSource, `${scriptName} install script`);
			assertEmbeddedCopilotLinkHelper(removeScript, this.helperSource, `${scriptName} remove script`);
			assertCopilotLinkLifecycleCall(installScript, 'install', fixture.identity, `${scriptName} install script`);
			assertCopilotLinkLifecycleCall(removeScript, 'remove', fixture.identity, `${scriptName} remove script`);
			this.assertInstallHookInstrumentation(fixture, installScript, removeScript, scriptName);
			this.assertLifecycleGates(fixture, installScript, removeScript, scriptName);
			return;
		}

		if (fixture.role === 'oss-initial' || fixture.role === 'oss-upgrade') {
			assertEmbeddedCopilotLinkHelper(installScript, this.helperSource, `${scriptName} install script`);
			assertEmbeddedCopilotLinkHelper(removeScript, this.helperSource, `${scriptName} remove script`);
			assertCopilotLinkLifecycleCall(installScript, 'install', 'code-oss', `${scriptName} install script`);
			assertCopilotLinkLifecycleCall(removeScript, 'remove', 'code-oss', `${scriptName} remove script`);
			this.assertInstallHookInstrumentation(fixture, installScript, removeScript, scriptName);
			this.assertLifecycleGates(fixture, installScript, removeScript, scriptName);
			return;
		}

		if (fixture.role === 'legacy-no-shim') {
			assert.ok(!combined.includes('vscode_copilot_link'), `${scriptName} must not add Copilot link lifecycle handling.`);
		}
	}

	private assertLifecycleGates(fixture: ICopilotShimFixture, installScript: string, removeScript: string, scriptName: string): void {
		if (fixture.format === 'deb') {
			assert.match(installScript, /if \[ "\$1" = "configure" \]; then/u, `${scriptName} must select the link only during DEB configure.`);
			assert.match(removeScript, /case "\$1" in[\s\S]*remove\|purge\)/u, `${scriptName} must remove or fall back only during DEB remove or purge.`);
			return;
		}

		assert.match(removeScript, /if \[ "\$1" = 0 \]; then[\s\S]*vscode_copilot_link remove/u, `${scriptName} must remove or fall back only for final RPM erase.`);
		assert.ok(!/\bposttrans scriptlet\b/iu.test(removeScript), `${scriptName} must not add a posttrans reselection hook.`);
	}

	private assertDistinctUpgradeFixtures(
		identity: CopilotShimIdentity,
		initialRole: ICopilotShimFixture['role'],
		upgradeRole: ICopilotShimFixture['role'],
	): void {
		for (const payloadKind of ['complete', 'minimal-lifecycle'] as const) {
			const initial = this.findFixture(identity, initialRole, payloadKind);
			const upgrade = this.findFixture(identity, upgradeRole, payloadKind);
			if (!initial && !upgrade) {
				continue;
			}
			if (!initial || !upgrade) {
				throw new Error(`Fixture manifest must provide both ${identity} initial and upgrade ${payloadKind} fixtures.`);
			}
			assert.notStrictEqual(initial.packageVersion, upgrade.packageVersion, `${identity} ${payloadKind} initial and upgrade fixtures cannot use the same revision.`);
			assert.ok(upgrade.revisionOrdinal > initial.revisionOrdinal, `${identity} ${payloadKind} upgrade fixture must have a higher declared revision ordinal.`);

			if (this.format === 'deb') {
				const result = this.run(this.packageManagerPath, ['--compare-versions', initial.packageVersion, 'lt', upgrade.packageVersion]);
				this.assertCommandSucceeded(result, `${identity} ${payloadKind} DEB fixture revision comparison`);
			}
		}
	}

	public assertFileOwnedByPackage(filePath: string, packageName: string): void {
		const result = this.format === 'deb'
			? this.run(this.findRequiredExecutable('dpkg-query'), ['-S', filePath])
			: this.run(this.packageManagerPath, ['-qf', '--qf', '%{NAME}', '--', filePath]);
		this.assertCommandSucceeded(result, `ownership query for ${filePath}`);
		assert.match(result.stdout, new RegExp(`(^|\\n)${escapeRegExp(packageName)}(?:[:\\s]|$)`, 'u'), `${filePath} is not owned by ${packageName}.`);
	}

	private assertSharedCommandHasNoPackageOwner(): void {
		const result = this.format === 'deb'
			? this.run(this.findRequiredExecutable('dpkg-query'), ['-S', sharedCommandPath])
			: this.run(this.packageManagerPath, ['-qf', '--', sharedCommandPath]);
		assert.notStrictEqual(result.status, 0, `${sharedCommandPath} must not be package-owned.`);
	}

	private getInstalledPackageVersion(packageName: string): string {
		const result = this.format === 'deb'
			? this.run(this.findRequiredExecutable('dpkg-query'), ['-W', '-f=${Version}', packageName])
			: this.run(this.packageManagerPath, ['-q', '--qf', '%{EPOCHNUM}:%{VERSION}-%{RELEASE}', packageName]);
		this.assertCommandSucceeded(result, `installed version query for ${packageName}`);
		return result.stdout.trim();
	}

	private isPackageInstalled(packageName: string): boolean {
		const result = this.format === 'deb'
			? this.run(this.findRequiredExecutable('dpkg-query'), ['-W', '-f=${db:Status-Status}', packageName])
			: this.run(this.packageManagerPath, ['-q', packageName]);
		if (result.status === 0) {
			if (this.format === 'deb') {
				return result.stdout.trim() === 'installed';
			}
			return true;
		}
		if (result.status === 1) {
			return false;
		}
		throw new Error(`Unable to determine whether ${packageName} is installed.\n${this.formatCommandResult(result)}`);
	}

	private replaceSharedCommandWithFile(contents: string): void {
		this.removeCurrentSharedCommandEntry();
		fs.writeFileSync(sharedCommandPath, contents, { mode: 0o755 });
		this.requireScenario().commandEntryOwned = true;
	}

	private replaceSharedCommandWithLink(target: string): void {
		this.removeCurrentSharedCommandEntry();
		fs.symlinkSync(target, sharedCommandPath);
		this.requireScenario().commandEntryOwned = true;
	}

	private removeCurrentSharedCommandEntry(): void {
		const stat = this.lstat(sharedCommandPath);
		if (!stat) {
			return;
		}
		if (stat.isDirectory()) {
			throw new Error(`${sharedCommandPath} unexpectedly became a directory; refusing to remove it.`);
		}
		fs.unlinkSync(sharedCommandPath);
	}

	private restoreFixtureFiles(): void {
		const scenario = this.requireScenario();
		for (const restore of scenario.fileRestores.reverse()) {
			fs.copyFileSync(restore.backupPath, restore.path);
			fs.chmodSync(restore.path, restore.mode);
		}
		scenario.fileRestores = [];
	}

	private cleanupScenarioPackages(): void {
		const scenario = this.requireScenario();
		for (const packageName of [...scenario.installedPackages].reverse()) {
			const result = this.format === 'deb'
				? this.run(this.packageManagerPath, ['--purge', packageName])
				: this.run(this.packageManagerPath, ['-e', packageName]);
			this.assertCommandSucceeded(result, `cleanup removal for ${packageName}`);
		}
		scenario.installedPackages = [];
	}

	private removeTestOwnedSharedCommand(): void {
		const scenario = this.requireScenario();
		const entry = this.snapshotEntry(sharedCommandPath);
		if (entry.kind === 'absent') {
			return;
		}
		if (!scenario.commandEntryOwned && (!scenario.acceptedResidualSharedCommand || !sameEntrySnapshot(entry, scenario.acceptedResidualSharedCommand))) {
			throw new Error(`Package cleanup left an unexpected ${sharedCommandPath} entry. Refusing to delete a command not explicitly seeded or accepted as a failed-removal residual.`);
		}
		this.removeCurrentSharedCommandEntry();
		scenario.commandEntryOwned = false;
		scenario.acceptedResidualSharedCommand = undefined;
	}

	private createDownloadWrappers(): void {
		for (const command of ['curl', 'wget']) {
			const wrapperPath = path.join(this.requireScenario().wrapperDirectory, command);
			fs.writeFileSync(wrapperPath, `#!/bin/sh\nprintf '%s\\n' "${command}:$*" >> "$VSCODE_COPILOT_SHIM_DOWNLOAD_LOG"\nexit 97\n`, { mode: 0o755 });
		}
	}

	private createMutationWrapper(command: CopilotShimMutationCommand): void {
		const wrapperPath = path.join(this.requireScenario().wrapperDirectory, command);
		const realCommand = this.mutationCommandPaths[command];
		const escapedRealCommand = shellQuote(realCommand);
		const escapedCommand = shellQuote(command);
		const contents = `#!/bin/sh
is_copilot_lifecycle_path() {
	case "$1" in
		${sharedCommandPath}|${sharedCommandPath}.vscode-copilot.*)
			return 0
			;;
	esac
	return 1
}

matches=0
for argument in "$@"; do
	if is_copilot_lifecycle_path "$argument"; then
		matches=1
		break
	fi
done

if [ "$matches" -eq 1 ] && [ "$VSCODE_COPILOT_SHIM_FAIL_MUTATION" = ${escapedCommand} ]; then
	printf '%s\\n' "${command}: injected failure: $*" >> "$VSCODE_COPILOT_SHIM_HOOK_LOG"
	exit 73
fi

${escapedRealCommand} "$@"
status=$?
if [ "$matches" -eq 1 ] && [ "$status" -eq 0 ]; then
	target=$(readlink -n -- ${sharedCommandPath} 2>/dev/null || :)
	if [ -n "$target" ]; then
		printf '%s\\t%s\\n' "${command}" "$target" >> "$VSCODE_COPILOT_SHIM_HOOK_LOG"
	else
		printf '%s\\t<removed>\\n' "${command}" >> "$VSCODE_COPILOT_SHIM_HOOK_LOG"
	fi
fi
exit "$status"
`;
		fs.writeFileSync(wrapperPath, contents, { mode: 0o755 });
	}

	private getInstallHookEvents(): readonly { phase: string; identity: 'code' | 'code-insiders' }[] {
		const scenario = this.requireScenario();
		if (!fs.existsSync(scenario.installHookLogPath)) {
			return [];
		}
		return fs.readFileSync(scenario.installHookLogPath, 'utf8')
			.split(/\r?\n/u)
			.filter(Boolean)
			.map(line => {
				const [phase, identity, extra] = line.split('\t');
				if (extra !== undefined || (identity !== 'code' && identity !== 'code-insiders')) {
					throw new Error(`Invalid installation-hook observation: ${line}.`);
				}
				return { phase, identity };
			});
	}

	private assertIndependentCopilotState(): void {
		const scenario = this.requireScenario();
		assert.strictEqual(sha256File(scenario.independentCliPath), scenario.independentCliHash, 'Package lifecycle changed the independent real Copilot CLI fixture.');
		assert.strictEqual(sha256File(scenario.independentDataPath), scenario.independentDataHash, 'Package lifecycle changed independent Copilot user data.');
	}

	private assertNoInstallerDownload(): void {
		const scenario = this.requireScenario();
		const downloads = fs.existsSync(scenario.downloadLogPath)
			? fs.readFileSync(scenario.downloadLogPath, 'utf8').trim()
			: '';
		assert.strictEqual(downloads, '', `Package installation attempted a downloader:\n${downloads}`);
	}

	private assertExecutableFile(filePath: string, description: string): void {
		const stat = fs.statSync(filePath);
		assert.ok(stat.isFile(), `${description} must be a regular file: ${filePath}.`);
		assert.ok((stat.mode & 0o111) !== 0, `${description} must be executable: ${filePath}.`);
	}

	private assertCommandSucceeded(result: ICommandResult, description: string): void {
		if (result.error || result.status !== 0) {
			throw new Error(`${description} failed.\n${this.formatCommandResult(result)}`);
		}
	}

	private run(command: string, args: readonly string[]): ICommandResult {
		const scenario = this.scenario;
		const environment: NodeJS.ProcessEnv = {
			...process.env,
			DEBIAN_FRONTEND: 'noninteractive',
			HOME: scenario?.home ?? process.env.HOME,
		};
		if (scenario) {
			environment.PATH = `${scenario.wrapperDirectory}:${process.env.PATH ?? '/usr/sbin:/usr/bin:/sbin:/bin'}`;
			environment.VSCODE_COPILOT_SHIM_DOWNLOAD_LOG = scenario.downloadLogPath;
			environment.VSCODE_COPILOT_SHIM_HOOK_LOG = scenario.hookLogPath;
			environment[copilotShimInstallHookLogEnvironmentVariable] = scenario.installHookLogPath;
			environment.VSCODE_COPILOT_SHIM_FAIL_MUTATION = scenario.mutationFailure ?? '';
		}

		const result = spawnSync(command, args, {
			encoding: 'utf8',
			env: environment,
			timeout: 5 * 60 * 1000,
		});
		const commandResult: ICommandResult = {
			command,
			args,
			status: result.status,
			signal: result.signal,
			stdout: commandOutput(result.stdout),
			stderr: commandOutput(result.stderr),
			error: result.error?.message,
		};
		if (scenario) {
			this.writeScenarioEvidence(`${this.formatCommandResult(commandResult)}\n`);
		}
		return commandResult;
	}

	private formatCommandResult(result: ICommandResult): string {
		return [
			`$ ${result.command} ${result.args.map(shellQuote).join(' ')}`,
			`status=${result.status ?? 'null'} signal=${result.signal ?? 'none'} error=${result.error ?? 'none'}`,
			'stdout:',
			result.stdout,
			'stderr:',
			result.stderr,
		].join('\n');
	}

	private writeScenarioEvidence(contents: string): void {
		const scenario = this.requireScenario();
		fs.appendFileSync(scenario.commandLogPath, contents);
	}

	private retainScenarioEvidence(message: string): void {
		const scenario = this.requireScenario();
		const destination = path.join(this.marker.evidenceRoot, `${scenario.name}.txt`);
		fs.mkdirSync(this.marker.evidenceRoot, { recursive: true, mode: 0o700 });
		const report = [
			message,
			`Scenario workspace: ${scenario.root}`,
			`Fixture manifest: ${this.manifest.fixtureSetId}`,
			`Package format: ${this.format}`,
			fs.existsSync(scenario.commandLogPath) ? fs.readFileSync(scenario.commandLogPath, 'utf8') : '(no command log)',
			'Hook observation:',
			fs.existsSync(scenario.hookLogPath) ? fs.readFileSync(scenario.hookLogPath, 'utf8') : '(no hook mutations observed)',
			'Installation hook observation:',
			fs.existsSync(scenario.installHookLogPath) ? fs.readFileSync(scenario.installHookLogPath, 'utf8') : '(no installation hooks observed)',
			'Unexpected downloader observation:',
			fs.existsSync(scenario.downloadLogPath) ? fs.readFileSync(scenario.downloadLogPath, 'utf8') : '(no downloader invocation observed)',
		].join('\n\n');
		fs.writeFileSync(destination, report, { mode: 0o600 });
		console.error(`Copilot shim package lifecycle evidence retained at ${destination}.`);
	}

	private requireScenario(): IScenario {
		if (!this.scenario) {
			throw new Error('No active Copilot shim package lifecycle scenario.');
		}
		return this.scenario;
	}

	private assertFixtureFormat(fixture: ICopilotShimFixture): void {
		if (fixture.format !== this.format) {
			throw new Error(`Fixture ${fixture.id} is ${fixture.format}, but this runner is restricted to ${this.format}.`);
		}
	}

	private findFixture(identity: CopilotShimIdentity, role: ICopilotShimFixture['role'], payloadKind: CopilotShimPayloadKind): ICopilotShimFixture | undefined {
		return this.manifest.fixtures.find(candidate =>
			candidate.format === this.format
			&& candidate.identity === identity
			&& candidate.role === role
			&& candidate.payload.kind === payloadKind
		);
	}

	private readArtifactScript(filePath: string, description: string): string {
		if (!fs.statSync(filePath).isFile()) {
			throw new Error(`${description} is missing: ${filePath}.`);
		}
		return fs.readFileSync(filePath, 'utf8');
	}

	private lstat(filePath: string): fs.Stats | undefined {
		try {
			return fs.lstatSync(filePath);
		} catch (error) {
			if (isMissingFileError(error)) {
				return undefined;
			}
			throw error;
		}
	}

	private snapshotEntry(filePath: string): IEntrySnapshot {
		const stat = this.lstat(filePath);
		if (!stat) {
			return { kind: 'absent' };
		}
		if (stat.isSymbolicLink()) {
			return { kind: 'symlink', target: fs.readlinkSync(filePath) };
		}
		if (stat.isFile()) {
			return { kind: 'file', mode: stat.mode & 0o777, hash: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') };
		}
		throw new Error(`Cannot snapshot unsupported foreign command entry ${filePath}.`);
	}

	private getAcceptedFailedRemovalResidual(fixture: ICopilotShimFixture): IEntrySnapshot | undefined {
		if (fixture.identity !== 'code' && fixture.identity !== 'code-insiders') {
			return undefined;
		}
		const residual = this.snapshotEntry(sharedCommandPath);
		return residual.kind === 'symlink' && residual.target === getCopilotShimTarget(fixture.identity)
			? residual
			: undefined;
	}

	private clearAcceptedResidualIfRepaired(): void {
		const scenario = this.requireScenario();
		const accepted = scenario.acceptedResidualSharedCommand;
		if (!accepted) {
			return;
		}

		const current = this.snapshotEntry(sharedCommandPath);
		if (!sameEntrySnapshot(current, accepted)
			|| (current.kind === 'symlink' && current.target !== undefined && this.isRegularExecutable(current.target))) {
			scenario.acceptedResidualSharedCommand = undefined;
		}
	}

	private isRegularExecutable(filePath: string): boolean {
		try {
			const stat = fs.statSync(filePath);
			return stat.isFile() && (stat.mode & 0o111) !== 0;
		} catch (error) {
			if (isMissingFileError(error)) {
				return false;
			}
			throw error;
		}
	}

	private findRequiredExecutable(command: string): string {
		for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
			if (!directory) {
				continue;
			}
			const candidate = path.join(directory, command);
			try {
				const stat = fs.statSync(candidate);
				if (stat.isFile() && (stat.mode & 0o111) !== 0) {
					return candidate;
				}
			} catch (error) {
				if (!isMissingFileError(error)) {
					throw error;
				}
			}
		}
		throw new Error(`Required executable ${command} is not available on PATH.`);
	}

	private currentMountNamespace(): string {
		return fs.readlinkSync('/proc/self/ns/mnt');
	}
}

function asRecord(value: unknown, description: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${description} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function asMarkerSchemaVersion(value: unknown): 1 {
	if (value !== 1) {
		throw new Error(`Runner marker schemaVersion must be 1, got ${String(value)}.`);
	}
	return 1;
}

function asMarkerPurpose(value: unknown): typeof runnerMarkerPurpose {
	if (value !== runnerMarkerPurpose) {
		throw new Error(`Runner marker purpose must be ${runnerMarkerPurpose}, got ${String(value)}.`);
	}
	return runnerMarkerPurpose;
}

function asMarkerString(value: unknown, name: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Runner marker ${name} must be a non-empty string.`);
	}
	return value;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameEntrySnapshot(left: IEntrySnapshot, right: IEntrySnapshot): boolean {
	return left.kind === right.kind
		&& left.mode === right.mode
		&& left.hash === right.hash
		&& left.target === right.target;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function commandOutput(output: string | Buffer | undefined): string {
	return typeof output === 'string' ? output : output?.toString() ?? '';
}

function isMissingFileError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}
