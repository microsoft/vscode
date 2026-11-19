/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Update this allowlist and the WorkspaceTags GDPR fragment when adding ports from https://github.com/microsoft/vcpkg/tree/master/ports or https://github.com/Azure/azure-sdk-vcpkg-betas/tree/main/ports.
const AzureCppSdkPackageNames = new Map([
	['azure-core-amqp-cpp', 'azure-core-amqp'],
	['azure-core-cpp', 'azure-core'],
	['azure-core-tracing-opentelemetry-cpp', 'azure-core-tracing-opentelemetry'],
	['azure-data-tables-cpp', 'azure-data-tables'],
	['azure-identity-cpp', 'azure-identity'],
	['azure-messaging-eventhubs-checkpointstore-blob-cpp', 'azure-messaging-eventhubs-checkpointstore-blob'],
	['azure-messaging-eventhubs-cpp', 'azure-messaging-eventhubs'],
	['azure-security-attestation-cpp', 'azure-security-attestation'],
	['azure-security-keyvault-administration-cpp', 'azure-security-keyvault-administration'],
	['azure-security-keyvault-certificates-cpp', 'azure-security-keyvault-certificates'],
	['azure-security-keyvault-keys-cpp', 'azure-security-keyvault-keys'],
	['azure-security-keyvault-secrets-cpp', 'azure-security-keyvault-secrets'],
	['azure-storage-blobs-cpp', 'azure-storage-blobs'],
	['azure-storage-common-cpp', 'azure-storage-common'],
	['azure-storage-files-datalake-cpp', 'azure-storage-files-datalake'],
	['azure-storage-files-shares-cpp', 'azure-storage-files-shares'],
	['azure-storage-queues-cpp', 'azure-storage-queues'],
]);

const AzureCppSdkBetaRegistry = 'github.com/azure/azure-sdk-vcpkg-betas';

type VcpkgDependency = string | { name?: string };

interface VcpkgManifest {
	dependencies?: VcpkgDependency[];
	'default-features'?: VcpkgDependency[];
	features?: Record<string, { dependencies?: VcpkgDependency[] }>;
	'vcpkg-configuration'?: VcpkgConfiguration;
}

interface VcpkgRegistry {
	repository?: string;
}

interface VcpkgConfiguration {
	registries?: VcpkgRegistry[];
	'default-registry'?: VcpkgRegistry | null;
}

export function getAzureCppSdkPackageNamesFromVcpkgManifest(content: string): string[] {
	try {
		const manifest = JSON.parse(content) as VcpkgManifest;
		const dependencies = Array.isArray(manifest?.dependencies) ? [...manifest.dependencies] : [];
		if (Array.isArray(manifest?.['default-features'])) {
			for (const feature of manifest['default-features']) {
				const featureName = typeof feature === 'string' ? feature : feature?.name;
				if (typeof featureName === 'string' && Object.hasOwn(manifest.features ?? {}, featureName)) {
					const featureDependencies = manifest.features?.[featureName]?.dependencies;
					if (Array.isArray(featureDependencies)) {
						dependencies.push(...featureDependencies);
					}
				}
			}
		}

		const packageNames = new Set<string>();
		for (const dependency of dependencies) {
			const dependencyName = typeof dependency === 'string' ? dependency : dependency?.name;
			if (typeof dependencyName !== 'string') {
				continue;
			}

			const packageName = AzureCppSdkPackageNames.get(dependencyName);
			if (packageName) {
				packageNames.add(packageName);
			}
		}

		return [...packageNames];
	} catch {
		return [];
	}
}

export function usesAzureCppSdkBetaRegistry(content: string): boolean {
	try {
		return hasAzureCppSdkBetaRegistry(JSON.parse(content) as VcpkgConfiguration);
	} catch {
		return false;
	}
}

export function usesAzureCppSdkBetaRegistryInVcpkgManifest(content: string): boolean {
	try {
		const manifest = JSON.parse(content) as VcpkgManifest;
		return hasAzureCppSdkBetaRegistry(manifest?.['vcpkg-configuration']);
	} catch {
		return false;
	}
}

function hasAzureCppSdkBetaRegistry(configuration: VcpkgConfiguration | null | undefined): boolean {
	const registries = Array.isArray(configuration?.registries) ? configuration.registries : [];
	return [configuration?.['default-registry'], ...registries].some(registry =>
		typeof registry?.repository === 'string' && isAzureCppSdkBetaRegistry(registry.repository)
	);
}

function isAzureCppSdkBetaRegistry(repository: string): boolean {
	const trimmed = repository.trim();
	const scpStyle = /^(?<user>[^@/:\s]+)@(?<host>[^/:\s]+):(?<path>[^?#]+)$/.exec(trimmed);
	const url = scpStyle?.groups ? `ssh://${scpStyle.groups.host}/${scpStyle.groups.path}` : trimmed;
	if (!URL.canParse(url)) {
		return false;
	}

	const parsed = new URL(url);
	const isGitHubSshOverHttps = parsed.protocol === 'ssh:' && parsed.hostname.toLowerCase() === 'ssh.github.com' && parsed.port === '443';
	if (!['https:', 'http:', 'ssh:', 'git:'].includes(parsed.protocol)
		|| (parsed.port && !(parsed.protocol === 'ssh:' && parsed.port === '22') && !isGitHubSshOverHttps)
		|| parsed.search || parsed.hash) {
		return false;
	}
	const host = isGitHubSshOverHttps ? 'github.com' : parsed.hostname.toLowerCase().replace(/^www\./, '');
	const path = parsed.pathname.toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
	return `${host}${path}` === AzureCppSdkBetaRegistry;
}
