/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChangeLanguageAction } from '../../../../browser/parts/editor/editorStatus.js';
import { LanguageDetectionLanguageEventSource } from '../../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { UntitledTextEditorService } from '../../../../services/untitled/common/untitledTextEditorService.js';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { UntitledDocumentTelemetry } from '../../browser/untitledDocumentTelemetry.js';

suite('UntitledDocumentTelemetry', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let accessor: TestServiceAccessor;
	let events: { name: string; data: Record<string, unknown> }[];

	setup(() => {
		events = [];
		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ITelemetryService, { ...NullTelemetryService, publicLog2: (name: string, data: Record<string, unknown>) => events.push({ name, data }) } as unknown as ITelemetryService);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(accessor.untitledTextEditorService as UntitledTextEditorService);
		disposables.add(accessor.languageService.registerLanguage({ id: 'markdown' }));
	});

	teardown(() => disposables.clear());

	function untitledEvents(kind?: string) {
		return events.filter(e => e.name === 'untitledDocument' && (!kind || e.data.kind === kind)).map(e => e.data);
	}

	test('created, first edit and saved share one id', async () => {
		disposables.add(instantiationService.createInstance(UntitledDocumentTelemetry));
		const model = disposables.add(accessor.untitledTextEditorService.create({ origin: 'newFileCommand' }));
		await model.resolve();

		model.textEditorModel!.setValue('# Notes');
		model.textEditorModel!.setValue('# Notes!');
		accessor.untitledTextEditorService.notifyDidSave(model.resource, URI.file('/notes.md'));
		model.dispose();

		const [created, firstEdit, ended, ...rest] = untitledEvents();
		assert.deepStrictEqual(rest, []);
		assert.deepStrictEqual([created.kind, created.origin, created.restored, created.language], ['created', 'newFileCommand', false, 'plaintext']);
		assert.strictEqual(firstEdit.kind, 'firstEdit');
		assert.deepStrictEqual([ended.kind, ended.outcome, ended.savedExt, ended.sizeBucket, ended.atShutdown], ['ended', 'saved', '.md', '<100', false]);
		assert.ok(typeof created.untitledDocumentId === 'string');
		assert.strictEqual(firstEdit.untitledDocumentId, created.untitledDocumentId);
		assert.strictEqual(ended.untitledDocumentId, created.untitledDocumentId);
	});

	test('closed documents end as empty or discarded', async () => {
		disposables.add(instantiationService.createInstance(UntitledDocumentTelemetry));
		const untouched = disposables.add(accessor.untitledTextEditorService.create());
		await untouched.resolve();
		const discarded = disposables.add(accessor.untitledTextEditorService.create());
		await discarded.resolve();

		discarded.textEditorModel!.setValue('scratch');
		await discarded.revert();
		discarded.dispose();
		untouched.dispose();

		assert.deepStrictEqual(untitledEvents('ended').map(e => [e.outcome, e.sizeBucket]), [['closedDiscarded', '<100'], ['closedEmpty', '0']]);
		assert.strictEqual(untitledEvents('created')[0].origin, 'other');
	});

	test('dirty documents keep their id across a shutdown, the others end', async () => {
		const telemetry = instantiationService.createInstance(UntitledDocumentTelemetry);
		const kept = accessor.untitledTextEditorService.create();
		await kept.resolve();
		kept.textEditorModel!.setValue('keep me');
		const empty = disposables.add(accessor.untitledTextEditorService.create());
		await empty.resolve();
		const keptId = telemetry.getUntitledDocumentId(kept.resource);

		accessor.lifecycleService.fireShutdown();
		kept.dispose();
		telemetry.dispose();

		assert.deepStrictEqual(untitledEvents('ended').map(e => [e.outcome, e.atShutdown]), [['closedEmpty', true]]);

		const telemetryAfterReload = disposables.add(instantiationService.createInstance(UntitledDocumentTelemetry));
		const restored = disposables.add(accessor.untitledTextEditorService.create({ untitledResource: kept.resource }));

		assert.strictEqual(telemetryAfterReload.getUntitledDocumentId(restored.resource), keptId);
		assert.deepStrictEqual(untitledEvents('created').at(-1), { kind: 'created', untitledDocumentId: keptId, origin: 'other', restored: true, language: 'plaintext', editorId: undefined, msSinceCreated: undefined, outcome: undefined, atShutdown: undefined, savedExt: undefined, sizeBucket: undefined });
	});

	test('language changes: any source for untitled documents, only the picker for other documents', async () => {
		const telemetry = disposables.add(instantiationService.createInstance(UntitledDocumentTelemetry));
		const untitled = disposables.add(accessor.untitledTextEditorService.create());
		await untitled.resolve();
		const file = disposables.add(accessor.modelService.createModel('', null, URI.file('/notes.txt')));

		untitled.textEditorModel!.setLanguage('markdown', LanguageDetectionLanguageEventSource);
		file.setLanguage('markdown');
		file.setLanguage('plaintext', ChangeLanguageAction.ID);

		assert.deepStrictEqual(events.filter(e => e.name === 'documentLanguageChanged').map(e => e.data), [
			{ from: 'plaintext', to: 'markdown', source: 'autoDetect', scheme: 'untitled', untitledDocumentId: telemetry.getUntitledDocumentId(untitled.resource) },
			{ from: 'markdown', to: 'plaintext', source: 'picker', scheme: 'file', untitledDocumentId: undefined },
		]);
		untitled.dispose();
		assert.strictEqual(untitledEvents('ended')[0].language, 'markdown');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
