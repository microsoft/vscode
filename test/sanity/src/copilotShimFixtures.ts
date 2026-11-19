/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

export const copilotShimTargets = {
	code: '/usr/share/code/bin/copilot-shim/copilot',
	'code-insiders': '/usr/share/code-insiders/bin/copilot-shim/copilot',
} as const;

export const debPackageMetadataFormat = '${Package}\\n${Version}\\n${Architecture}\\n';
export const copilotShimInstallHookLogEnvironmentVariable = 'VSCODE_COPILOT_SHIM_INSTALL_HOOK_LOG';
export const copilotShimInstallHookInstrumentation = 'test-only-install-hook-order';

export type CopilotShimPackageFormat = 'deb' | 'rpm';
export type CopilotShimIdentity = 'code' | 'code-insiders' | 'code-oss' | 'foreign-copilot-owner';
export type CopilotShimFixtureRole = 'initial' | 'upgrade' | 'legacy-no-shim' | 'oss-initial' | 'oss-upgrade' | 'foreign-owner';
export type CopilotShimPayloadKind = 'complete' | 'minimal-lifecycle';

export interface ICopilotShimFixturePayload {
	kind: CopilotShimPayloadKind;
	hasCopilotShim: boolean;
	launcherPath?: string;
	shimPath?: string;
}

export interface ICopilotShimFixtureProvenance {
	kind: 'source-build' | 'prepared-payload' | 'test-owned-foreign-package';
	sourceRevision: string;
	generationCommand: string;
	templatePaths: readonly string[];
	fixtureAdjustments: readonly string[];
}

export interface ICopilotShimFixture {
	id: string;
	format: CopilotShimPackageFormat;
	architecture: string;
	identity: CopilotShimIdentity;
	role: CopilotShimFixtureRole;
	packageName: string;
	packageVersion: string;
	revisionOrdinal: number;
	packagePath: string;
	payload: ICopilotShimFixturePayload;
	provenance: ICopilotShimFixtureProvenance;
}

export interface ICopilotShimHelperProvenance {
	sourcePath: string;
	sha256: string;
	functionName: 'vscode_copilot_link';
	templateMarker: '@@COPILOT_LINK_HELPER@@';
}

export interface ICopilotShimFixtureManifest {
	schemaVersion: 1;
	fixtureSetId: string;
	generatedAt: string;
	helper: ICopilotShimHelperProvenance;
	fixtures: readonly ICopilotShimFixture[];
}

const currentIdentities: readonly CopilotShimIdentity[] = ['code', 'code-insiders'];
const requiredProductionTemplatePaths = [
	'build/gulpfile.vscode.linux.ts',
	'resources/linux/copilot-link.sh',
	'resources/linux/debian/postinst.template',
	'resources/linux/debian/postrm.template',
	'resources/linux/rpm/code.spec.template',
];

/**
 * Loads and validates a fixture manifest without invoking a package manager.
 */
export function loadCopilotShimFixtureManifest(manifestPath: string): ICopilotShimFixtureManifest {
	const absoluteManifestPath = path.resolve(manifestPath);
	const manifestDirectory = path.dirname(absoluteManifestPath);
	let parsed: unknown;

	try {
		parsed = JSON.parse(fs.readFileSync(absoluteManifestPath, 'utf8')) as unknown;
	} catch (error) {
		throw new Error(`Unable to read Copilot shim fixture manifest ${absoluteManifestPath}: ${errorMessage(error)}`);
	}

	const manifest = parseManifest(parsed, manifestDirectory);
	validateFixtureManifest(manifest, absoluteManifestPath);
	return manifest;
}

/**
 * Returns the fixture selected for a package format, identity, and lifecycle role.
 */
export function getCopilotShimFixture(
	manifest: ICopilotShimFixtureManifest,
	format: CopilotShimPackageFormat,
	identity: CopilotShimIdentity,
	role: CopilotShimFixtureRole,
	preferredPayloadKind?: CopilotShimPayloadKind,
): ICopilotShimFixture {
	const candidates = manifest.fixtures.filter(fixture =>
		fixture.format === format
		&& fixture.identity === identity
		&& fixture.role === role
	);

	const fixture = preferredPayloadKind
		? candidates.find(candidate => candidate.payload.kind === preferredPayloadKind)
		: candidates.find(candidate => candidate.payload.kind === 'complete') ?? candidates[0];

	if (!fixture) {
		throw new Error(`Fixture manifest is missing ${format}/${identity}/${role}${preferredPayloadKind ? `/${preferredPayloadKind}` : ''}.`);
	}

	return fixture;
}

