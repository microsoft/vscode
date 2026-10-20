/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import fs from 'fs';
import minimist from 'minimist';
import path from 'path';
import {
	CopilotShimFixtureRole,
	CopilotShimIdentity,
	CopilotShimPackageFormat,
	CopilotShimPayloadKind,
	copilotShimInstallHookInstrumentation,
	copilotShimInstallHookLogEnvironmentVariable,
	debPackageMetadataFormat,
	getCopilotShimTarget,
	ICopilotShimFixture,
	ICopilotShimFixtureManifest,
	sha256File,
} from './copilotShimFixtures.js';

const fixtureSourceMarker = '.vscode-copilot-shim-fixture-source.json';
const fixtureSourcePurpose = 'vscode-copilot-shim-fixture-source';
const productionTemplatePaths = [
	'build/gulpfile.vscode.linux.ts',
	'resources/linux/copilot-link.sh',
	'resources/linux/debian/postinst.template',
	'resources/linux/debian/postrm.template',
	'resources/linux/rpm/code.spec.template',
];

interface IFixtureBuildPlan {
	schemaVersion: 1;
	fixtureSetId: string;
	architecture: 'x64' | 'arm64' | 'armhf';
	fixtures: readonly IFixtureBuildPlanEntry[];
}

interface IFixtureBuildPlanEntry {
	id: string;
	sourceRoot: string;
	sourceRevision: string;
	sourceKind: 'source-build' | 'prepared-payload';
	identity: Exclude<CopilotShimIdentity, 'foreign-copilot-owner'>;
	role: Exclude<CopilotShimFixtureRole, 'foreign-owner'>;
	revisionOrdinal: number;
	payloadKind: CopilotShimPayloadKind;
	formats: readonly CopilotShimPackageFormat[];
	fixtureAdjustments: readonly string[];
}

const options = minimist(process.argv.slice(2), {
	string: ['plan', 'output'],
	boolean: ['help'],
	alias: { plan: 'p', output: 'o', help: 'h' },
});

if (options.help) {
	console.info(`Usage: node ${path.basename(process.argv[1])} --plan <fixture-plan.json> --output <fixture-directory>`);
	console.info('The plan must point only to marked disposable source/build copies with prepared payloads.');
	process.exit(0);
}

if (typeof options.plan !== 'string' || options.plan.length === 0 || typeof options.output !== 'string' || options.output.length === 0) {
	throw new Error('--plan <fixture-plan.json> and --output <fixture-directory> are required.');
}

generateFixtureSet(path.resolve(options.plan), path.resolve(options.output));

/**
 * Builds source-branded DEB/RPM fixture packages using the production Gulp tasks and emits one
 * self-contained manifest. It never changes product branding in the checkout running this tool.
 */
