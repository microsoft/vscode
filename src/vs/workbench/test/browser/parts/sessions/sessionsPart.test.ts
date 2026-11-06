/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IColorTheme, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { SessionsPart } from '../../../../browser/parts/sessions/sessionsPart.js';
import { ISessionsPartContent, ISessionsPartContentHost, ISessionsPartContentLayout, SessionsPartContentRegistry } from '../../../../browser/parts/sessions/sessionsPartContent.js';
import { ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';

const ITestScopeService = createDecorator<ITestScopeService>('sessionsPartTestScopeService');
interface ITestScopeService { readonly _serviceBrand: undefined; readonly scope: string }

const calls: string[] = [];

class RecordingContent extends Disposable implements ISessionsPartContent {
	static readonly ID = 'test.sessionsPart.recording';
	readonly scope: string;
	constructor(readonly host: ISessionsPartContentHost, @ITestScopeService scopeService: ITestScopeService) {
		super();
		this.scope = scopeService.scope;
		calls.push('create');
	}
	renderBackground(_partContainer: HTMLElement): void { calls.push('renderBackground'); }
	render(_contentArea: HTMLElement): void { calls.push('render'); }
	layout(width: number, height: number, _top: number, _left: number, options: ISessionsPartContentLayout): void { calls.push(`layout ${width}x${height} phone=${options.phoneLayout} gap=${options.gap}`); }
	setVisible(visible: boolean): void { calls.push(`visible ${visible}`); }
	updateStyles(_theme: IColorTheme): void { calls.push('styles'); }
	override dispose(): void { calls.push('dispose'); super.dispose(); }
}

class OtherContent extends Disposable implements ISessionsPartContent {
	static readonly ID = 'test.sessionsPart.other';
	constructor(_host: ISessionsPartContentHost) { super(); }
	render(): void { }
	layout(): void { }
	setVisible(): void { }
	updateStyles(): void { }
}

suite('Sessions - Sessions part frame and content registry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(contentId: string, registrations: DisposableStore): SessionsPart {
		const instantiationService = registrations.add(new TestInstantiationService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IStorageService, registrations.add(new TestStorageService()));
		const mainContainer = document.createElement('div');
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
			override registerPart(): IDisposable { return Disposable.None; }
			override isVisible(part: Parts) { return part === Parts.SESSIONS_PART; }
			override isModernUICompact() { return false; }
			override isFloatingPanelsEnabled() { return false; }
		}());
		instantiationService.stub(ISessionsHostLayoutService, new class extends mock<ISessionsHostLayoutService>() { }());
		instantiationService.stub(ITestScopeService, { _serviceBrand: undefined, scope: 'part scope' });
		return registrations.add(instantiationService.createInstance(SessionsPart, contentId));
	}

	setup(() => { calls.length = 0; });

	test('registers, resolves and unregisters content kinds; duplicate ids throw', () => {
		const registration = SessionsPartContentRegistry.register({ id: RecordingContent.ID, ctor: RecordingContent });
		const resolvedWhileRegistered = SessionsPartContentRegistry.get(RecordingContent.ID)?.id;
		assert.throws(() => SessionsPartContentRegistry.register({ id: RecordingContent.ID, ctor: RecordingContent }), /already registered/);
		registration.dispose();
		assert.deepStrictEqual({ resolvedWhileRegistered, afterDispose: SessionsPartContentRegistry.get(RecordingContent.ID) }, { resolvedWhileRegistered: RecordingContent.ID, afterDispose: undefined });
	});

	test('each part creates exactly the kind its window names, in the part\'s scope, and an unknown kind throws', () => {
		const registrations = store.add(new DisposableStore());
		registrations.add(SessionsPartContentRegistry.register({ id: RecordingContent.ID, ctor: RecordingContent }));
		registrations.add(SessionsPartContentRegistry.register({ id: OtherContent.ID, ctor: OtherContent }));

		const recording = createPart(RecordingContent.ID, registrations);
		const other = createPart(OtherContent.ID, registrations);
		const recordingContent = recording.getContent(RecordingContent);

		assert.deepStrictEqual({
			recording: recordingContent?.constructor.name,
			recordingAsOther: recording.getContent(OtherContent),
			other: other.getContent(OtherContent)?.constructor.name,
			host: recordingContent?.host === recording,
			scope: recordingContent?.scope,
		}, { recording: 'RecordingContent', recordingAsOther: undefined, other: 'OtherContent', host: true, scope: 'part scope' });
		assert.throws(() => createPart('test.sessionsPart.unknown', registrations), /No Sessions part content is registered for 'test.sessionsPart.unknown'/);
	});

	test('renders, lays out, shows and disposes its content', () => {
		const registrations = store.add(new DisposableStore());
		const registration = registrations.add(SessionsPartContentRegistry.register({ id: RecordingContent.ID, ctor: RecordingContent }));
		const part = createPart(RecordingContent.ID, registrations);
		registration.dispose(); // a part that already shows a kind keeps its content

		part.requestLayout();
		part.create(document.createElement('div'));
		part.layout(800, 600, 0, 0);
		part.requestLayout();
		part.setContentVisible(false);
		part.setVisible(false);
		part.setContentVisible(true);
		part.setVisible(true);
		registrations.dispose();

		assert.deepStrictEqual(calls, [
			'create',
			'renderBackground',
			'render',
			'styles',
			'layout 794x598 phone=false gap=4',
			'layout 794x598 phone=false gap=4',
			'visible false',
			'visible false',
			'visible false',
			'visible true',
			'dispose',
		]);
	});
});
