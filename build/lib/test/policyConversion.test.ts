/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import type { ExportedPolicyDataDto, CategoryDto } from '../policies/policyDto.ts';
import { BooleanPolicy } from '../policies/booleanPolicy.ts';
import { NumberPolicy } from '../policies/numberPolicy.ts';
import { ObjectPolicy } from '../policies/objectPolicy.ts';
import { StringEnumPolicy } from '../policies/stringEnumPolicy.ts';
import { StringPolicy } from '../policies/stringPolicy.ts';
import type { Policy, ProductJson } from '../policies/types.ts';
import { renderGP, renderMacOSPolicy, renderJsonPolicies } from '../policies/render.ts';

const PolicyTypes = [
	BooleanPolicy,
	NumberPolicy,
	StringEnumPolicy,
	StringPolicy,
	ObjectPolicy
];

function parsePolicies(policyData: ExportedPolicyDataDto): Policy[] {
	const categories = new Map<string, CategoryDto>();
	for (const category of policyData.categories) {
		categories.set(category.key, category);
	}

	const policies: Policy[] = [];
	for (const policy of policyData.policies) {
		const category = categories.get(policy.category);
		if (!category) {
			throw new Error(`Unknown category: ${policy.category}`);
		}

		let result: Policy | undefined;
		for (const policyType of PolicyTypes) {
			if (result = policyType.from(category, policy)) {
				break;
			}
		}

		if (!result) {
			throw new Error(`Unsupported policy type: ${policy.type} for policy ${policy.name}`);
		}

		policies.push(result);
	}

	// Sort policies first by category name, then by policy name
	policies.sort((a, b) => {
		const categoryCompare = a.category.name.value.localeCompare(b.category.name.value);
		if (categoryCompare !== 0) {
			return categoryCompare;
		}
		return a.name.localeCompare(b.name);
	});

	return policies;
}

/**
 * This is a snapshot of the data taken on Oct. 20 2025 as part of the
 * policy refactor effort. Let's make sure that nothing has regressed.
 */
