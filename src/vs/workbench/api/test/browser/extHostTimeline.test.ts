/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { CommandsConverter, ExtHostCommands, ArgumentProcessor } from '../../common/extHostCommands.js';
import { MainThreadTimelineShape } from '../../common/extHost.protocol.js';
import { ExtHostTimeline } from '../../common/extHostTimeline.js';
import { TimelineItem } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { TimelineOptions } from '../../../contrib/timeline/common/timeline.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';

suite('ExtHostTimeline', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes cached timeline items with their provider', async function () {
		let argumentProcessor: ArgumentProcessor | undefined;
		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(processor: ArgumentProcessor): void {
				argumentProcessor = processor;
			}
		};
		const proxy = new class extends mock<MainThreadTimelineShape>() {
			override $registerTimelineProvider(): void { }
			override $unregisterTimelineProvider(): void { }
		};
		const timeline = new ExtHostTimeline(SingleProxyRPCProtocol(proxy), commands);
		const extension: IExtensionDescription = {
			...nullExtensionDescription,
			identifier: new ExtensionIdentifier('test.timeline'),
			enabledApiProposals: ['timeline'],
		};
		const uri = URI.parse('file:///timeline.txt');
		const provider = {
			id: 'test-timeline',
			label: 'Test Timeline',
			provideTimeline: () => ({ items: [new TimelineItem('first item', 1)] }),
		};
		const converter = new class extends mock<CommandsConverter>() { };
		const registration = timeline.registerTimelineProvider('file', provider, extension.identifier, converter);
		const options: TimelineOptions = { cacheResults: true };
		const result = await timeline.$getTimeline(provider.id, uri, options, CancellationToken.None);
		const handle = result?.items[0].handle;

		registration.dispose();
		const replacement = timeline.registerTimelineProvider('file', provider, extension.identifier, converter);
		const cachedItem = argumentProcessor?.processArgument({
			$mid: MarshalledId.TimelineActionContext,
			handle,
			source: provider.id,
			uri,
		}, extension);

		assert.strictEqual(cachedItem, undefined);
		replacement.dispose();
	});
});
