/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { DevContainerConfigFeature, DevContainerConfigTemplate } from '../../../../platform/devcontainer/common/devContainerConfigurationService';
import { SafetyRules } from '../base/safetyRules';

export interface DevContainerConfigPromptProps extends BasePromptElementProps {
	readonly filenames: string[];
	readonly templates: DevContainerConfigTemplate[];
	readonly features: DevContainerConfigFeature[];
}

export class DevContainerConfigPrompt extends PromptElement<DevContainerConfigPromptProps> {
	render() {
		return (
			<>
				<SystemMessage>
					<DevContainerConfigSystemRules />
					<SafetyRules />
				</SystemMessage>
				<UserMessage>
					<DevContainerConfigUserMessage templates={this.props.templates} features={this.props.features} filenames={this.props.filenames} />
				</UserMessage>
			</>
		);
	}
}

class DevContainerConfigSystemRules extends PromptElement {
	render() {
		return (
			<>
				You are an AI programming assistant.<br />
				You are helping a software developer to configure a Dev Container by picking a configuration template and features.
			</>
		);
	}
}

export interface DevContainerConfigUserMessageProps extends BasePromptElementProps {
	readonly templates: DevContainerConfigTemplate[];
	readonly features: DevContainerConfigFeature[];
	readonly filenames: string[];
}

class DevContainerConfigUserMessage extends PromptElement<DevContainerConfigUserMessageProps> {
	render() {
		return (
			<>
				This is a partial list of workspace files:<br />
				{this.props.filenames.map(f => `- ${f}\n`).join('')}
				<br />
				Based on the workspace files, please suggest the best template from the list of templates below.<br />
				First identify the relevant files ignoring common files, then pick the best template and reply with the best template's id.<br />
				This is the list of available templates:<br />
				{this.props.templates.map(t => `- ${t.id}: ${t.name || t.id}: ${t.description || t.name || t.id}\n`).join('')}
				<br />
				Also based on the workspace files, please suggest all relevant features from the list of features below.<br />
				First identify the relevant files ignoring common files, then pick all relevant features and reply with the relevant features' ids.<br />
				This is the list of available features:<br />
				{this.props.features.map(f => `- ${f.id}: ${f.name || f.id}: ${f.description || f.name || f.id}\n`).join('')}
				<br />
			</>
		);
	}
}