const policies: ExportedPolicyDataDto = {
	categories: [
		{
			key: 'Extensions',
			name: {
				key: 'extensionsConfigurationTitle',
				value: 'Extensions'
			}
		},
		{
			key: 'IntegratedTerminal',
			name: {
				key: 'terminalIntegratedConfigurationTitle',
				value: 'Integrated Terminal'
			}
		},
		{
			key: 'InteractiveSession',
			name: {
				key: 'interactiveSessionConfigurationTitle',
				value: 'Chat'
			}
		},
		{
			key: 'Telemetry',
			name: {
				key: 'telemetryConfigurationTitle',
				value: 'Telemetry'
			}
		},
		{
			key: 'Update',
			name: {
				key: 'updateConfigurationTitle',
				value: 'Update'
			}
		}
	],
	policies: [
		{
			key: 'chat.mcp.gallery.serviceUrl',
			name: 'McpGalleryServiceUrl',
			category: 'InteractiveSession',
			minimumVersion: '1.101',
			localization: {
				description: {
					key: 'mcp.gallery.serviceUrl',
					value: 'Configure the MCP Gallery service URL to connect to'
				}
			},
			type: 'string',
			default: ''
		},
		{
			key: 'extensions.gallery.serviceUrl',
			name: 'ExtensionGalleryServiceUrl',
			category: 'Extensions',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'extensions.gallery.serviceUrl',
					value: 'Configure the Marketplace service URL to connect to'
				}
			},
			type: 'string',
			default: ''
		},
		{
			key: 'extensions.allowed',
			name: 'AllowedExtensions',
			category: 'Extensions',
			minimumVersion: '1.96',
			localization: {
				description: {
					key: 'extensions.allowed.policy',
					value: 'Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. More information: https://code.visualstudio.com/docs/setup/enterprise#_configure-allowed-extensions'
				}
			},
			type: 'object',
			default: '*'
		},
		{
			key: 'chat.tools.global.autoApprove',
			name: 'ChatToolsAutoApprove',
			category: 'InteractiveSession',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'autoApprove2.description',
					value: 'Global auto approve also known as "YOLO mode" disables manual approval completely for all tools in all workspaces, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like Codespaces and Dev Containers have user keys forwarded into the container that could be compromised.\n\nThis feature disables critical security protections and makes it much easier for an attacker to compromise the machine.'
				}
			},
			type: 'boolean',
			default: false
		},
		{
			key: 'chat.mcp.access',
			name: 'ChatMCP',
			category: 'InteractiveSession',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'chat.mcp.access',
					value: 'Controls access to installed Model Context Protocol servers.'
				},
				enumDescriptions: [
					{
						key: 'chat.mcp.access.none',
						value: 'No access to MCP servers.'
					},
					{
						key: 'chat.mcp.access.registry',
						value: 'Allows access to MCP servers installed from the registry that VS Code is connected to.'
					},
					{
						key: 'chat.mcp.access.any',
						value: 'Allow access to any installed MCP server.'
					}
				]
			},
			type: 'string',
			default: 'all',
			enum: [
				'none',
				'registry',
				'all'
			]
		},
		{
			key: 'chat.extensionTools.enabled',
			name: 'ChatAgentExtensionTools',
			category: 'InteractiveSession',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'chat.extensionToolsEnabled',
					value: 'Enable using tools contributed by third-party extensions.'
				}
			},
			type: 'boolean',
			default: true
		},
		{
			key: 'chat.agent.enabled',
			name: 'ChatAgentMode',
			category: 'InteractiveSession',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'chat.agent.enabled.description',
					value: 'Enable agent mode for chat. When this is enabled, agent mode can be activated via the dropdown in the view.'
				}
			},
			type: 'boolean',
			default: true
		},
		{
			key: 'chat.promptFiles',
			name: 'ChatPromptFiles',
			category: 'InteractiveSession',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'chat.promptFiles.policy',
					value: 'Enables reusable prompt and instruction files in Chat sessions.'
				}
			},
			type: 'boolean',
			default: true
		},
		{
			key: 'chat.tools.terminal.enableAutoApprove',
			name: 'ChatToolsTerminalEnableAutoApprove',
			category: 'IntegratedTerminal',
			minimumVersion: '1.104',
			localization: {
				description: {
					key: 'autoApproveMode.description',
					value: 'Controls whether to allow auto approval in the run in terminal tool.'
				}
			},
			type: 'boolean',
			default: true
		},
		{
			key: 'update.mode',
			name: 'UpdateMode',
			category: 'Update',
			minimumVersion: '1.67',
			localization: {
				description: {
					key: 'updateMode',
					value: 'Configure whether you receive automatic updates. Requires a restart after change. The updates are fetched from a Microsoft online service.'
				},
				enumDescriptions: [
					{
						key: 'none',
						value: 'Disable updates.'
					},
					{
						key: 'manual',
						value: 'Disable automatic background update checks. Updates will be available if you manually check for updates.'
					},
					{
						key: 'start',
						value: 'Check for updates only on startup. Disable automatic background update checks.'
					},
					{
						key: 'default',
						value: 'Enable automatic update checks. Code will check for updates automatically and periodically.'
					}
				]
			},
			type: 'string',
			default: 'default',
			enum: [
				'none',
				'manual',
				'start',
				'default'
			]
		},
		{
			key: 'telemetry.telemetryLevel',
			name: 'TelemetryLevel',
			category: 'Telemetry',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'telemetry.telemetryLevel.policyDescription',
					value: 'Controls the level of telemetry.'
				},
				enumDescriptions: [
					{
						key: 'telemetry.telemetryLevel.default',
						value: 'Sends usage data, errors, and crash reports.'
					},
					{
						key: 'telemetry.telemetryLevel.error',
						value: 'Sends general error telemetry and crash reports.'
					},
					{
						key: 'telemetry.telemetryLevel.crash',
						value: 'Sends OS level crash reports.'
					},
					{
						key: 'telemetry.telemetryLevel.off',
						value: 'Disables all product telemetry.'
					}
				]
			},
			type: 'string',
			default: 'all',
			enum: [
				'all',
				'error',
				'crash',
				'off'
			]
		},
		{
			key: 'telemetry.feedback.enabled',
			name: 'EnableFeedback',
			category: 'Telemetry',
			minimumVersion: '1.99',
			localization: {
				description: {
					key: 'telemetry.feedback.enabled',
					value: 'Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options.'
				}
			},
			type: 'boolean',
			default: true
		}
	]
};

