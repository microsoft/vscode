/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionBackgroundActivitiesControl } from '../../browser/sessionBackgroundActivitiesControl.js';
import { isNonNegativeIntegerInput, weightedRandomDebugIncrement } from '../../browser/sessionChatInputToolbarDebug.js';

interface ISubagentSpec {
	readonly title: string;
	readonly status: SessionStatus;
}

interface IControlSpec {
	readonly subagents?: readonly string[];
	readonly subagentStatus?: SessionStatus;
	/** Per-subagent title/status pairs; overrides `subagents`/`subagentStatus` when set. */
	readonly subagentEntries?: readonly ISubagentSpec[];
	readonly enabled?: boolean;
	/** Whether the user keeps the subagents pill visible. */
	readonly visible?: boolean;
}

interface IControlHarness {
	readonly control: SessionBackgroundActivitiesControl;
	readonly getOpenedChat: () => URI | undefined;
}

function createChat(resource: URI, title: string, status: SessionStatus, origin?: IChat['origin']): IChat {
	return new class extends mock<IChat>() {
		override readonly resource = resource;
		override readonly title = constObservable(title);
		override readonly status = constObservable(status);
		override readonly origin = origin;
	}();
}

function createControl(spec: IControlSpec, store: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): IControlHarness {
	const mainChat = createChat(URI.parse('chat:main'), 'Main', SessionStatus.InProgress);
	const subagentSpecs: readonly ISubagentSpec[] = spec.subagentEntries
		?? (spec.subagents ?? []).map(title => ({ title, status: spec.subagentStatus ?? SessionStatus.InProgress }));
	const subagents = subagentSpecs.map((entry, index) =>
		createChat(URI.parse(`chat:subagent-${index}`), entry.title, entry.status, { kind: ChatOriginKind.Tool, parentChat: mainChat.resource }));
	const session = new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:main');
		override readonly chats = constObservable([mainChat, ...subagents]);
	}();

	let openedChat: URI | undefined;
	const sessionsService = new class extends mock<ISessionsService>() {
		override async openChat(_session: ISession, chatUri: URI): Promise<void> {
			openedChat = chatUri;
		}
	}();

	const control = store.add(new SessionBackgroundActivitiesControl(
		constObservable(session),
		constObservable(mainChat),
		constObservable(spec.enabled ?? true),
		constObservable(spec.visible ?? true),
		sessionsService,
	));

	return { control, getOpenedChat: () => openedChat };
}

