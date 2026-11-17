/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorktreeSendChoiceControlRegistration, WorktreeSendChoiceTargetService } from '../../../browser/agentSessions/worktreeSendChoiceTarget.js';

suite('WorktreeSendChoiceTargetService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const draft = URI.parse('agent-host-copilotcli:/untitled-draft');
	const other = URI.parse('agent-host-copilotcli:/untitled-other');

	/** An asker of `draft`, with controls named in the order they register, and what it cancelled. */
	function setup() {
		const store = disposables.add(new DisposableStore());
		const service = store.add(new WorktreeSendChoiceTargetService());
		const pending = observableValue<URI | undefined>('pending', undefined);
		const onDidShow = store.add(new Emitter<URI>());
		const cancelled: string[] = [];
		const asker = { targetId: 'test.target', pendingSendChoice: pending, onDidShowSendChoice: onDidShow.event, cancelSendChoice: (resource: URI) => cancelled.push(resource.path) };
		const controls = new Map<string, { readonly resource: ISettableObservable<URI | undefined>; offered: boolean; presentable: boolean; registration: IWorktreeSendChoiceControlRegistration | undefined }>();
		const add = (name: string, resource = draft, presentable = true) => {
			const control = { resource: observableValue<URI | undefined>(name, resource), offered: true, presentable, registration: undefined as IWorktreeSendChoiceControlRegistration | undefined };
			control.registration = store.add(service.registerControl(asker, { resource: control.resource, isOffered: () => control.offered, isPresentable: () => control.presentable }));
			controls.set(name, control);
		};
		const targets = () => [...controls].filter(([, control]) => control.registration!.isTarget()).map(([name]) => name);
		const ask = () => {
			pending.set(draft, undefined);
			onDidShow.fire(draft);
		};
		return { pending, controls, add, targets, ask, cancelled, remove: (name: string) => controls.get(name)!.registration!.dispose() };
	}

	test('the callout targets the first control of the chat asked about where it offers New Worktree and can present it, keeps the one it shows on, and ends its question unanswered only through that one', () => {
		const run = (steps: (fixture: ReturnType<typeof setup>) => void) => {
			const fixture = setup();
			fixture.add('a');
			fixture.add('b');
			fixture.add('c', other);
			steps(fixture);
			return { targets: fixture.targets(), cancelled: fixture.cancelled };
		};

		assert.deepStrictEqual({
			notAsking: run(() => { }),
			asking: run(fixture => fixture.ask()),
			notOffered: run(fixture => { fixture.controls.get('a')!.offered = false; fixture.ask(); }),
			// Such as one in an auxiliary window, or a hidden one
			notPresentable: run(fixture => { fixture.controls.get('a')!.presentable = false; fixture.ask(); }),
			anchorShowsAnother: run(fixture => { fixture.ask(); fixture.controls.get('a')!.resource.set(other, undefined); }),
			otherShowsAnother: run(fixture => { fixture.ask(); fixture.controls.get('b')!.resource.set(other, undefined); }),
			anchorGoesWithOther: run(fixture => { fixture.ask(); fixture.remove('a'); }),
			anchorGoesAlone: run(fixture => { fixture.ask(); fixture.remove('b'); fixture.remove('a'); }),
			otherGoes: run(fixture => { fixture.ask(); fixture.remove('b'); }),
			answered: run(fixture => { fixture.ask(); fixture.pending.set(undefined, undefined); fixture.controls.get('a')!.resource.set(other, undefined); fixture.remove('a'); }),
		}, {
			notAsking: { targets: [], cancelled: [] },
			asking: { targets: ['a'], cancelled: [] },
			notOffered: { targets: ['b'], cancelled: [] },
			notPresentable: { targets: ['b'], cancelled: [] },
			anchorShowsAnother: { targets: ['b'], cancelled: ['/untitled-draft'] },
			otherShowsAnother: { targets: ['a'], cancelled: [] },
			anchorGoesWithOther: { targets: ['b'], cancelled: [] },
			anchorGoesAlone: { targets: [], cancelled: ['/untitled-draft'] },
			otherGoes: { targets: ['a'], cancelled: [] },
			answered: { targets: [], cancelled: [] },
		});
	});

	test('a control rendered in place of the one the callout shows on, before that one goes, takes the callout over without ending the question', () => {
		const fixture = setup();
		fixture.add('a');
		fixture.ask();
		fixture.add('replacement');
		fixture.remove('a');

		assert.deepStrictEqual({ targets: fixture.targets(), cancelled: fixture.cancelled }, { targets: ['replacement'], cancelled: [] });
	});

	test('tells chats apart by their exact resource: a control of a chat whose path differs only in case is not the target, and the anchor that shows it ends the question', () => {
		const upperCase = URI.parse('agent-host-copilotcli:/untitled-DRAFT');
		const fixture = setup();
		fixture.add('upper', upperCase);
		fixture.add('a');
		fixture.ask();
		const shownOn = fixture.targets();
		fixture.controls.get('a')!.resource.set(upperCase, undefined);

		assert.deepStrictEqual({ shownOn, cancelled: fixture.cancelled }, { shownOn: ['a'], cancelled: ['/untitled-draft'] });
	});
});