/**
 * Returns the smallest available fixture for lifecycle coverage, preferring minimal payloads.
 */
export function getPreferredCopilotShimLifecycleFixture(
	manifest: ICopilotShimFixtureManifest,
	format: CopilotShimPackageFormat,
	identity: CopilotShimIdentity,
	role: CopilotShimFixtureRole,
): ICopilotShimFixture {
	const candidates = manifest.fixtures.filter(fixture =>
		fixture.format === format
		&& fixture.identity === identity
		&& fixture.role === role
	);
	const fixture = candidates.find(candidate => candidate.payload.kind === 'minimal-lifecycle')
		?? candidates.find(candidate => candidate.payload.kind === 'complete')
		?? candidates[0];
	if (!fixture) {
		throw new Error(`Fixture manifest is missing ${format}/${identity}/${role}.`);
	}
	return fixture;
}

/**
 * Returns all fixtures for one package format.
 */
export function getCopilotShimFixturesForFormat(
	manifest: ICopilotShimFixtureManifest,
	format: CopilotShimPackageFormat,
): readonly ICopilotShimFixture[] {
	return manifest.fixtures.filter(fixture => fixture.format === format);
}

/**
 * Identifies a current Stable or Insiders fixture that must embed lifecycle handling.
 */
export function isCurrentCopilotShimFixture(fixture: ICopilotShimFixture): boolean {
	return (fixture.identity === 'code' || fixture.identity === 'code-insiders')
		&& (fixture.role === 'initial' || fixture.role === 'upgrade');
}

/**
 * Returns the expected nested shim path for a supported Microsoft edition.
 */
export function getCopilotShimTarget(identity: 'code' | 'code-insiders'): string {
	return copilotShimTargets[identity];
}

/**
 * Returns the SHA-256 digest of a fixture provenance file.
 */
