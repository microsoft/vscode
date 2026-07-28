/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import { ITestDepsResolver } from '../../../../platform/testing/node/testDepsResolver';
import { Tag } from '../../../prompts/node/base/tag';


type Props = PromptElementProps<{
	languageId: string;
}>;

export class TestDeps extends PromptElement<Props> {

	constructor(
		props: Props,
		@ITestDepsResolver private readonly testDepsResolver: ITestDepsResolver,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		const { languageId } = this.props;
		const testFrameworks = await this.testDepsResolver.getTestDeps(languageId);
		return testFrameworks.length > 0 &&
			<Tag name='testDependencies' priority={this.props.priority}>
				The project has the following testing dependencies: {testFrameworks.join(', ')}.
			</Tag>;
	}
}