/** The sections the control publishes, reduced to what the pill renders from. */
function sections(control: SessionBackgroundActivitiesControl): readonly { readonly title: string; readonly entries: readonly { readonly label: string; readonly icon: string }[] }[] {
	return control.sections.get().map(section => ({
		title: section.title,
		entries: section.entries.map(entry => ({ label: entry.label, icon: entry.icon?.id ?? '' })),
	}));
}
suite('SessionBackgroundActivitiesControl', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('weights smaller random change increments more heavily', () => {
		const frequencies = Array.from({ length: 16 }, () => 0);
		for (let first = 0; first < 16; first++) {
			for (let second = 0; second < 16; second++) {
				frequencies[weightedRandomDebugIncrement((first + 0.5) / 16, (second + 0.5) / 16)]++;
			}
		}

		assert.deepStrictEqual(frequencies, [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);
	});

	test('rejects empty and invalid numeric debug fields', () => {
		assert.deepStrictEqual({
			empty: isNonNegativeIntegerInput(''),
			whitespace: isNonNegativeIntegerInput('  '),
			zero: isNonNegativeIntegerInput('0'),
			integer: isNonNegativeIntegerInput('12'),
			negative: isNonNegativeIntegerInput('-1'),
			decimal: isNonNegativeIntegerInput('1.5'),
			text: isNonNegativeIntegerInput('one'),
		}, {
			empty: false,
			whitespace: false,
			zero: true,
			integer: true,
			negative: false,
			decimal: false,
			text: false,
		});
	});

	test('publishes subagents as one section, truncating long labels', () => {
		const cases: IControlSpec[] = [
			{ subagents: ['Research'] },
			{ subagents: ['Investigate the authentication failure in production'] },
			{ subagents: ['Research', 'Review'] },
		];

		assert.deepStrictEqual({
			sections: cases.map(spec => sections(createControl(spec, store).control)),
			disabled: sections(createControl({ subagents: ['Research'], enabled: false }, store).control),
		}, {
			sections: [
				[{ title: 'Subagents', entries: [{ label: 'Research', icon: 'agent' }] }],
				[{ title: 'Subagents', entries: [{ label: 'Investigate the authentication...', icon: 'agent' }] }],
				[{ title: 'Subagents', entries: [{ label: 'Research', icon: 'agent' }, { label: 'Review', icon: 'agent' }] }],
			],
			disabled: [],
		});
	});

	test('lists subagents in every status, not only the ones still running', () => {
		const harness = createControl({
			subagentEntries: [
				{ title: 'Running', status: SessionStatus.InProgress },
				{ title: 'Waiting', status: SessionStatus.NeedsInput },
				{ title: 'Completed', status: SessionStatus.Completed },
				{ title: 'Failed', status: SessionStatus.Error },
			],
		}, store);

		assert.deepStrictEqual(sections(harness.control), [
			{
				title: 'Subagents', entries: [
					{ label: 'Running', icon: 'agent' },
					{ label: 'Waiting', icon: 'agent' },
					{ label: 'Completed', icon: 'agent' },
					{ label: 'Failed', icon: 'agent' },
				],
			},
		]);
	});

	test('excludes subagents that belong to a different chat scope, regardless of status', () => {
		const mainChat = createChat(URI.parse('chat:main'), 'Main', SessionStatus.InProgress);
		const otherChat = createChat(URI.parse('chat:other'), 'Other', SessionStatus.InProgress);
		const ownSubagent = createChat(URI.parse('chat:subagent-own'), 'Own', SessionStatus.Completed, { kind: ChatOriginKind.Tool, parentChat: mainChat.resource });
		const unrelatedSubagent = createChat(URI.parse('chat:subagent-other'), 'Unrelated', SessionStatus.InProgress, { kind: ChatOriginKind.Tool, parentChat: otherChat.resource });
		const session = new class extends mock<IActiveSession>() {
			override readonly resource = URI.parse('session:main');
			override readonly chats = constObservable([mainChat, otherChat, ownSubagent, unrelatedSubagent]);
		}();
		const currentChat = observableValue<IChat>('currentChat', mainChat);

		const control = store.add(new SessionBackgroundActivitiesControl(
			constObservable(session),
			currentChat,
			constObservable(true),
			constObservable(true),
			new class extends mock<ISessionsService>() { }(),
		));
		const whileOnMainChat = sections(control);
		currentChat.set(otherChat, undefined);
		const whileOnOtherChat = sections(control);

		assert.deepStrictEqual({ whileOnMainChat, whileOnOtherChat }, {
			whileOnMainChat: [{ title: 'Subagents', entries: [{ label: 'Own', icon: 'agent' }] }],
			whileOnOtherChat: [{ title: 'Subagents', entries: [{ label: 'Unrelated', icon: 'agent' }] }],
		});
	});

	test('still reports data while the user hides the pill, so it can be shown again', () => {
		const harness = createControl({ subagents: ['Research'], visible: false }, store);

		assert.deepStrictEqual({
			sections: sections(harness.control),
			hasData: harness.control.hasData.get(),
		}, {
			sections: [],
			hasData: true,
		});
	});

	test('ignores browsers from debug data and shows only fake subagents', () => {
		const harness = createControl({ enabled: false }, store);
		harness.control.setDebugData({
			stats: { files: 2, insertions: 10, deletions: 3 },
			markdownFiles: ['README.md'],
			browsers: ['Debug Browser'],
			subagents: ['Debug Subagent'],
			ciFailed: 2,
			ciPending: 1,
			prFeedback: 3,
			agentFeedback: 4,
			autoIncrementChanges: false,
		});
		const forced = sections(harness.control);
		harness.control.setDebugData(undefined);

		assert.deepStrictEqual({ forced, afterClear: sections(harness.control) }, {
			forced: [{ title: 'Subagents', entries: [{ label: 'Debug Subagent', icon: 'agent' }] }],
			afterClear: [],
		});
	});

	test('opening an entry opens that subagent chat', () => {
		const harness = createControl({ subagents: ['Research'] }, store);

		harness.control.sections.get()[0].entries[0].open();

		assert.deepStrictEqual(harness.getOpenedChat()?.toString(), 'chat:subagent-0');
	});
});
