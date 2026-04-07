/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import * as l10n from '@vscode/l10n';
import { Image as BaseImage, BasePromptElementProps, ChatResponseReferencePartStatusKind, PromptElement, PromptReference, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { modelCanUseImageURL } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { IImageService } from '../../../../platform/image/common/imageService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { getMimeType } from '../../../../util/common/imageUtils';
import { Uri } from '../../../../vscodeTypes';
import { IPromptEndpoint } from '../base/promptRenderer';

export interface ImageProps extends BasePromptElementProps {
	variableName: string;
	variableValue: Uint8Array | Promise<Uint8Array>;
	omitReferences?: boolean;
	reference?: Uri;
}

/**
 * Props for rendering an image that was previously rendered and stored in conversation history.
 * These images are already processed (base64 or URL) and don't need re-uploading.
 */
export interface HistoricalImageProps extends BasePromptElementProps {
	/** The image source - either a base64 string or URL */
	src: string;
	/** The detail level for the image */
	detail?: 'auto' | 'low' | 'high';
	/** The MIME type of the image */
	mimeType?: string;
}

/**
 * Renders an image from conversation history.
 * Checks if the current model supports vision and omits the image if not.
 */
export class HistoricalImage extends PromptElement<HistoricalImageProps, unknown> {
	constructor(
		props: HistoricalImageProps,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint,
		@IAuthenticationService private readonly authService: IAuthenticationService,
	) {
		super(props);
	}

	override async render(_state: unknown, sizing: PromptSizing) {
		// If the model doesn't support vision, omit historical images
		if (!this.promptEndpoint.supportsVision || !this.authService.copilotToken?.isEditorPreviewFeaturesEnabled()) {
			return undefined;
		}

		return <BaseImage src={this.props.src} detail={this.props.detail} mimeType={this.props.mimeType} />;
	}
}

export class Image extends PromptElement<ImageProps, unknown> {
	constructor(
		props: ImageProps,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint,
		@IAuthenticationService private readonly authService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@IImageService private readonly imageService: IImageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService
	) {
		super(props);
	}

	override async render(_state: unknown, sizing: PromptSizing) {
		const options = { status: { description: l10n.t("{0} does not support images.", this.promptEndpoint.model), kind: ChatResponseReferencePartStatusKind.Omitted } };

		const fillerUri: Uri = this.props.reference ?? Uri.parse('Attached Image');

		try {
			if (!this.promptEndpoint.supportsVision || !this.authService.copilotToken?.isEditorPreviewFeaturesEnabled()) {
				if (this.props.omitReferences) {
					return;
				}

				return (
					<>
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: fillerUri } : fillerUri, undefined, options)]} />
					</>
				);
			}
			const variable = await this.props.variableValue;
			let imageSource = Buffer.from(variable).toString('base64');
			let imageMimeType: string | undefined = undefined;

			const isChatRequest = typeof this.promptEndpoint.urlOrRequestMetadata !== 'string' && (this.promptEndpoint.urlOrRequestMetadata.type === RequestType.ChatCompletions || this.promptEndpoint.urlOrRequestMetadata.type === RequestType.ChatResponses || this.promptEndpoint.urlOrRequestMetadata.type === RequestType.ChatMessages);
			const enabled = this.configurationService.getExperimentBasedConfig(ConfigKey.EnableChatImageUpload, this.experimentationService);
			if (isChatRequest && enabled && modelCanUseImageURL(this.promptEndpoint)) {
				try {
					const githubToken = (await this.authService.getGitHubSession('any', { silent: true }))?.accessToken;
					const mimeType = getMimeType(imageSource) ?? imageMimeType;
					const uri = await this.imageService.uploadChatImageAttachment(variable, this.props.variableName, mimeType, githubToken);
					if (uri) {
						imageSource = uri.toString();
						imageMimeType = mimeType;
					}
				} catch (error) {
					this.logService.warn(`Image upload failed, using base64 fallback: ${error}`);
				}
			}

			return (
				<UserMessage priority={0}>
					<BaseImage src={imageSource} detail='high' mimeType={imageMimeType} />
					{this.props.reference && (
						<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: fillerUri } : fillerUri, undefined)]} />
					)}
				</UserMessage>
			);
		} catch (err) {
			if (this.props.omitReferences) {
				return;
			}

			return (
				<>
					<references value={[new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: fillerUri } : fillerUri, undefined, options)]} />
				</>);
		}
	}
}
