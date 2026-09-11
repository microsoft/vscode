/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const AzureCppSdkPackageNames = new Map([
	['azure-core-amqp-cpp', 'azure-core-amqp'],
	['azure-core-cpp', 'azure-core'],
	['azure-core-tracing-opentelemetry-cpp', 'azure-core-tracing-opentelemetry'],
	['azure-data-appconfiguration-cpp', 'azure-data-appconfiguration'],
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

const AzureCppSdkBetaRegistry = 'https://github.com/azure/azure-sdk-vcpkg-betas';

type VcpkgDependency = string | { name?: string };

interface VcpkgManifest {
	dependencies?: VcpkgDependency[];
}

interface VcpkgRegistry {
	repository?: string;
}

interface VcpkgConfiguration {
	registries?: VcpkgRegistry[];
}

export function getAzureCppSdkPackageNamesFromVcpkgManifest(content: string): string[] {
	try {
		const manifest = JSON.parse(content) as VcpkgManifest;
		if (!Array.isArray(manifest.dependencies)) {
			return [];
		}

		const packageNames = new Set<string>();
		for (const dependency of manifest.dependencies) {
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
		const configuration = JSON.parse(content) as VcpkgConfiguration;
		if (!Array.isArray(configuration.registries)) {
			return false;
		}

		return configuration.registries.some(registry =>
			typeof registry?.repository === 'string'
			&& normalizeRepositoryUrl(registry.repository) === AzureCppSdkBetaRegistry
		);
	} catch {
		return false;
	}
}

function normalizeRepositoryUrl(repository: string): string {
	return repository.trim().toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
}