export function generateFixtureSet(planPath: string, outputDirectory: string): void {
	const plan = loadPlan(planPath);
	const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
	if (samePath(outputDirectory, repositoryRoot)) {
		throw new Error(`Fixture output must not replace the live checkout: ${outputDirectory}.`);
	}
	if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length > 0) {
		throw new Error(`Fixture output directory must be empty: ${outputDirectory}.`);
	}

	fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
	fs.mkdirSync(path.join(outputDirectory, 'packages'), { recursive: true, mode: 0o700 });
	fs.mkdirSync(path.join(outputDirectory, 'provenance'), { recursive: true, mode: 0o700 });

	const fixtures: ICopilotShimFixture[] = [];
	let helperSource: string | undefined;
	for (const entry of plan.fixtures) {
		validateDisposableSource(entry, repositoryRoot);
		const product = readProduct(entry.sourceRoot);
		if (product.applicationName !== entry.identity) {
			throw new Error(`Fixture source ${entry.sourceRoot} is branded ${product.applicationName}, not the requested ${entry.identity}. Do not relabel an OSS package.`);
		}
		if (entry.identity === 'code-oss' && (entry.role !== 'oss-initial' && entry.role !== 'oss-upgrade')) {
			throw new Error(`The code-oss source can only generate OSS negative fixtures, not ${entry.role}.`);
		}
		if (entry.identity !== 'code-oss' && (entry.role === 'oss-initial' || entry.role === 'oss-upgrade')) {
			throw new Error(`Fixture ${entry.id} has an OSS role but a non-OSS identity.`);
		}

		const preparedPayload = path.resolve(entry.sourceRoot, '..', `VSCode-linux-${plan.architecture}`);
		validatePreparedPayload(entry, preparedPayload);
		const sourceHelperPath = path.join(entry.sourceRoot, 'resources', 'linux', 'copilot-link.sh');
		if (entry.role !== 'legacy-no-shim') {
			const sourceHelper = fs.readFileSync(sourceHelperPath, 'utf8');
			if (helperSource !== undefined && helperSource !== sourceHelper) {
				throw new Error(`Fixture ${entry.id} uses a different Copilot link helper from the rest of this fixture set.`);
			}
			helperSource = sourceHelper;
		}

		for (const format of entry.formats) {
			runProductionPackageTask(entry.sourceRoot, plan.architecture, format, 'prepare');
			if (entry.payloadKind === 'minimal-lifecycle') {
				minimizePreparedPackage(entry, plan.architecture, format);
			}
			if (entry.role !== 'legacy-no-shim') {
				instrumentGeneratedInstallHook(entry, plan.architecture, format);
			}
			runProductionPackageTask(entry.sourceRoot, plan.architecture, format, 'build');
			const packagePath = findBuiltPackage(entry.sourceRoot, plan.architecture, format);
			const outputPackageName = `${entry.id}.${format}.${path.basename(packagePath)}`;
			const outputPackagePath = path.join(outputDirectory, 'packages', outputPackageName);
			fs.copyFileSync(packagePath, outputPackagePath);

			const metadata = queryPackageMetadata(format, outputPackagePath);
			const fixture = createFixture(entry, format, plan.architecture, preparedPayload, metadata, outputPackageName);
			fixtures.push(fixture);
			copyRenderingProvenance(entry, format, plan.architecture, outputDirectory);
		}
	}

	if (!helperSource) {
		throw new Error('Fixture plan did not include a current Copilot shim package with the production helper.');
	}
	const helperOutputPath = path.join(outputDirectory, 'provenance', 'copilot-link.sh');
	fs.writeFileSync(helperOutputPath, helperSource, { mode: 0o644 });

	for (const format of ['deb', 'rpm'] as const) {
		fixtures.push(createForeignOwnerFixture(format, plan.architecture, plan.fixtureSetId, outputDirectory));
	}

	const manifest: ICopilotShimFixtureManifest = {
		schemaVersion: 1,
		fixtureSetId: plan.fixtureSetId,
		generatedAt: new Date().toISOString(),
		helper: {
			sourcePath: path.join('provenance', 'copilot-link.sh'),
			sha256: sha256File(helperOutputPath),
			functionName: 'vscode_copilot_link',
			templateMarker: '@@COPILOT_LINK_HELPER@@',
		},
		fixtures,
	};
	fs.writeFileSync(path.join(outputDirectory, 'copilot-shim-fixtures.json'), `${JSON.stringify(manifest, undefined, '\t')}\n`, { mode: 0o600 });
}

function loadPlan(planPath: string): IFixtureBuildPlan {
	let value: unknown;
	try {
		value = JSON.parse(fs.readFileSync(planPath, 'utf8')) as unknown;
	} catch (error) {
		throw new Error(`Unable to read fixture build plan ${planPath}: ${errorMessage(error)}`);
	}

	const record = asRecord(value, 'fixture build plan');
	if (record.schemaVersion !== 1) {
		throw new Error('Fixture build plan schemaVersion must be 1.');
	}
	const architecture = asString(record.architecture, 'architecture');
	if (architecture !== 'x64' && architecture !== 'arm64' && architecture !== 'armhf') {
		throw new Error(`Unsupported fixture build architecture: ${architecture}.`);
	}
	const entries = asArray(record.fixtures, 'fixtures').map((entry, index) => parsePlanEntry(entry, `fixtures[${index}]`));
	const plan: IFixtureBuildPlan = {
		schemaVersion: 1,
		fixtureSetId: asString(record.fixtureSetId, 'fixtureSetId'),
		architecture,
		fixtures: entries,
	};
	validatePlanMatrix(plan);
	return plan;
}