const mockProduct: ProductJson = {
	nameLong: 'Code - OSS',
	darwinBundleIdentifier: 'com.visualstudio.code.oss',
	darwinProfilePayloadUUID: 'CF808BE7-53F3-46C6-A7E2-7EDB98A5E959',
	darwinProfileUUID: '47827DD9-4734-49A0-AF80-7E19B11495CC',
	win32RegValueName: 'CodeOSS'
};

const frenchTranslations = [
	{
		languageId: 'fr-fr',
		languageTranslations: {
			'': {
				'interactiveSessionConfigurationTitle': 'Session interactive',
				'extensionsConfigurationTitle': 'Extensions',
				'terminalIntegratedConfigurationTitle': 'Terminal intégré',
				'telemetryConfigurationTitle': 'Télémétrie',
				'updateConfigurationTitle': 'Mettre à jour',
				'chat.extensionToolsEnabled': 'Autorisez l’utilisation d’outils fournis par des extensions tierces.',
				'chat.agent.enabled.description': 'Activez le mode Assistant pour la conversation. Lorsque cette option est activée, le mode Assistant peut être activé via la liste déroulante de la vue.',
				'chat.mcp.access': 'Contrôle l’accès aux serveurs de protocole de contexte du modèle.',
				'chat.mcp.access.none': 'Aucun accès aux serveurs MCP.',
				'chat.mcp.access.registry': `Autorise l’accès aux serveurs MCP installés à partir du registre auquel VS Code est connecté.`,
				'chat.mcp.access.any': 'Autorisez l’accès à tout serveur MCP installé.',
				'chat.promptFiles.policy': 'Active les fichiers d’instruction et de requête réutilisables dans les sessions Conversation.',
				'autoApprove2.description': `L’approbation automatique globale, également appelée « mode YOLO », désactive complètement l’approbation manuelle pour tous les outils dans tous les espaces de travail, permettant à l’agent d’agir de manière totalement autonome. Ceci est extrêmement dangereux et est *jamais* recommandé, même dans des environnements conteneurisés comme [Codespaces](https://github.com/features/codespaces) et [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers), où des clés utilisateur sont transférées dans le conteneur et pourraient être compromises.

Cette fonctionnalité désactive [les protections de sécurité critiques](https://code.visualstudio.com/docs/copilot/security) et facilite considérablement la compromission de la machine par un attaquant.`,
				'mcp.gallery.serviceUrl': 'Configurer l’URL du service de la galerie MCP à laquelle se connecter',
				'extensions.allowed.policy': 'Spécifiez une liste d’extensions autorisées. Cela permet de maintenir un environnement de développement sécurisé et cohérent en limitant l’utilisation d’extensions non autorisées. Plus d’informations : https://code.visualstudio.com/docs/setup/enterprise#_configure-allowed-extensions',
				'extensions.gallery.serviceUrl': 'Configurer l’URL du service Place de marché à laquelle se connecter',
				'autoApproveMode.description': 'Contrôle s’il faut autoriser l’approbation automatique lors de l’exécution dans l’outil terminal.',
				'telemetry.feedback.enabled': 'Activez les mécanismes de commentaires tels que le système de rapport de problèmes, les sondages et autres options de commentaires.',
				'telemetry.telemetryLevel.policyDescription': 'Contrôle le niveau de télémétrie.',
				'telemetry.telemetryLevel.default': `Envoie les données d'utilisation, les erreurs et les rapports d'erreur.`,
				'telemetry.telemetryLevel.error': `Envoie la télémétrie d'erreur générale et les rapports de plantage.`,
				'telemetry.telemetryLevel.crash': `Envoie des rapports de plantage au niveau du système d'exploitation.`,
				'telemetry.telemetryLevel.off': 'Désactive toutes les données de télémétrie du produit.',
				'updateMode': `Choisissez si vous voulez recevoir des mises à jour automatiques. Nécessite un redémarrage après le changement. Les mises à jour sont récupérées auprès d'un service en ligne Microsoft.`,
				'none': 'Aucun',
				'manual': 'Désactivez la recherche de mises à jour automatique en arrière-plan. Les mises à jour sont disponibles si vous les rechercher manuellement.',
				'start': 'Démarrer',
				'default': 'Système'
			}
		}
	}
];