export function sha256File(filePath: string): string {
	return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseManifest(value: unknown, manifestDirectory: string): ICopilotShimFixtureManifest {
	const record = asRecord(value, 'fixture manifest');
	const schemaVersion = asNumber(record.schemaVersion, 'schemaVersion');
	if (schemaVersion !== 1) {
		throw new Error(`Unsupported Copilot shim fixture manifest schema version: ${schemaVersion}.`);
	}

	const helperRecord = asRecord(record.helper, 'helper');
	const helper = {
		sourcePath: resolveFixturePath(asString(helperRecord.sourcePath, 'helper.sourcePath'), manifestDirectory, 'helper.sourcePath'),
		sha256: asString(helperRecord.sha256, 'helper.sha256'),
		functionName: asString(helperRecord.functionName, 'helper.functionName') as ICopilotShimHelperProvenance['functionName'],
		templateMarker: asString(helperRecord.templateMarker, 'helper.templateMarker') as ICopilotShimHelperProvenance['templateMarker'],
	};

	const fixtureValues = asArray(record.fixtures, 'fixtures');
	const fixtures = fixtureValues.map((fixtureValue, index) => parseFixture(fixtureValue, manifestDirectory, `fixtures[${index}]`));

	return {
		schemaVersion: 1,
		fixtureSetId: asString(record.fixtureSetId, 'fixtureSetId'),
		generatedAt: asString(record.generatedAt, 'generatedAt'),
		helper,
		fixtures,
	};
}

function parseFixture(value: unknown, manifestDirectory: string, propertyPath: string): ICopilotShimFixture {
	const record = asRecord(value, propertyPath);
	const payloadRecord = asRecord(record.payload, `${propertyPath}.payload`);
	const provenanceRecord = asRecord(record.provenance, `${propertyPath}.provenance`);

	const payload: ICopilotShimFixturePayload = {
		kind: asPayloadKind(asString(payloadRecord.kind, `${propertyPath}.payload.kind`)),
		hasCopilotShim: asBoolean(payloadRecord.hasCopilotShim, `${propertyPath}.payload.hasCopilotShim`),
		launcherPath: asOptionalString(payloadRecord.launcherPath, `${propertyPath}.payload.launcherPath`),
		shimPath: asOptionalString(payloadRecord.shimPath, `${propertyPath}.payload.shimPath`),
	};

	const provenance: ICopilotShimFixtureProvenance = {
		kind: asProvenanceKind(asString(provenanceRecord.kind, `${propertyPath}.provenance.kind`)),
		sourceRevision: asString(provenanceRecord.sourceRevision, `${propertyPath}.provenance.sourceRevision`),
		generationCommand: asString(provenanceRecord.generationCommand, `${propertyPath}.provenance.generationCommand`),
		templatePaths: asStringArray(provenanceRecord.templatePaths, `${propertyPath}.provenance.templatePaths`),
		fixtureAdjustments: asStringArray(provenanceRecord.fixtureAdjustments, `${propertyPath}.provenance.fixtureAdjustments`),
	};

	return {
		id: asString(record.id, `${propertyPath}.id`),
		format: asPackageFormat(asString(record.format, `${propertyPath}.format`)),
		architecture: asString(record.architecture, `${propertyPath}.architecture`),
		identity: asIdentity(asString(record.identity, `${propertyPath}.identity`)),
		role: asFixtureRole(asString(record.role, `${propertyPath}.role`)),
		packageName: asString(record.packageName, `${propertyPath}.packageName`),
		packageVersion: asString(record.packageVersion, `${propertyPath}.packageVersion`),
		revisionOrdinal: asPositiveInteger(record.revisionOrdinal, `${propertyPath}.revisionOrdinal`),
		packagePath: resolveFixturePath(asString(record.packagePath, `${propertyPath}.packagePath`), manifestDirectory, `${propertyPath}.packagePath`),
		payload,
		provenance,
	};
}

function validateFixtureManifest(manifest: ICopilotShimFixtureManifest, manifestPath: string): void {
	if (!manifest.fixtureSetId || manifest.fixtureSetId.includes('@@')) {
		throw new Error('fixtureSetId must be a non-placeholder value.');
	}
	if (Number.isNaN(Date.parse(manifest.generatedAt))) {
		throw new Error(`Fixture manifest generatedAt is not an ISO date: ${manifest.generatedAt}.`);
	}
	if (manifest.helper.functionName !== 'vscode_copilot_link') {
		throw new Error(`Fixture helper function must be vscode_copilot_link, got ${manifest.helper.functionName}.`);
	}
	if (manifest.helper.templateMarker !== '@@COPILOT_LINK_HELPER@@') {
		throw new Error(`Fixture helper marker must be @@COPILOT_LINK_HELPER@@, got ${manifest.helper.templateMarker}.`);
	}
	if (!/^[a-f0-9]{64}$/i.test(manifest.helper.sha256)) {
		throw new Error('Fixture helper SHA-256 must be a 64-character hexadecimal digest.');
	}
	if (!fs.statSync(manifest.helper.sourcePath).isFile()) {
		throw new Error(`Fixture helper source is not a file: ${manifest.helper.sourcePath}.`);
	}
	if (sha256File(manifest.helper.sourcePath) !== manifest.helper.sha256) {
		throw new Error(`Fixture helper digest does not match manifest provenance: ${manifest.helper.sourcePath}.`);
	}
	if (manifest.fixtures.length === 0) {
		throw new Error('Fixture manifest contains no fixtures.');
	}

	const fixtureIds = new Set<string>();
	const packagePaths = new Set<string>();
	for (const fixture of manifest.fixtures) {
		if (!fixture.id || fixture.id.includes('@@') || fixtureIds.has(fixture.id)) {
			throw new Error(`Fixture id must be unique and resolved: ${fixture.id || '(empty)'}.`);
		}
		fixtureIds.add(fixture.id);

		if (fixture.packagePath.includes('@@') || packagePaths.has(fixture.packagePath)) {
			throw new Error(`Fixture package path must be unique and resolved: ${fixture.packagePath}.`);
		}
		packagePaths.add(fixture.packagePath);
		if (!fs.statSync(fixture.packagePath).isFile()) {
			throw new Error(`Fixture package does not exist or is not a file: ${fixture.packagePath}.`);
		}

		if (fixture.identity === 'code' || fixture.identity === 'code-insiders' || fixture.identity === 'code-oss') {
			if (fixture.packageName !== fixture.identity) {
				throw new Error(`Fixture ${fixture.id} packageName must match its branded identity ${fixture.identity}, got ${fixture.packageName}.`);
			}
		}
		if (!fixture.packageVersion || fixture.packageVersion.includes('@@')) {
			throw new Error(`Fixture ${fixture.id} has an unresolved packageVersion.`);
		}
		if (!fixture.provenance.sourceRevision || fixture.provenance.sourceRevision.includes('@@')) {
			throw new Error(`Fixture ${fixture.id} has unresolved source provenance.`);
		}
		if ((fixture.provenance.kind === 'source-build' || fixture.provenance.kind === 'prepared-payload') && fixture.role !== 'legacy-no-shim') {
			for (const templatePath of requiredProductionTemplatePaths) {
				if (!fixture.provenance.templatePaths.includes(templatePath)) {
					throw new Error(`Fixture ${fixture.id} did not record the production template ${templatePath}.`);
				}
			}
		}
		validateFixturePayload(fixture);
	}

	for (const format of ['deb', 'rpm'] as const) {
		validateFormatMatrix(manifest, format);
	}

	if (!path.isAbsolute(manifestPath)) {
		throw new Error(`Fixture manifest path must be absolute after loading: ${manifestPath}.`);
	}
}

function validateFixturePayload(fixture: ICopilotShimFixture): void {
	if (isCurrentCopilotShimFixture(fixture)) {
		if (!fixture.payload.hasCopilotShim || !fixture.payload.shimPath || !fixture.payload.launcherPath) {
			throw new Error(`Current fixture ${fixture.id} must declare an executable shim and edition launcher.`);
		}
	}

	if (fixture.role === 'legacy-no-shim' && fixture.payload.hasCopilotShim) {
		throw new Error(`Legacy fixture ${fixture.id} must not claim to include a Copilot shim.`);
	}
	if ((fixture.role === 'oss-initial' || fixture.role === 'oss-upgrade') && fixture.identity !== 'code-oss') {
		throw new Error(`OSS fixture ${fixture.id} must use the code-oss identity.`);
	}
	if (fixture.role === 'foreign-owner' && fixture.identity !== 'foreign-copilot-owner') {
		throw new Error(`Foreign-owner fixture ${fixture.id} must use the foreign-copilot-owner identity.`);
	}
}

function validateFormatMatrix(manifest: ICopilotShimFixtureManifest, format: CopilotShimPackageFormat): void {
	const fixtures = manifest.fixtures.filter(fixture => fixture.format === format);
	if (fixtures.length === 0) {
		throw new Error(`Fixture manifest ${manifest.fixtureSetId} is missing the required ${format.toUpperCase()} fixture set.`);
	}

	for (const identity of currentIdentities) {
		getPreferredCopilotShimLifecycleFixture(manifest, format, identity, 'legacy-no-shim');
		validateUpgradePair(manifest, format, identity, 'initial', 'upgrade', 'complete', true);
		validateUpgradePair(manifest, format, identity, 'initial', 'upgrade', 'minimal-lifecycle', false);
	}
	const hasOssFixturePair = (['complete', 'minimal-lifecycle'] as const)
		.map(payloadKind => validateUpgradePair(manifest, format, 'code-oss', 'oss-initial', 'oss-upgrade', payloadKind, false))
		.some(Boolean);
	if (!hasOssFixturePair) {
		throw new Error(`Fixture manifest ${manifest.fixtureSetId} is missing an ${format}/code-oss initial and upgrade fixture pair.`);
	}
	getCopilotShimFixture(manifest, format, 'foreign-copilot-owner', 'foreign-owner');
}

function validateUpgradePair(
	manifest: ICopilotShimFixtureManifest,
	format: CopilotShimPackageFormat,
	identity: CopilotShimIdentity,
	initialRole: CopilotShimFixtureRole,
	upgradeRole: CopilotShimFixtureRole,
	payloadKind: CopilotShimPayloadKind,
	required: boolean,
): boolean {
	const initial = manifest.fixtures.find(fixture => fixture.format === format && fixture.identity === identity && fixture.role === initialRole && fixture.payload.kind === payloadKind);
	const upgrade = manifest.fixtures.find(fixture => fixture.format === format && fixture.identity === identity && fixture.role === upgradeRole && fixture.payload.kind === payloadKind);
	if (!initial && !upgrade) {
		if (required) {
			throw new Error(`Fixture manifest ${manifest.fixtureSetId} is missing the required ${format}/${identity}/${initialRole}/${payloadKind} and ${upgradeRole}/${payloadKind} pair.`);
		}
		return false;
	}
	if (!initial || !upgrade) {
		throw new Error(`Fixture manifest ${manifest.fixtureSetId} must provide both ${format}/${identity}/${initialRole}/${payloadKind} and ${upgradeRole}/${payloadKind}.`);
	}
	if (upgrade.revisionOrdinal <= initial.revisionOrdinal || upgrade.packageVersion === initial.packageVersion) {
		throw new Error(`Fixture ${format}/${identity}/${payloadKind} upgrade must have a strictly higher declared revision than its initial fixture.`);
	}
	return true;
}

function asPackageFormat(value: string): CopilotShimPackageFormat {
	if (value === 'deb' || value === 'rpm') {
		return value;
	}
	throw new Error(`Unsupported package format: ${value}.`);
}

function asIdentity(value: string): CopilotShimIdentity {
	if (value === 'code' || value === 'code-insiders' || value === 'code-oss' || value === 'foreign-copilot-owner') {
		return value;
	}
	throw new Error(`Unsupported fixture identity: ${value}.`);
}

function asFixtureRole(value: string): CopilotShimFixtureRole {
	if (value === 'initial' || value === 'upgrade' || value === 'legacy-no-shim' || value === 'oss-initial' || value === 'oss-upgrade' || value === 'foreign-owner') {
		return value;
	}
	throw new Error(`Unsupported fixture role: ${value}.`);
}

function asPayloadKind(value: string): CopilotShimPayloadKind {
	if (value === 'complete' || value === 'minimal-lifecycle') {
		return value;
	}
	throw new Error(`Unsupported fixture payload kind: ${value}.`);
}

function asProvenanceKind(value: string): ICopilotShimFixtureProvenance['kind'] {
	if (value === 'source-build' || value === 'prepared-payload' || value === 'test-owned-foreign-package') {
		return value;
	}
	throw new Error(`Unsupported fixture provenance kind: ${value}.`);
}

function asRecord(value: unknown, propertyPath: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${propertyPath} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function asArray(value: unknown, propertyPath: string): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`${propertyPath} must be an array.`);
	}
	return value;
}

function asString(value: unknown, propertyPath: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${propertyPath} must be a non-empty string.`);
	}
	return value;
}

function asOptionalString(value: unknown, propertyPath: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return asString(value, propertyPath);
}

function asStringArray(value: unknown, propertyPath: string): readonly string[] {
	return asArray(value, propertyPath).map((item, index) => asString(item, `${propertyPath}[${index}]`));
}

function asNumber(value: unknown, propertyPath: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`${propertyPath} must be a finite number.`);
	}
	return value;
}

function asPositiveInteger(value: unknown, propertyPath: string): number {
	const number = asNumber(value, propertyPath);
	if (!Number.isInteger(number) || number < 1) {
		throw new Error(`${propertyPath} must be a positive integer.`);
	}
	return number;
}

function asBoolean(value: unknown, propertyPath: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`${propertyPath} must be a boolean.`);
	}
	return value;
}

function resolveFixturePath(value: string, manifestDirectory: string, propertyPath: string): string {
	const resolved = path.resolve(manifestDirectory, value);
	const relativePath = path.relative(manifestDirectory, resolved);
	if (relativePath === '' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		throw new Error(`${propertyPath} must point to a file below the fixture manifest directory.`);
	}
	return resolved;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