function parsePlanEntry(value: unknown, propertyPath: string): IFixtureBuildPlanEntry {
	const record = asRecord(value, propertyPath);
	const identity = asString(record.identity, `${propertyPath}.identity`);
	if (identity !== 'code' && identity !== 'code-insiders' && identity !== 'code-oss') {
		throw new Error(`${propertyPath}.identity must be code, code-insiders, or code-oss.`);
	}
	const role = asString(record.role, `${propertyPath}.role`);
	if (role !== 'initial' && role !== 'upgrade' && role !== 'legacy-no-shim' && role !== 'oss-initial' && role !== 'oss-upgrade') {
		throw new Error(`${propertyPath}.role is not a supported source-built fixture role.`);
	}
	const sourceKind = asString(record.sourceKind, `${propertyPath}.sourceKind`);
	if (sourceKind !== 'source-build' && sourceKind !== 'prepared-payload') {
		throw new Error(`${propertyPath}.sourceKind must be source-build or prepared-payload.`);
	}
	const payloadKind = asString(record.payloadKind, `${propertyPath}.payloadKind`);
	if (payloadKind !== 'complete' && payloadKind !== 'minimal-lifecycle') {
		throw new Error(`${propertyPath}.payloadKind must be complete or minimal-lifecycle.`);
	}
	const formats = asArray(record.formats, `${propertyPath}.formats`).map((format, index) => {
		const value = asString(format, `${propertyPath}.formats[${index}]`);
		if (value !== 'deb' && value !== 'rpm') {
			throw new Error(`${propertyPath}.formats[${index}] must be deb or rpm.`);
		}
		return value;
	});
	if (formats.length === 0) {
		throw new Error(`${propertyPath}.formats must not be empty.`);
	}

	return {
		id: asString(record.id, `${propertyPath}.id`),
		sourceRoot: path.resolve(asString(record.sourceRoot, `${propertyPath}.sourceRoot`)),
		sourceRevision: asString(record.sourceRevision, `${propertyPath}.sourceRevision`),
		sourceKind,
		identity,
		role,
		revisionOrdinal: asPositiveInteger(record.revisionOrdinal, `${propertyPath}.revisionOrdinal`),
		payloadKind,
		formats,
		fixtureAdjustments: asStringArray(record.fixtureAdjustments, `${propertyPath}.fixtureAdjustments`),
	};
}

function validatePlanMatrix(plan: IFixtureBuildPlan): void {
	const ids = new Set<string>();
	for (const entry of plan.fixtures) {
		if (!entry.id || ids.has(entry.id)) {
			throw new Error(`Fixture build plan id must be unique: ${entry.id || '(empty)'}.`);
		}
		ids.add(entry.id);
	}

	for (const format of ['deb', 'rpm'] as const) {
		for (const identity of ['code', 'code-insiders'] as const) {
			const initial = findPlanEntry(plan, identity, 'initial', format, 'complete');
			const upgrade = findPlanEntry(plan, identity, 'upgrade', format, 'complete');
			findPlanEntry(plan, identity, 'legacy-no-shim', format);
			if (upgrade.revisionOrdinal <= initial.revisionOrdinal) {
				throw new Error(`${format}/${identity} upgrade revisionOrdinal must be greater than the initial revisionOrdinal.`);
			}
		}
		const ossInitial = findPlanEntry(plan, 'code-oss', 'oss-initial', format);
		const ossUpgrade = findPlanEntry(plan, 'code-oss', 'oss-upgrade', format);
		if (ossUpgrade.revisionOrdinal <= ossInitial.revisionOrdinal) {
			throw new Error(`${format}/code-oss upgrade revisionOrdinal must be greater than the initial revisionOrdinal.`);
		}
	}
}

function findPlanEntry(
	plan: IFixtureBuildPlan,
	identity: IFixtureBuildPlanEntry['identity'],
	role: IFixtureBuildPlanEntry['role'],
	format: CopilotShimPackageFormat,
	payloadKind?: CopilotShimPayloadKind,
): IFixtureBuildPlanEntry {
	const entry = plan.fixtures.find(candidate => candidate.identity === identity && candidate.role === role && candidate.formats.includes(format) && (payloadKind === undefined || candidate.payloadKind === payloadKind));
	if (!entry) {
		throw new Error(`Fixture build plan is missing ${format}/${identity}/${role}.`);
	}
	return entry;
}

