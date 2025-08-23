// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import { TextDocument, TextEditor } from 'vscode';
import { PYTHON_LANGUAGE } from '../../../../../client/common/constants';
import * as windowApis from '../../../../../client/common/vscodeApis/windowApis';
import { getProgram } from '../../../../../client/debugger/extension/configuration/resolvers/helper';

suite('Debugging - Helpers', () => {
    let getActiveTextEditorStub: sinon.SinonStub;

    setup(() => {
        getActiveTextEditorStub = sinon.stub(windowApis, 'getActiveTextEditor');
    });
    teardown(() => {
        sinon.restore();
    });

    test('Program should return filepath of active editor if file is python', () => {
        const expectedFileName = 'my.py';
        const editor = typemoq.Mock.ofType<TextEditor>();
        const doc = typemoq.Mock.ofType<TextDocument>();

        editor
            .setup((e) => e.document)
            .returns(() => doc.object)
            .verifiable(typemoq.Times.once());
        doc.setup((d) => d.languageId)
            .returns(() => PYTHON_LANGUAGE)
            .verifiable(typemoq.Times.once());
        doc.setup((d) => d.fileName)
            .returns(() => expectedFileName)
            .verifiable(typemoq.Times.once());

        getActiveTextEditorStub.returns(editor.object);

        const program = getProgram();

        expect(program).to.be.equal(expectedFileName);
    });
    test('Program should return undefined if active file is not python', () => {
        const editor = typemoq.Mock.ofType<TextEditor>();
        const doc = typemoq.Mock.ofType<TextDocument>();

        editor
            .setup((e) => e.document)
            .returns(() => doc.object)
            .verifiable(typemoq.Times.once());
        doc.setup((d) => d.languageId)
            .returns(() => 'C#')
            .verifiable(typemoq.Times.once());
        getActiveTextEditorStub.returns(editor.object);

        const program = getProgram();

        expect(program).to.be.equal(undefined, 'Not undefined');
    });
    test('Program should return undefined if there is no active editor', () => {
        getActiveTextEditorStub.returns(undefined);

        const program = getProgram();

        expect(program).to.be.equal(undefined, 'Not undefined');
    });
});
