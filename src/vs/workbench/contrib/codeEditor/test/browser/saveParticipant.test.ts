/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { FinalNewLineParticipant, TrimFinalNewLinesParticipant, TrimWhitespaceParticipant } from '../../browser/saveParticipants.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../../../test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ISelection, Selection } from '../../../../../editor/common/core/selection.js';
import { TextFileEditorModel } from '../../../../services/textfile/common/textFileEditorModel.js';
import { IResolvedTextFileEditorModel, snapshotToString } from '../../../../services/textfile/common/textfiles.js';
import { IVisibleEditorPane, SaveReason } from '../../../../common/editor.js';
import { TextFileEditorModelManager } from '../../../../services/textfile/common/textFileEditorModelManager.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { CustomEditorInput } from '../../../customEditor/browser/customEditorInput.js';
import { ICustomTextEditorNavigation } from '../../../customEditor/common/customTextEditorNavigation.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { SideBySideEditor } from '../../../../browser/parts/editor/sideBySideEditor.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';

suite('Save Participants', function () {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(<TextFileEditorModelManager>accessor.textFileService.files);
	});

	teardown(() => {
		disposables.clear();
	});

	test('insert final new line', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'insertFinalNewline': true });
		const participant = new FinalNewLineParticipant(configService, undefined!);

		// No new line for empty lines
		let lineContent = '';
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// No new line if last line already empty
		lineContent = `Hello New Line${model.textEditorModel.getEOL()}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// New empty line added (single line)
		lineContent = 'Hello New Line';
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${lineContent}${model.textEditorModel.getEOL()}`);

		// New empty line added (multi line)
		lineContent = `Hello New Line${model.textEditorModel.getEOL()}Hello New Line${model.textEditorModel.getEOL()}Hello New Line`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${lineContent}${model.textEditorModel.getEOL()}`);
	});

	test('trim final new lines', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!, undefined!, undefined!);
		const textContent = 'Trim New Line';
		const eol = `${model.textEditorModel.getEOL()}`;

		// No new line removal if last line is not new line
		let lineContent = `${textContent}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// No new line removal if last line is single new line
		lineContent = `${textContent}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// Remove new line (single line with two new lines)
		lineContent = `${textContent}${eol}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);

		// Remove new lines (multiple lines with multiple new lines)
		lineContent = `${textContent}${eol}${textContent}${eol}${eol}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}${textContent}${eol}`);
	});

	test('trim final new lines bug#39750', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!, undefined!, undefined!);
		const textContent = 'Trim New Line';

		// single line
		const lineContent = `${textContent}`;
		model.textEditorModel.setValue(lineContent);

		// apply edits and push to undo stack.
		const textEdits = [{ range: new Range(1, 14, 1, 14), text: '.', forceMoveMarkers: false }];
		model.textEditorModel.pushEditOperations([new Selection(1, 14, 1, 14)], textEdits, () => { return [new Selection(1, 15, 1, 15)]; });

		// undo
		await model.textEditorModel.undo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}`);

		// trim final new lines should not mess the undo stack
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		await model.textEditorModel.redo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}.`);
	});

	test('trim final new lines bug#46075', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!, undefined!, undefined!);
		const textContent = 'Test';
		const eol = `${model.textEditorModel.getEOL()}`;
		const content = `${textContent}${eol}${eol}`;
		model.textEditorModel.setValue(content);

		// save many times
		for (let i = 0; i < 10; i++) {
			await participant.participate(model, { reason: SaveReason.EXPLICIT });
		}

		// confirm trimming
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);

		// undo should go back to previous content immediately
		await model.textEditorModel.undo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}${eol}`);
		await model.textEditorModel.redo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);
	});

	test('trim whitespace', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimTrailingWhitespace': true });
		const participant = new TrimWhitespaceParticipant(configService, undefined!, undefined!, undefined!);
		const textContent = 'Test';
		const content = `${textContent} 	`;
		model.textEditorModel.setValue(content);

		// save many times
		for (let i = 0; i < 10; i++) {
			await participant.participate(model, { reason: SaveReason.EXPLICIT });
		}

		// confirm trimming
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}`);
	});

	async function createCustomEditorFixture(this: Mocha.Context, navigationSelection: ISelection | undefined, layout: 'single' | 'sideBySideDiff' = 'single') {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/custom_editor.md'), 'utf8', undefined) as IResolvedTextFileEditorModel);
		await model.resolve();
		const webview = upcastPartial<IOverlayWebview>({ onMessage: Event.None, dispose: () => { } });
		const input = disposables.add(instantiationService.createInstance(CustomEditorInput, { resource: model.resource, viewType: 'test.richMarkdown', webviewTitle: undefined, preferredName: 'custom_editor.md', iconPath: undefined }, webview, {}));
		if (navigationSelection) {
			input.navigation = upcastPartial<ICustomTextEditorNavigation>({ model: model.textEditorModel, selection: navigationSelection });
		}
		const pane = upcastPartial<IVisibleEditorPane>({ input, getControl: () => undefined });
		const visiblePane: IVisibleEditorPane = layout === 'single' ? pane : Object.assign(Object.create(SideBySideEditor.prototype) as IVisibleEditorPane, {
			getPrimaryEditorPane: () => pane,
			getSecondaryEditorPane: () => upcastPartial<IVisibleEditorPane>({ input: upcastPartial<CustomEditorInput>({ resource: toResource.call(this, '/path/original.md') }), getControl: () => undefined }),
		});
		const editorService = upcastPartial<IEditorService>({ visibleEditorPanes: [visiblePane] });
		const uriIdentityService = instantiationService.invokeFunction(accessor => accessor.get(IUriIdentityService));
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimTrailingWhitespace': true, 'trimFinalNewlines': true });
		const participants = [
			new TrimWhitespaceParticipant(configService, undefined!, editorService, uriIdentityService),
			new TrimFinalNewLinesParticipant(configService, undefined!, editorService, uriIdentityService),
		];
		const eol = model.textEditorModel.getEOL();
		const save = async (reason: SaveReason) => {
			for (const participant of participants) {
				await participant.participate(model, { reason });
			}
			return snapshotToString(model.createSnapshot()!).split(eol);
		};
		model.textEditorModel.setValue(['Hello ', 'World  ', '', '', ''].join(eol));
		return save;
	}

	test('auto save spares the cursor line of a custom text editor', async function () {
		const save = await createCustomEditorFixture.call(this, { selectionStartLineNumber: 1, selectionStartColumn: 7, positionLineNumber: 1, positionColumn: 7 });
		assert.deepStrictEqual(await save(SaveReason.AUTO), ['Hello ', 'World', '']);
		assert.deepStrictEqual(await save(SaveReason.EXPLICIT), ['Hello', 'World', '']);
	});

	test('auto save does not trim while a non-code editor without a cursor shows the model', async function () {
		const save = await createCustomEditorFixture.call(this, undefined);
		assert.deepStrictEqual(await save(SaveReason.AUTO), ['Hello ', 'World  ', '', '', '']);
		assert.deepStrictEqual(await save(SaveReason.EXPLICIT), ['Hello', 'World', '']);
	});

	test('auto save spares the cursor line of a custom text editor inside a side-by-side diff', async function () {
		const save = await createCustomEditorFixture.call(this, { selectionStartLineNumber: 1, selectionStartColumn: 7, positionLineNumber: 1, positionColumn: 7 }, 'sideBySideDiff');
		assert.deepStrictEqual(await save(SaveReason.AUTO), ['Hello ', 'World', '']);
	});

	test('auto save does not trim while a custom editor without a cursor is inside a side-by-side diff', async function () {
		const save = await createCustomEditorFixture.call(this, undefined, 'sideBySideDiff');
		assert.deepStrictEqual(await save(SaveReason.AUTO), ['Hello ', 'World  ', '', '', '']);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