function validateDisposableSource(entry: IFixtureBuildPlanEntry, repositoryRoot: string): void {
	if (samePath(entry.sourceRoot, repositoryRoot)) {
		throw new Error(`Fixture ${entry.id} points at the live checkout. Use a marked disposable source/build copy instead.`);
	}
	const markerPath = path.join(entry.sourceRoot, fixtureSourceMarker);
	const marker = asRecord(JSON.parse(fs.readFileSync(markerPath, 'utf8')) as unknown, `${entry.id} source marker`);
	if (marker.purpose !== fixtureSourcePurpose || marker.disposable !== true || marker.sourceRevision !== entry.sourceRevision) {
		throw new Error(`Fixture ${entry.id} source marker must confirm a disposable source copy and the declared sourceRevision.`);
	}
	if (!fs.statSync(path.join(entry.sourceRoot, 'package.json')).isFile() || !fs.statSync(path.join(entry.sourceRoot, 'product.json')).isFile()) {
		throw new Error(`Fixture ${entry.id} sourceRoot is not a VS Code source checkout: ${entry.sourceRoot}.`);
	}
}

function readProduct(sourceRoot: string): { applicationName: string } {
	const value = asRecord(JSON.parse(fs.readFileSync(path.join(sourceRoot, 'product.json'), 'utf8')) as unknown, 'product.json');
	return { applicationName: asString(value.applicationName, 'product.json applicationName') };
}

function validatePreparedPayload(entry: IFixtureBuildPlanEntry, payloadDirectory: string): void {
	if (!fs.statSync(payloadDirectory).isDirectory()) {
		throw new Error(`Fixture ${entry.id} lacks the prepared payload expected by production Gulp tasks: ${payloadDirectory}.`);
	}
	const shimPath = path.join(payloadDirectory, 'bin', 'copilot-shim', 'copilot');
	if (entry.role === 'legacy-no-shim') {
		if (fs.existsSync(shimPath)) {
			throw new Error(`Legacy fixture ${entry.id} unexpectedly contains ${shimPath}.`);
		}
		return;
	}
	if (entry.identity === 'code-oss') {
		return;
	}
	const shim = fs.statSync(shimPath);
	if (!shim.isFile() || (shim.mode & 0o111) === 0) {
		throw new Error(`Fixture ${entry.id} must contain an executable source-built Copilot shim: ${shimPath}.`);
	}
}

function runProductionPackageTask(
	sourceRoot: string,
	architecture: IFixtureBuildPlan['architecture'],
	format: CopilotShimPackageFormat,
	phase: 'prepare' | 'build',
): void {
	const suffix = format === 'deb' ? 'deb' : 'rpm';
	runRequiredCommand('npm', ['run', 'gulp', `vscode-linux-${architecture}-${phase}-${suffix}`], sourceRoot);
}

function minimizePreparedPackage(entry: IFixtureBuildPlanEntry, architecture: IFixtureBuildPlan['architecture'], format: CopilotShimPackageFormat): void {
	const applicationRoot = format === 'deb'
		? path.join(entry.sourceRoot, '.build', 'linux', 'deb', debArchitecture(architecture), `${entry.identity}-${debArchitecture(architecture)}`, 'usr', 'share', entry.identity)
		: path.join(entry.sourceRoot, '.build', 'linux', 'rpm', rpmArchitecture(architecture), 'rpmbuild', 'BUILD', 'usr', 'share', entry.identity);
	const launcherPath = path.join(applicationRoot, 'bin', entry.identity);
	const shimPath = path.join(applicationRoot, 'bin', 'copilot-shim', 'copilot');
	const sandboxPath = path.join(applicationRoot, 'chrome-sandbox');
	const requiredPaths = entry.role === 'legacy-no-shim'
		? [launcherPath, sandboxPath]
		: [launcherPath, shimPath, sandboxPath];
	for (const requiredPath of requiredPaths) {
		if (!fs.statSync(requiredPath).isFile()) {
			throw new Error(`Cannot create minimal fixture ${entry.id}: expected production payload file ${requiredPath} is missing.`);
		}
	}

	for (const entryName of fs.readdirSync(applicationRoot)) {
		if (entryName !== 'bin' && entryName !== 'chrome-sandbox') {
			fs.rmSync(path.join(applicationRoot, entryName), { recursive: true, force: true });
		}
	}
	for (const entryName of fs.readdirSync(path.join(applicationRoot, 'bin'))) {
		if (entryName !== entry.identity && (entry.role === 'legacy-no-shim' || entryName !== 'copilot-shim')) {
			fs.rmSync(path.join(applicationRoot, 'bin', entryName), { recursive: true, force: true });
		}
	}
	if (entry.role !== 'legacy-no-shim') {
		for (const entryName of fs.readdirSync(path.join(applicationRoot, 'bin', 'copilot-shim'))) {
			if (entryName !== 'copilot') {
				fs.rmSync(path.join(applicationRoot, 'bin', 'copilot-shim', entryName), { recursive: true, force: true });
			}
		}
	}
}

