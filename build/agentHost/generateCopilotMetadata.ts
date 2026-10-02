/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { compile, type JSONSchema } from 'json-schema-to-typescript';

interface Contract {
	typeName: string;
	schema: string;
}

interface SpecPin {
	sourceRepository: string;
	sourceCommit: string;
	sourcePath: string;
}

interface PortableSchema extends JSONSchema {
	$id: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputFile = resolve(repositoryRoot, 'src/vs/platform/agentHost/common/meta/copilotd/generated/copilotdMetadata.ts');
const contracts: readonly Contract[] = [
	{ typeName: 'CopilotErrorDetail', schema: 'error-info.copilot.errorDetail.schema.json' },
	{ typeName: 'CopilotModelPickerCategory', schema: 'model-info.copilot.modelPickerCategory.schema.json' },
	{ typeName: 'CopilotUsageDetail', schema: 'usage-info.copilot.usageDetail.schema.json' },
	{ typeName: 'CopilotUsageInfo', schema: 'session-meta.copilot.usageInfo.schema.json' },
	{ typeName: 'CopilotModelCallFailure', schema: 'session-meta.copilot.modelCallFailure.schema.json' },
	{ typeName: 'CopilotAutoTierSwitchFailure', schema: 'session-meta.copilot.autoTierSwitchFailure.schema.json' },
	{ typeName: 'CopilotContext', schema: 'session-meta.copilot.context.schema.json' },
	{ typeName: 'CopilotAttachmentDetail', schema: 'message-attachment.copilot.attachmentDetail.schema.json' },
	{ typeName: 'CopilotSource', schema: 'user-message.copilot.source.schema.json' },
	{ typeName: 'CopilotVisibility', schema: 'user-message.copilot.visibility.schema.json' },
	{ typeName: 'CopilotToolOrigin', schema: 'tool-definition.copilot.toolOrigin.schema.json' },
	{ typeName: 'CopilotToolTelemetry', schema: 'tool-call.copilot.toolTelemetry.schema.json' },
	{ typeName: 'CopilotToolOutputDelta', schema: 'tool-call-delta.copilot.toolOutputDelta.schema.json' },
	{ typeName: 'CopilotToolDefer', schema: 'tool-definition.copilot.toolDefer.schema.json' },
	{ typeName: 'CopilotToolAvailability', schema: 'tool-definition.copilot.toolAvailability.schema.json' },
];

async function generate(sourceRoot: string): Promise<string> {
	const pin: SpecPin = JSON.parse(readFileSync(resolve(repositoryRoot, 'build/agentHost/copilotd-source.json'), 'utf8'));
	if (!/^[a-f\d]{40}$/.test(pin.sourceCommit)) {
		throw new Error('Copilot metadata sourceCommit must be a full Git commit SHA.');
	}

	// Pre-flight check: Verify git repository and commit reachability early
	try {
		execFileSync('git', ['-C', sourceRoot, 'rev-parse', '--verify', `${pin.sourceCommit}^{commit}`], { encoding: 'utf8' });
	} catch {
		throw new Error(`Invalid Git repository path or commit SHA ${pin.sourceCommit} not found in ${sourceRoot}.`);
	}

	const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
	const require = createRequire(import.meta.url);
	const generatorPackage = JSON.parse(readFileSync(require.resolve('json-schema-to-typescript/package.json'), 'utf8'));
	if (packageJson.devDependencies['json-schema-to-typescript'] !== generatorPackage.version) {
		throw new Error('Copilot metadata generator version must match the exact version in package.json.');
	}

	const schemas = new Map<string, PortableSchema>();
	const localReferences = new Map<string, string>();
	const typeNames = new Set<string>();
	for (const contract of contracts) {
		if (schemas.has(contract.schema) || typeNames.has(contract.typeName)) {
			throw new Error(`Duplicate Copilot metadata schema or type name: ${contract.schema}.`);
		}
		typeNames.add(contract.typeName);
		const schemaPath = `${pin.sourcePath}/schemas/${contract.schema}`;
		const schema: PortableSchema = JSON.parse(execFileSync('git', ['-C', sourceRoot, 'show', `${pin.sourceCommit}:${schemaPath}`], { encoding: 'utf8' }));
		if (typeof schema.$id !== 'string' \vert{}\vert{} localReferences.has(schema.$id)) {
			throw new Error(`Copilot schema has a missing or duplicate $id: ${contract.schema}.`);
		}
		schema.title = contract.typeName;
		schemas.set(contract.schema, schema);
		const schemaFile = resolve(sourceRoot, schemaPath);
		const content = JSON.stringify(schema);
		localReferences.set(schema.$id, content);
		localReferences.set(schemaFile.replace(/\\/g, '/'), content);
		localReferences.set(pathToFileURL(schemaFile).href, content);
	}

	const declarations: string[] = [];
	for (const contract of contracts) {
		const schema = schemas.get(contract.schema);
		if (!schema) {
			throw new Error(`Copilot schema was not loaded: ${contract.schema}.`);
		}
		declarations.push((await compile(schema, contract.typeName, {
			bannerComment: '',
			cwd: resolve(sourceRoot, pin.sourcePath, 'schemas'),
			unknownAny: true,
			style: {
				useTabs: true,
				tabWidth: 4,
				singleQuote: true,
				trailingComma: 'none',
				bracketSpacing: true,
				printWidth: 140
			},
			$refOptions: {
				resolve: {
					file: false,
					http: false,
					pinned: {
						order: 1,
						canRead: true,
						read: (file: { url: string }) => {
							const content = localReferences.get(file.url);
							if (content === undefined) {
								throw new Error(`Unpinned Copilot schema reference: ${file.url}. Network resolution is disabled.`);
							}
							return content;
						}
					}
				}
			}
		})).trim().replace(/\/\*\*[\s\S]*?\*\//g, comment => comment.replace(/[\u2013\u2014]/g, '-')));
	}

	return `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Metadata schema descriptions: Copyright GitHub, Inc.
// AUTO-GENERATED by json-schema-to-typescript ${generatorPackage.version}. Do not edit.
// Source: ${pin.sourceRepository} at ${pin.sourceCommit}
// Schemas: ${pin.sourcePath}/schemas (MIT; see build/agentHost/README.md).
// Regenerate: npm run agent-host:generate-copilot-meta -- --source <copilot-host-checkout>

${declarations.join('\n\n')}\n`;
}

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { source: { type: 'string' }, check: { type: 'boolean', default: false } } });
	if (!values.source) {
		throw new Error('Usage: node build/agentHost/generateCopilotMetadata.ts --source <copilot-host-checkout> [--check]');
	}
	const generated = await generate(resolve(values.source));
	if (values.check) {
		if (!existsSync(outputFile) || readFileSync(outputFile, 'utf8') !== generated) {
			throw new Error('Generated Copilot metadata is missing or stale. Run npm run agent-host:generate-copilot-meta -- --source <copilot-host-checkout>.');
		}
		console.log('Generated Copilot metadata is up to date.');
		return;
	}
	mkdirSync(dirname(outputFile), { recursive: true });
	writeFileSync(outputFile, generated);
	console.log('Generated src/vs/platform/agentHost/common/meta/copilotd/generated/copilotdMetadata.ts.');
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
