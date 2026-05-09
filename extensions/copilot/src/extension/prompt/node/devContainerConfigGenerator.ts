/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { DevContainerConfigFeature, DevContainerConfigGeneratorResult, DevContainerConfigIndex, DevContainerConfigTemplate } from '../../../platform/devcontainer/common/devContainerConfigurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { escapeRegExpCharacters } from '../../../util/vs/base/common/strings';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { DevContainerConfigPrompt } from '../../prompts/node/devcontainer/devContainerConfigPrompt';

const excludedTemplates = [
	'alpine',
	'debian',
	'docker-existing-docker-compose',
	'docker-existing-dockerfile',
	'docker-in-docker',
	'docker-outside-of-docker',
	'docker-outside-of-docker-compose',
	'ubuntu',
	'universal',
].map(shortId => `ghcr.io/devcontainers/templates/${shortId}`);

const excludedFeatures = [
	'common-utils',
	'git',
].map(shortId => `ghcr.io/devcontainers/features/${shortId}`);

export class DevContainerConfigGenerator {

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async generate(index: DevContainerConfigIndex, filenames: string[], token: CancellationToken): Promise<DevContainerConfigGeneratorResult> {
		if (!filenames.length) {
			return {
				type: 'success',
				template: undefined,
				features: [],
			};
		}

		const startTime = Date.now();

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-base');
		const charLimit = Math.floor((endpoint.modelMaxPromptTokens * 4) / 3);

		const processedFilenames = this.processFilenames(filenames, charLimit);

		const templates = index.templates.filter(template => !excludedTemplates.includes(template.id));
		const features = (index.features || []).filter(feature => !excludedFeatures.includes(feature.id));

		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, DevContainerConfigPrompt, {
			filenames: processedFilenames,
			templates,
			features,
		});
		const prompt = await promptRenderer.render();

		const requestStartTime = Date.now();
		const fetchResult = await endpoint
			.makeChatRequest(
				'devContainerConfigGenerator',
				prompt.messages,
				undefined,
				token,
				ChatLocation.Other,
			);

		const suggestions = fetchResult.type === ChatFetchResponseType.Success ? this.processGeneratedConfig(fetchResult.value, templates, features) : undefined;

		/* __GDPR__
			"devcontainer.generateConfig" : {
				"owner": "chrmarti",
				"comment": "Metadata about the Dev Container Config generation",
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that is used in the endpoint." },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"responseType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The result type of the response." },
				"templateId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chosen template id." },
				"featureIds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chosen feature ids." },
				"originalFilenameCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of filenames." },
				"originalFilenameLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The length of the filenames." },
				"processedFilenameCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of filenames after processing." },
				"processedFilenameLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The length of the filenames after processing." },
				"timeToRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to start the request." },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to complete the request." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('devcontainer.generateConfig', {
			model: endpoint.model,
			requestId: fetchResult.requestId,
			responseType: fetchResult.type,
			templateId: suggestions?.template,
			featureIds: suggestions?.features.join(','),
		}, {
			originalFilenameCount: filenames.length,
			originalFilenameLength: filenames.join('').length,
			processedFilenameCount: processedFilenames.length,
			processedFilenameLength: processedFilenames.join('').length,
			timeToRequest: requestStartTime - startTime,
			timeToComplete: Date.now() - startTime
		});

		return {
			type: 'success',
			template: suggestions?.template,
			features: suggestions?.features || [],
		};
	}

	private processFilenames(filenames: string[], charLimit: number): string[] {
		const result: string[] = [...filenames];

		// Reserve 10% of the character limit for the safety rules and instructions
		const availableChars = Math.floor(charLimit * 0.9);

		// Remove filenames if needed
		let totalChars = result.join('\n').length;
		if (totalChars > availableChars) {
			// Remove filenames until we are under the character limit
			while (totalChars > availableChars && result.length > 0) {
				const lastDiff = result.pop()!;
				totalChars -= lastDiff.length;
			}
		}

		return result;
	}

	private processGeneratedConfig(message: string, availableTemplates: DevContainerConfigTemplate[], availableFeatures: DevContainerConfigFeature[]) {
		let template = availableTemplates.find(t => new RegExp(`\\b${escapeRegExpCharacters(t.id)}\\b`).test(message))?.id;
		if (template === 'ghcr.io/devcontainers/templates/javascript-node') {
			template = 'ghcr.io/devcontainers/templates/typescript-node'; // Rarely suggested otherwise.
		}
		return {
			template: template,
			features: availableFeatures.filter(f => new RegExp(`\\b${escapeRegExpCharacters(f.id)}\\b`).test(message)).map(f => f.id),
		};
	}
}