function instrumentGeneratedInstallHook(entry: IFixtureBuildPlanEntry, architecture: IFixtureBuildPlan['architecture'], format: CopilotShimPackageFormat): void {
	const phase = format === 'deb' ? 'deb-postinst-configure' : 'rpm-post';
	const environmentWithDefault = '${' + copilotShimInstallHookLogEnvironmentVariable + ':-}';
	const environmentPath = '$' + copilotShimInstallHookLogEnvironmentVariable;
	const recorder = [
		`if [ -n "${environmentWithDefault}" ]; then`,
		`\tprintf '${format === 'deb' ? '%s\\t%s\\n' : '%%s\\t%%s\\n'}' '${phase}' '${entry.identity}' >> "${environmentPath}"`,
		'fi',
	].join('\n');
	const scriptPath = format === 'deb'
		? path.join(entry.sourceRoot, '.build', 'linux', 'deb', debArchitecture(architecture), `${entry.identity}-${debArchitecture(architecture)}`, 'DEBIAN', 'postinst')
		: path.join(entry.sourceRoot, '.build', 'linux', 'rpm', rpmArchitecture(architecture), 'rpmbuild', 'SPECS', `${entry.identity}.spec`);
	const installInvocation = format === 'deb'
		? `vscode_copilot_link install "${entry.identity}" || :`
		: 'vscode_copilot_link install "%{name}" || :';
	const script = fs.readFileSync(scriptPath, 'utf8');
	const firstIndex = script.indexOf(installInvocation);
	if (firstIndex < 0 || firstIndex !== script.lastIndexOf(installInvocation)) {
		throw new Error(`Fixture ${entry.id} must contain exactly one generated ${format.toUpperCase()} install hook invocation before instrumentation.`);
	}
	fs.writeFileSync(scriptPath, script.replace(installInvocation, `${recorder}\n${installInvocation}`), { mode: 0o644 });
}

function findBuiltPackage(sourceRoot: string, architecture: IFixtureBuildPlan['architecture'], format: CopilotShimPackageFormat): string {
	const directory = format === 'deb'
		? path.join(sourceRoot, '.build', 'linux', 'deb', debArchitecture(architecture), 'deb')
		: path.join(sourceRoot, '.build', 'linux', 'rpm', rpmArchitecture(architecture));
	const extension = format === 'deb' ? '.deb' : '.rpm';
	const packages = fs.readdirSync(directory, { withFileTypes: true })
		.filter(entry => entry.isFile() && entry.name.endsWith(extension))
		.map(entry => path.join(directory, entry.name));
	if (packages.length !== 1) {
		throw new Error(`Expected exactly one ${format.toUpperCase()} package in ${directory}, found ${packages.length}: ${packages.join(', ')}.`);
	}
	return packages[0];
}

function createFixture(
	entry: IFixtureBuildPlanEntry,
	format: CopilotShimPackageFormat,
	architecture: IFixtureBuildPlan['architecture'],
	preparedPayload: string,
	metadata: { packageName: string; packageVersion: string; architecture: string },
	outputPackageName: string,
): ICopilotShimFixture {
	const sourceShimPath = path.join(preparedPayload, 'bin', 'copilot-shim', 'copilot');
	const hasCopilotShim = entry.role !== 'legacy-no-shim' && fs.existsSync(sourceShimPath);
	const launcherPath = `/usr/share/${entry.identity}/bin/${entry.identity}`;
	const shimPath = hasCopilotShim
		? entry.identity === 'code' || entry.identity === 'code-insiders'
			? getCopilotShimTarget(entry.identity as 'code' | 'code-insiders')
			: `/usr/share/${entry.identity}/bin/copilot-shim/copilot`
		: undefined;

	return {
		id: `${entry.id}-${format}`,
		format,
		architecture: metadata.architecture,
		identity: entry.identity,
		role: entry.role,
		packageName: metadata.packageName,
		packageVersion: metadata.packageVersion,
		revisionOrdinal: entry.revisionOrdinal,
		packagePath: path.join('packages', outputPackageName),
		payload: {
			kind: entry.payloadKind,
			hasCopilotShim,
			launcherPath,
			shimPath,
		},
		provenance: {
			kind: entry.sourceKind,
			sourceRevision: entry.sourceRevision,
			generationCommand: `npm run gulp vscode-linux-${architecture}-prepare-${format} && npm run gulp vscode-linux-${architecture}-build-${format}`,
			templatePaths: entry.role === 'legacy-no-shim' ? [] : productionTemplatePaths,
			fixtureAdjustments: [
				...entry.fixtureAdjustments,
				...(entry.role === 'legacy-no-shim' ? [] : [copilotShimInstallHookInstrumentation]),
				...(entry.payloadKind === 'minimal-lifecycle' ? ['Trimmed only after the production prepare task, retaining the edition launcher, nested Copilot shim, and chrome-sandbox required by the generated RPM spec. This fixture does not prove full product launcher behavior.'] : []),
			],
		},
	};
}

