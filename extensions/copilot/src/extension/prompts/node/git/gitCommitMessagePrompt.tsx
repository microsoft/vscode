/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { Diff } from '../../../../platform/git/common/gitDiffService';
import { basename } from '../../../../util/vs/base/common/path';
import { RecentCommitMessages } from '../../../prompt/common/repository';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { CustomInstructions } from '../panel/customInstructions';
import { FilePathMode, FileVariable } from '../panel/fileVariable';
import { UnsafeCodeBlock } from '../panel/unsafeElements';

export interface GitCommitMessagePromptProps extends BasePromptElementProps {
	readonly repositoryName: string;
	readonly branchName: string;
	readonly changes: Diff[];
	readonly recentCommitMessages: RecentCommitMessages;
}

export class GitCommitMessagePrompt extends PromptElement<GitCommitMessagePromptProps> {
	render() {
		return (
			<>
				<SystemMessage priority={1000}>
					<GitCommitMessageSystemRules />
					<SafetyRules />
					<ResponseTranslationRules />
				</SystemMessage>
				<UserMessage>
					<Tag priority={850} name='repository-context'>
						# REPOSITORY DETAILS:<br />
						Repository name: {this.props.repositoryName}<br />
						Branch name: {this.props.branchName}<br />
					</Tag>
					{this.props.recentCommitMessages.user.length > 0 && (
						<Tag priority={700} name='user-commits'>
							# RECENT USER COMMITS (For reference only, do not copy!):<br />
							{this.props.recentCommitMessages.user.map(message => `- ${message}\n`).join('')}
						</Tag>
					)}
					{this.props.recentCommitMessages.repository.length > 0 && (
						<Tag priority={600} name='recent-commits'>
							# RECENT REPOSITORY COMMITS (For reference only, do not copy!):<br />
							{this.props.recentCommitMessages.repository.map(message => `- ${message}\n`).join('')}
						</Tag>
					)}
					<Tag priority={900} name='changes'>
						{this.props.changes.map((change) => (
							<>
								<Tag name='original-code' priority={800}>
									# ORIGINAL CODE:<br />
									<FileVariable
										filePathMode={FilePathMode.AsComment}
										lineNumberStyle={'legacy'}
										passPriority={true}
										variableName={basename(change.uri.toString())}
										variableValue={change.uri} />
								</Tag>
								<Tag name='code-changes' priority={900}>
									# CODE CHANGES:<br />
									<UnsafeCodeBlock code={change.diff} languageId='diff' />
								</Tag>
							</>
						))}
					</Tag>
					<Tag priority={950} name='reminder'>
						Now generate a commit messages that describe the CODE CHANGES.<br />
						DO NOT COPY commits from RECENT COMMITS, but use it as reference for the commit style.<br />
						ONLY return a single markdown code block, NO OTHER PROSE!<br />
						<UnsafeCodeBlock languageId='text' code='commit message goes here' />
					</Tag>
					<Tag priority={950} name='custom-instructions'>
						<CustomInstructions
							chatVariables={undefined}
							customIntroduction='When generating the commit message, please use the following custom instructions provided by the user.'
							languageId={undefined}
							includeCodeGenerationInstructions={false}
							includeCommitMessageGenerationInstructions={true} />
					</Tag>
				</UserMessage>
			</>
		);
	}
}

class GitCommitMessageSystemRules extends PromptElement {
	render() {
		return (
			<>
				You are an AI programming assistant, helping a software developer to come with the best git commit message for their code changes.<br />
				You excel in interpreting the purpose behind code changes to craft succinct, clear commit messages that adhere to the repository's guidelines.<br />
				<br />
				# First, think step-by-step:<br />
				1. Analyze the CODE CHANGES thoroughly to understand what's been modified.<br />
				2. Use the ORIGINAL CODE to understand the context of the CODE CHANGES. Use the line numbers to map the CODE CHANGES to the ORIGINAL CODE.<br />
				3. Identify the purpose of the changes to answer the *why* for the commit messages, also considering the optionally provided RECENT USER COMMITS.<br />
				4. Review the provided RECENT REPOSITORY COMMITS to identify established commit message conventions. Focus on the format and style, ignoring commit-specific details like refs, tags, and authors.<br />
				5. Generate a thoughtful and succinct commit message for the given CODE CHANGES. It MUST follow the the established writing conventions.
				6. Remove any meta information like issue references, tags, or author names from the commit message. The developer will add them.<br />
				7. Now only show your message, wrapped with a single markdown ```text codeblock! Do not provide any explanations or details<br />
			</>
		);
	}
}
