/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { FinalNewLineParticipant, TrimFinalNewLinesParticipant, TrimWhitespaceParticipant } from '../../browser/saveParticipants.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../../../test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { TextFileEditorModel } from '../../../../services/textfile/common/textFileEditorModel.js';
import { snapshotToString } from '../../../../services/textfile/common/textfiles.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
suite('Save Participants', function () {
    const disposables = new DisposableStore();
    let instantiationService;
    let accessor;
    setup(() => {
        instantiationService = workbenchInstantiationService(undefined, disposables);
        accessor = instantiationService.createInstance(TestServiceAccessor);
        disposables.add(accessor.textFileService.files);
    });
    teardown(() => {
        disposables.clear();
    });
    test('insert final new line', async function () {
        const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/final_new_line.txt'), 'utf8', undefined));
        await model.resolve();
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('files', { 'insertFinalNewline': true });
        const participant = new FinalNewLineParticipant(configService, undefined);
        // No new line for empty lines
        let lineContent = '';
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), lineContent);
        // No new line if last line already empty
        lineContent = `Hello New Line${model.textEditorModel.getEOL()}`;
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), lineContent);
        // New empty line added (single line)
        lineContent = 'Hello New Line';
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${lineContent}${model.textEditorModel.getEOL()}`);
        // New empty line added (multi line)
        lineContent = `Hello New Line${model.textEditorModel.getEOL()}Hello New Line${model.textEditorModel.getEOL()}Hello New Line`;
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${lineContent}${model.textEditorModel.getEOL()}`);
    });
    test('trim final new lines', async function () {
        const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined));
        await model.resolve();
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
        const participant = new TrimFinalNewLinesParticipant(configService, undefined);
        const textContent = 'Trim New Line';
        const eol = `${model.textEditorModel.getEOL()}`;
        // No new line removal if last line is not new line
        let lineContent = `${textContent}`;
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), lineContent);
        // No new line removal if last line is single new line
        lineContent = `${textContent}${eol}`;
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), lineContent);
        // Remove new line (single line with two new lines)
        lineContent = `${textContent}${eol}${eol}`;
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}${eol}`);
        // Remove new lines (multiple lines with multiple new lines)
        lineContent = `${textContent}${eol}${textContent}${eol}${eol}${eol}`;
        model.textEditorModel.setValue(lineContent);
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}${eol}${textContent}${eol}`);
    });
    test('trim final new lines bug#39750', async function () {
        const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined));
        await model.resolve();
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
        const participant = new TrimFinalNewLinesParticipant(configService, undefined);
        const textContent = 'Trim New Line';
        // single line
        const lineContent = `${textContent}`;
        model.textEditorModel.setValue(lineContent);
        // apply edits and push to undo stack.
        const textEdits = [{ range: new Range(1, 14, 1, 14), text: '.', forceMoveMarkers: false }];
        model.textEditorModel.pushEditOperations([new Selection(1, 14, 1, 14)], textEdits, () => { return [new Selection(1, 15, 1, 15)]; });
        // undo
        await model.textEditorModel.undo();
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}`);
        // trim final new lines should not mess the undo stack
        await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        await model.textEditorModel.redo();
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}.`);
    });
    test('trim final new lines bug#46075', async function () {
        const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined));
        await model.resolve();
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
        const participant = new TrimFinalNewLinesParticipant(configService, undefined);
        const textContent = 'Test';
        const eol = `${model.textEditorModel.getEOL()}`;
        const content = `${textContent}${eol}${eol}`;
        model.textEditorModel.setValue(content);
        // save many times
        for (let i = 0; i < 10; i++) {
            await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        }
        // confirm trimming
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}${eol}`);
        // undo should go back to previous content immediately
        await model.textEditorModel.undo();
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}${eol}${eol}`);
        await model.textEditorModel.redo();
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}${eol}`);
    });
    test('trim whitespace', async function () {
        const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined));
        await model.resolve();
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('files', { 'trimTrailingWhitespace': true });
        const participant = new TrimWhitespaceParticipant(configService, undefined);
        const textContent = 'Test';
        const content = `${textContent} 	`;
        model.textEditorModel.setValue(content);
        // save many times
        for (let i = 0; i < 10; i++) {
            await participant.participate(model, { reason: 1 /* SaveReason.EXPLICIT */ });
        }
        // confirm trimming
        assert.strictEqual(snapshotToString(model.createSnapshot()), `${textContent}`);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2F2ZVBhcnRpY2lwYW50LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL3Rlc3QvYnJvd3Nlci9zYXZlUGFydGljaXBhbnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLHVCQUF1QixFQUFFLDRCQUE0QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDckksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkgsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLFVBQVUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQy9HLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDM0UsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEcsT0FBTyxFQUFnQyxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBR25ILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUxRSxLQUFLLENBQUMsbUJBQW1CLEVBQUU7SUFFMUIsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxJQUFJLG9CQUEyQyxDQUFDO0lBQ2hELElBQUksUUFBNkIsQ0FBQztJQUVsQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysb0JBQW9CLEdBQUcsNkJBQTZCLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzdFLFFB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