function copyRenderingProvenance(entry: IFixtureBuildPlanEntry, format: CopilotShimPackageFormat, architecture: IFixtureBuildPlan['architecture'], outputDirectory: string): void {
	const destination = path.join(outputDirectory, 'provenance', entry.id, format);
	fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
	if (format === 'deb') {
		const source = path.join(entry.sourceRoot, '.build', 'linux', 'deb', debArchitecture(architecture), `${entry.identity}-${debArchitecture(architecture)}`, 'DEBIAN');
		for (const script of ['postinst', 'postrm']) {
			const scriptPath = path.join(source, script);
			if (fs.existsSync(scriptPath)) {
				fs.copyFileSync(scriptPath, path.join(destination, script));
			}
		}
		return;
	}

	const specPath = path.join(entry.sourceRoot, '.build', 'linux', 'rpm', rpmArchitecture(architecture), 'rpmbuild', 'SPECS', `${entry.identity}.spec`);
	if (fs.existsSync(specPath)) {
		fs.copyFileSync(specPath, path.join(destination, `${entry.identity}.spec`));
	}
}

function queryPackageMetadata(format: CopilotShimPackageFormat, packagePath: string): { packageName: string; packageVersion: string; architecture: string } {
	if (format === 'deb') {
		const result = runRequiredCommand('dpkg-deb', ['--show', `--showformat=${debPackageMetadataFormat}`, packagePath]);
		const [packageName, packageVersion, architecture] = result.stdout.trim().split(/\r?\n/u);
		if (!packageName || !packageVersion || !architecture) {
			throw new Error(`Unable to parse DEB metadata for ${packagePath}.`);
		}
		return { packageName, packageVersion, architecture };
	}

	const result = runRequiredCommand('rpm', ['-qp', '--nosignature', '--qf', '%{NAME}\n%{EPOCHNUM}:%{VERSION}-%{RELEASE}\n%{ARCH}\n', packagePath]);
	const [packageName, packageVersion, architecture] = result.stdout.trim().split(/\r?\n/u);
	if (!packageName || !packageVersion || !architecture) {
		throw new Error(`Unable to parse RPM metadata for ${packagePath}.`);
	}
	return { packageName, packageVersion, architecture };
}

