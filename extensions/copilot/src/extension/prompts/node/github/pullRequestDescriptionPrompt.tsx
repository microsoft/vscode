/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, SystemMessage, UserMessage, } from '@vscode/prompt-tsx';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { CustomInstructions } from '../panel/customInstructions';

interface GitHubPullRequestPromptProps extends BasePromptElementProps {
	commitMessages: string[];
	patches: string[];
	issues: { reference: string; content: string }[] | undefined;
	template: string | undefined;
}

interface GitHubPullRequestIdentityProps extends BasePromptElementProps {
	issues: { reference: string; content: string }[] | undefined;
}

class GitHubPullRequestIssueList extends PromptElement<GitHubPullRequestIdentityProps> {
	render() {
		const issuesString = this.props.issues?.map(issue => {
			return <>
				-------
				Issue {issue.reference}:<br />
				{issue.content}<br />
			</>;
		});
		return issuesString && issuesString.length > 0 ? (
			<>
				You are an AI assistant for a software developer who is about to make a pull request to a GitHub repository to fix the following issues: <br />
				{issuesString}
			</>) : (
			<>
				You are an AI assistant for a software developer who is about to make a pull request to a GitHub repository.
			</>);
	}
}

class GitHubPullRequestSystemExamples extends PromptElement<GitHubPullRequestIdentityProps> {
	render() {
		return <>Here are two good examples:<br /> {this.props.issues && this.props.issues.length > 0 ? (
			<>
				Example One:<br />
				+++Batch mark/unmark files as viewed<br />
				+++Previously, when marking/unmarking a folder as viewed, a request was sent for every single file. This PR ensures that only one request is sent when marking/unmarking a folder as viewed.<br />
				Fixes #4520+++<br />
				Example two:<br />
				+++Fallback to hybrid after 20 process ports<br />
				+++Additionally the \`remote.autoForwardPortsSource\` setting has been updated to remove the \`markdownDescription\` reference to a reload being required for changes to take effect.<br />
				Fixes microsoft/vscode#4533+++<br />
			</>
		) : (
			<>
				Example One:<br />
				+++Batch mark/unmark files as viewed<br />
				+++Previously, when marking/unmarking a folder as viewed, a request was sent for every single file. This PR ensures that only one request is sent when marking/unmarking a folder as viewed.+++<br />
				Example two:<br />
				+++Fallback to hybrid after 20 process ports<br />
				+++Additionally the \`remote.autoForwardPortsSource\` setting has been updated to remove the \`markdownDescription\` reference to a reload being required for changes to take effect.+++<br />
				Example three:<br />
				+++Add a favicon<br />
				+++Add a favicon to the webview+++<br />
			</>
		)};
		</>;
	}
}

class GitHubPullRequestSystemRules extends PromptElement<GitHubPullRequestIdentityProps> {
	render() {
		return (
			<>
				<GitHubPullRequestIssueList issues={this.props.issues} />
				Pull requests have a short and concise title that describes the changes in the code and a description that is much shorter than the changes.<br />
				To compose the description, read through each commit and patch and tersly describe the intent of the changes, not the changes themselves. Do not list commits, files or patches. Do not make up an issue reference if the pull request isn't fixing an issue.<br />
				If the pull request is fixing an issue, consider how the commits relate to the issue and include that in the description.<br />
				Avoid saying "this PR" or similar. Avoid passive voice.<br />
				If a template is specified, the description must match the template, filling in any required fields.<br />
				The title and description of a pull request should be markdown and start with +++ and end with +++.<br />
				<GitHubPullRequestSystemExamples issues={this.props.issues} />
			</>
		);
	}
}

interface GitHubPullRequestUserMessageProps extends BasePromptElementProps {
	commitMessages: string[];
	patches: string[];
	template: string | undefined;
}

class GitHubPullRequestUserMessage extends PromptElement<GitHubPullRequestUserMessageProps> {
	render() {
		const formattedCommitMessages = this.props.commitMessages.map(commit => `"${commit.replace(/\n/g, '. ')}"`).join(', ');
		const formattedPatches = this.props.patches.map(patch => <>```diff<br />{patch}<br />```<br /></>);
		return (
			<>
				These are the commits that will be included in the pull request you are about to make:<br />
				{formattedCommitMessages}<br />
				Below is a list of git patches that contain the file changes for all the files that will be included in the pull request:<br />
				{formattedPatches}<br />
				{this.props.template && (
					<>
						The pull request description should match the following template:<br />
						```<br />
						{this.props.template}<br />
						```<br />
					</>
				)}
				Based on the git patches and on the git commit messages above, the title and description of the pull request should be:<br />
			</>
		);
	}
}

export class GitHubPullRequestPrompt extends PromptElement<GitHubPullRequestPromptProps> {
	render() {
		return (
			<>
				<SystemMessage>
					<GitHubPullRequestSystemRules issues={this.props.issues} />
					<SafetyRules />
				</SystemMessage>
				<UserMessage>
					<GitHubPullRequestUserMessage commitMessages={this.props.commitMessages} patches={this.props.patches} template={this.props.template} />
					<Tag priority={750} name='custom-instructions'>
						<CustomInstructions
							chatVariables={undefined}
							customIntroduction='When generating the pull request title and description, please use the following custom instructions provided by the user.'
							languageId={undefined}
							includeCodeGenerationInstructions={false}
							includePullRequestDescriptionGenerationInstructions={true} />
					</Tag>
				</UserMessage>
			</>
		);
	}
}