suite('Policy E2E conversion', () => {

	test('should render macOS policy profile from policies list', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderMacOSPolicy(mockProduct, parsedPolicies, []);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'darwin', 'com.visualstudio.code.oss.mobileconfig');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');

		// Compare the rendered profile with the fixture
		assert.strictEqual(result.profile, expectedContent, 'macOS policy profile should match the fixture');
	});

	test('should render macOS manifest from policies list', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderMacOSPolicy(mockProduct, parsedPolicies, []);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'darwin', 'en-us', 'com.visualstudio.code.oss.plist');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');

		// Find the en-us manifest
		const enUsManifest = result.manifests.find(m => m.languageId === 'en-us');
		assert.ok(enUsManifest, 'en-us manifest should exist');

		// Compare the rendered manifest with the fixture, ignoring the timestamp
		// The pfm_last_modified field contains a timestamp that will differ each time
		const normalizeTimestamp = (content: string) => content.replace(/<date>.*?<\/date>/, '<date>TIMESTAMP</date>');
		assert.strictEqual(
			normalizeTimestamp(enUsManifest.contents),
			normalizeTimestamp(expectedContent),
			'macOS manifest should match the fixture (ignoring timestamp)'
		);
	});

	test('should render Windows ADMX from policies list', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderGP(mockProduct, parsedPolicies, []);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'win32', 'CodeOSS.admx');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');

		// Compare the rendered ADMX with the fixture
		assert.strictEqual(result.admx, expectedContent, 'Windows ADMX should match the fixture');
	});

	test('should render Windows ADML from policies list', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderGP(mockProduct, parsedPolicies, []);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'win32', 'en-us', 'CodeOSS.adml');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');

		// Find the en-us ADML
		const enUsAdml = result.adml.find(a => a.languageId === 'en-us');
		assert.ok(enUsAdml, 'en-us ADML should exist');

		// Compare the rendered ADML with the fixture
		assert.strictEqual(enUsAdml.contents, expectedContent, 'Windows ADML should match the fixture');
	});

	test('should render macOS manifest with fr-fr locale', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderMacOSPolicy(mockProduct, parsedPolicies, frenchTranslations);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'darwin', 'fr-fr', 'com.visualstudio.code.oss.plist');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');

		// Find the fr-fr manifest
		const frFrManifest = result.manifests.find(m => m.languageId === 'fr-fr');
		assert.ok(frFrManifest, 'fr-fr manifest should exist');

		// Compare the rendered manifest with the fixture, ignoring the timestamp
		const normalizeTimestamp = (content: string) => content.replace(/<date>.*?<\/date>/, '<date>TIMESTAMP</date>');
		assert.strictEqual(
			normalizeTimestamp(frFrManifest.contents),
			normalizeTimestamp(expectedContent),
			'macOS fr-fr manifest should match the fixture (ignoring timestamp)'
		);
	});

	test('should render Windows ADML with fr-fr locale', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderGP(mockProduct, parsedPolicies, frenchTranslations);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'win32', 'fr-fr', 'CodeOSS.adml');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');

		// Find the fr-fr ADML
		const frFrAdml = result.adml.find(a => a.languageId === 'fr-fr');
		assert.ok(frFrAdml, 'fr-fr ADML should exist');

		// Compare the rendered ADML with the fixture
		assert.strictEqual(frFrAdml.contents, expectedContent, 'Windows fr-fr ADML should match the fixture');
	});

	test('should render Linux policy JSON from policies list', async () => {
		const parsedPolicies = parsePolicies(policies);
		const result = renderJsonPolicies(parsedPolicies);

		// Load the expected fixture file
		const fixturePath = path.join(import.meta.dirname, 'fixtures', 'policies', 'linux', 'policy.json');
		const expectedContent = await fs.readFile(fixturePath, 'utf-8');
		const expectedJson = JSON.parse(expectedContent);

		// Compare the rendered JSON with the fixture
		assert.deepStrictEqual(result, expectedJson, 'Linux policy JSON should match the fixture');
	});

});