function createForeignOwnerFixture(
	format: CopilotShimPackageFormat,
	architecture: IFixtureBuildPlan['architecture'],
	fixtureSetId: string,
	outputDirectory: string,
): ICopilotShimFixture {
	const outputPackageName = `foreign-copilot-owner.${format}.${format === 'deb' ? 'deb' : 'rpm'}`;
	const outputPackagePath = path.join(outputDirectory, 'packages', outputPackageName);
	const stagingRoot = path.join(outputDirectory, 'staging', `foreign-${format}`);
	fs.rmSync(stagingRoot, { recursive: true, force: true });
	fs.mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });

	if (format === 'deb') {
		const packageRoot = path.join(stagingRoot, 'package');
		fs.mkdirSync(path.join(packageRoot, 'DEBIAN'), { recursive: true, mode: 0o755 });
		fs.mkdirSync(path.join(packageRoot, 'usr', 'bin'), { recursive: true, mode: 0o755 });
		fs.writeFileSync(path.join(packageRoot, 'DEBIAN', 'control'), `Package: vscode-copilot-shim-foreign-command\nVersion: 1.0.0-1\nArchitecture: ${debArchitecture(architecture)}\nMaintainer: VS Code Fixture Harness <vscode@example.invalid>\nDescription: Test-owned foreign Copilot command\n`, { mode: 0o644 });
		fs.writeFileSync(path.join(packageRoot, 'usr', 'bin', 'copilot'), '#!/bin/sh\nprintf "%s\\n" foreign-package-copilot\n', { mode: 0o755 });
		runRequiredCommand('dpkg-deb', ['--build', packageRoot, outputPackagePath]);
	} else {
		const topDirectory = path.join(stagingRoot, 'rpmbuild');
		for (const directory of ['BUILD', 'BUILDROOT', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS']) {
			fs.mkdirSync(path.join(topDirectory, directory), { recursive: true, mode: 0o755 });
		}
		const specPath = path.join(topDirectory, 'SPECS', 'foreign-copilot-owner.spec');
		fs.writeFileSync(specPath, `Name: vscode-copilot-shim-foreign-command
Version: 1.0.0
Release: 1
Summary: Test-owned foreign Copilot command
License: MIT
BuildArch: ${rpmArchitecture(architecture)}

%description
Test-owned foreign Copilot command for package ownership preservation tests.

%install
mkdir -p %{buildroot}/usr/bin
printf '%s\\n' '#!/bin/sh' 'printf "%s\\\\n" foreign-package-copilot' > %{buildroot}/usr/bin/copilot
chmod 755 %{buildroot}/usr/bin/copilot

%files
/usr/bin/copilot
`, { mode: 0o644 });
		runRequiredCommand('rpmbuild', ['-bb', '--define', `_topdir ${topDirectory}`, '--target', rpmArchitecture(architecture), specPath]);
		const builtPath = path.join(topDirectory, 'RPMS', rpmArchitecture(architecture), 'vscode-copilot-shim-foreign-command-1.0.0-1.' + rpmArchitecture(architecture) + '.rpm');
		fs.copyFileSync(builtPath, outputPackagePath);
	}

	const metadata = queryPackageMetadata(format, outputPackagePath);
	fs.rmSync(stagingRoot, { recursive: true, force: true });
	return {
		id: `foreign-copilot-owner-${format}`,
		format,
		architecture: metadata.architecture,
		identity: 'foreign-copilot-owner',
		role: 'foreign-owner',
		packageName: metadata.packageName,
		packageVersion: metadata.packageVersion,
		revisionOrdinal: 1,
		packagePath: path.join('packages', outputPackageName),
		payload: {
			kind: 'minimal-lifecycle',
			hasCopilotShim: false,
		},
		provenance: {
			kind: 'test-owned-foreign-package',
			sourceRevision: fixtureSetId,
			generationCommand: 'test/sanity/src/generateCopilotShimFixtures.ts',
			templatePaths: [],
			fixtureAdjustments: ['Creates only a foreign /usr/bin/copilot ownership fixture; it does not reproduce VS Code package lifecycle logic.'],
		},
	};
}

function runRequiredCommand(command: string, args: readonly string[], cwd?: string): { stdout: string } {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 10 * 60 * 1000 });
	if (result.error || result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with status ${result.status ?? 'null'}: ${result.error?.message ?? commandOutput(result.stderr)}`);
	}
	return { stdout: commandOutput(result.stdout) };
}

function debArchitecture(architecture: IFixtureBuildPlan['architecture']): string {
	switch (architecture) {
		case 'x64': return 'amd64';
		case 'arm64': return 'arm64';
		case 'armhf': return 'armhf';
	}
}

function rpmArchitecture(architecture: IFixtureBuildPlan['architecture']): string {
	switch (architecture) {
		case 'x64': return 'x86_64';
		case 'arm64': return 'aarch64';
		case 'armhf': return 'armv7hl';
	}
}

function asRecord(value: unknown, description: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${description} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function asArray(value: unknown, description: string): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`${description} must be an array.`);
	}
	return value;
}

function asString(value: unknown, description: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${description} must be a non-empty string.`);
	}
	return value;
}

function asStringArray(value: unknown, description: string): readonly string[] {
	return asArray(value, description).map((item, index) => asString(item, `${description}[${index}]`));
}

function asPositiveInteger(value: unknown, description: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error(`${description} must be a positive integer.`);
	}
	return value;
}

function samePath(left: string, right: string): boolean {
	return canonicalPath(left) === canonicalPath(right);
}

function canonicalPath(filePath: string): string {
	try {
		return fs.realpathSync.native(filePath);
	} catch {
		return path.resolve(filePath);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function commandOutput(output: string | Buffer | undefined): string {
	return typeof output === 'string' ? output : output?.toString() ?? '';
}
