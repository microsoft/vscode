// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { CodeActionContext, CodeActionKind, Diagnostic, Range, TextDocument, Uri } from 'vscode';
import { LaunchJsonCodeActionProvider } from '../../../client/providers/codeActionProvider/launchJsonCodeActionProvider';

suite('LaunchJson CodeAction Provider', () => {
    const documentUri = Uri.parse('a');
    let document: TypeMoq.IMock<TextDocument>;
    let range: TypeMoq.IMock<Range>;
    let context: TypeMoq.IMock<CodeActionContext>;
    let diagnostic: TypeMoq.IMock<Diagnostic>;
    let codeActionsProvider: LaunchJsonCodeActionProvider;

    setup(() => {
        codeActionsProvider = new LaunchJsonCodeActionProvider();
        document = TypeMoq.Mock.ofType<TextDocument>();
        range = TypeMoq.Mock.ofType<Range>();
        context = TypeMoq.Mock.ofType<CodeActionContext>();
        diagnostic = TypeMoq.Mock.ofType<Diagnostic>();
        document.setup((d) => d.getText(TypeMoq.It.isAny())).returns(() => 'Diagnostic text');
        document.setup((d) => d.uri).returns(() => documentUri);
        context.setup((c) => c.diagnostics).returns(() => [diagnostic.object]);
    });

    test('Ensure correct code action is returned if diagnostic message equals `Incorrect type. Expected "string".`', async () => {
        diagnostic.setup((d) => d.message).returns(() => 'Incorrect type. Expected "string".');
        diagnostic.setup((d) => d.range).returns(() => new Range(2, 0, 7, 8));

        const codeActions = codeActionsProvider.provideCodeActions(document.object, range.object, context.object);

        // Now ensure that the code action object is as expected
        expect(codeActions).to.have.length(1);
        expect(codeActions[0].kind).to.eq(CodeActionKind.QuickFix);
        expect(codeActions[0].title).to.equal('Convert to "Diagnostic text"');

        // Ensure the correct TextEdit is provided
        const entries = codeActions[0].edit!.entries();
        // Edits the correct document is edited
        assert.deepEqual(entries[0][0], documentUri);
        const edit = entries[0][1][0];
        // Final text is as expected
        expect(edit.newText).to.equal('"Diagnostic text"');
        // Text edit range is as expected
        expect(edit.range.isEqual(new Range(2, 0, 7, 8))).to.equal(true, 'Text edit range not as expected');
    });

    test('Ensure no code action is returned if diagnostic message does not equal `Incorrect type. Expected "string".`', async () => {
        diagnostic.setup((d) => d.message).returns(() => 'Random diagnostic message');

        const codeActions = codeActionsProvider.provideCodeActions(document.object, range.object, context.object);

        expect(codeActions).to.have.length(0);
    });
});
