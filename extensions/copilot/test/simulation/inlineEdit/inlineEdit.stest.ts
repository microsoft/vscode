/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { XtabProvider } from '../../../src/extension/xtab/node/xtabProvider';
import { ConfigKey } from '../../../src/platform/configuration/common/configurationService';
import { Configuration, ISimulationSuiteDescriptor, ssuite, stest } from '../../base/stest';
import { inlineEditsFixture, loadFile } from './fileLoading';
import { InlineEditTester } from './inlineEditTester';

const CompScore1 = 'CompScore1';
const CompScore2 = 'CompScore2';
const CompScore3 = 'CompScore3';

function getTester() {
	return new InlineEditTester();
}

type TestConfiguration = {
	providerName: string;
	extensionConfiguration: Configuration<any>[];
	/**
	 * Default is true.
	 */
	shouldBeRun?: boolean;
};

const commonXtabTestConfigurations: Configuration<unknown>[] = [
	// uncomment to include viewed files
	// {
	// 	key: ConfigKey.Internal.InlineEditsXtabIncludeViewedFiles,
	// 	value: true,
	// },
];

const testConfigs: TestConfiguration[] = [
	{
		providerName: 'xtab',
		extensionConfiguration: [
			{
				key: ConfigKey.TeamInternal.InlineEditsProviderId,
				value: XtabProvider.ID,
			},
			...commonXtabTestConfigurations,
		],
	}
];

for (const testConfig of testConfigs) {

	const providerName = testConfig.providerName;

	function ssuiteByProvider(descr: ISimulationSuiteDescriptor, testRegistrationFactory: () => void) {
		if (providerName === 'server') {
			return ssuite.optional( // remember: optional tests aren't run in CI (which matches current desired behavior but don't be surprised)
				(opts) => !opts.runServerPoweredNesProvider,
				descr,
				testRegistrationFactory
			);
		} else {
			return ssuite(descr, testRegistrationFactory);
		}
	}

	ssuiteByProvider({ title: 'InlineEdit GoldenScenario', subtitle: `[${testConfig.providerName}]`, location: 'external', configurations: testConfig.extensionConfiguration }, () => {

		const tester = getTester();

		stest({ description: '[MustHave] 1-point.ts', language: 'typescript', attributes: { [CompScore1]: 1, [CompScore2]: 0.5, [CompScore3]: 0 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('1-point.ts/recording.w.json') }),
		));

		stest({ description: '[NiceToHave] 2-helloworld-sample-remove-generic-parameter', language: 'typescript', attributes: { [CompScore1]: 0 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('2-helloworld-sample-remove-generic-parameter/recording.w.json') }),
		));

		stest({ description: '[MustHave] 6-vscode-remote-try-java-part-1', language: 'java', attributes: { [CompScore1]: 1, [CompScore2]: 1, [CompScore3]: 0.75 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('6-vscode-remote-try-java-part-1/recording.w.json') }),
		));

		// TODO: this test case is weird, it overspecifies like directing via comments
		stest({ description: '[MustHave] 6-vscode-remote-try-java-part-2', language: 'java', attributes: { [CompScore1]: 1, [CompScore2]: 1, [CompScore3]: 0.75 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('6-vscode-remote-try-java-part-2/recording.w.json') })
		));

		// 7 covered in "From codium"

		stest({ description: '[MustHave] 8-cppIndividual-1-point.cpp', language: 'cpp', attributes: { [CompScore1]: 1, [CompScore2]: 0, [CompScore3]: 1 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('8-cppIndividual-1-point.cpp/recording.w.json') }),
		));

		stest({ description: '[MustHave] 8-cppIndividual-2-collection-farewell', language: 'cpp', attributes: { [CompScore1]: 1, [CompScore2]: 0.5, [CompScore3]: 0.5 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('8-cppIndividual-2-collection-farewell/recording.w.json') }),
		));

		stest({ description: '[MustHave] 9-cppProject-add-header-expect-implementation', language: 'cpp', attributes: { [CompScore1]: 1, [CompScore2]: 0.66, [CompScore3]: 0.5 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('9-cppProject-add-header-expect-implementation/recording.w.json') })
		));

		stest({ description: '[MustHave] 9-cppProject-add-implementation-expect-header', language: 'cpp', attributes: { [CompScore1]: 1, [CompScore2]: 0, [CompScore3]: 1 } }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({ filePath: inlineEditsFixture('9-cppProject-add-implementation-expect-header/recording.w.json') }),
		));

		stest({ description: 'Notebook 10-update-name-in-same-cell-of-notebook', language: 'python' }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({
				filePath: inlineEditsFixture('10-update-name-in-same-cell-of-notebook/recording.w.json'),
			})
		));

		stest({ description: 'Notebook 11-update-name-in-next-cell-of-notebook', language: 'python' }, collection => tester.runAndScoreTestFromRecording(collection,
			loadFile({
				filePath: inlineEditsFixture('11-update-name-in-next-cell-of-notebook/recording.w.json'),
			})
		));

	});

}
