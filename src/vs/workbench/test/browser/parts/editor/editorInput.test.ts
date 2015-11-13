/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {EditorInput} from 'vs/workbench/common/editor';
import {EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {DiffEditorInput} from 'vs/workbench/browser/parts/editor/diffEditorInput';
import {ResourceEditorInput} from 'vs/workbench/browser/parts/editor/resourceEditorInput';

class MyEditorInput extends EditorInput {
	getMime() {
		return 'text/css';
	}

	public getId(): string {
		return '';
	}

	public resolve(refresh?: boolean): any {
		return null;
	}
}

suite("Workbench - EditorInput", () => {

	test("EditorInput", function() {
		let counter = 0;
		let input = new MyEditorInput();
		let otherInput = new MyEditorInput();

		assert(input.matches(input));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(!input.getName());

		input.addListener("dispose", function() {
			assert(true);
			counter++;
		});

		input.dispose();
		assert.equal(counter, 1);
	});

	test("DiffEditorInput", function() {
		let counter = 0;
		let input = new MyEditorInput();
		input.addListener("dispose", function() {
			assert(true);
			counter++;
		});

		let otherInput = new MyEditorInput();
		otherInput.addListener("dispose", function() {
			assert(true);
			counter++;
		});

		let diffInput = new DiffEditorInput("name", "description", input, otherInput);

		assert.equal(diffInput.getOriginalInput(), input);
		assert.equal(diffInput.getModifiedInput(), otherInput);
		assert(diffInput.matches(diffInput));
		assert(!diffInput.matches(otherInput));
		assert(!diffInput.matches(null));

		diffInput.dispose();
		assert.equal(counter, 2);
	});

	test("DiffEditorInput disposes when input inside disposes", function() {
		let counter = 0;
		let input = new MyEditorInput();
		let otherInput = new MyEditorInput();

		let diffInput = new DiffEditorInput("name", "description", input, otherInput);
		diffInput.addListener("dispose", function() {
			counter++;
			assert(true);
		});

		input.dispose();

		input = new MyEditorInput();
		otherInput = new MyEditorInput();

		let diffInput2 = new DiffEditorInput("name", "description", input, otherInput);
		diffInput2.addListener("dispose", function() {
			counter++;
			assert(true);
		});

		otherInput.dispose();
		assert.equal(counter, 2);
	});

	test("DiffEditorInput - get preferred editor", function() {
		let input: EditorInput = new ResourceEditorInput("name", "description", "url", "text/css", void 0, void 0, void 0, null);
		let otherInput: EditorInput = new ResourceEditorInput("name2", "description", "url2", "text/html", void 0, void 0, void 0, null);
		let diffInput = new DiffEditorInput("name", "description", input, otherInput);

		assert.strictEqual(diffInput.getPreferredEditorId([]), 'workbench.editors.textDiffEditor');

		input = new ResourceEditorInput("name", "description", "url", "text/css", void 0, void 0, void 0, null);
		otherInput = new ResourceEditorInput("name2", "description", "url2", "application/zip, application/octet-stream", void 0, void 0, void 0, null);
		diffInput = new DiffEditorInput("name", "description", input, otherInput);

		assert.strictEqual(diffInput.getPreferredEditorId([]), 'workbench.editors.binaryResourceDiffEditor');

		input = new MyEditorInput();
		otherInput = new MyEditorInput();

		diffInput = new DiffEditorInput("name", "description", input, otherInput);

		assert.strictEqual(diffInput.getPreferredEditorId([]), 'workbench.editors.textDiffEditor');
	});

	test("ResourceEditorInput", function() {
		let input = new ResourceEditorInput("name", "description", "url", "mime", void 0, void 0, void 0, null);
		let otherInput = new ResourceEditorInput("name2", "description", "url2", "mime2", void 0, void 0, void 0, null);

		assert(input.matches(input));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
	});

	test("ResourceEditorInput#getPreferredEditorId", function() {
		let editors = ['workbench.editors.stringEditor', 'workbench.editors.binaryResourceEditor'];

		let input = new ResourceEditorInput("name", "description", "url", "text/plain", void 0, void 0, void 0, null);
		assert(input.getPreferredEditorId(editors) === 'workbench.editors.stringEditor');

		input = new ResourceEditorInput("name", "description", "url", "application/foo, text/plain", void 0, void 0, void 0, null);
		assert(input.getPreferredEditorId(editors) === 'workbench.editors.stringEditor');

		input = new ResourceEditorInput("name", "description", "url", "application/xml, text/plain", void 0, void 0, void 0, null);
		assert(input.getPreferredEditorId(editors) === 'workbench.editors.stringEditor');

		input = new ResourceEditorInput("name", "description", "url", "application/octet-stream", void 0, void 0, void 0, null);
		assert(input.getPreferredEditorId(editors) === 'workbench.editors.binaryResourceEditor');

		input = new ResourceEditorInput("name", "description", "url", "image/png, application/octet-stream", void 0, void 0, void 0, null);
		assert(input.getPreferredEditorId(editors) === 'workbench.editors.binaryResourceEditor');
	});
});