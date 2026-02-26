/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { RenameWidget } from '../../../../editor/contrib/rename/browser/renameWidget.js';

import '../../../../editor/contrib/rename/browser/renameWidget.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';

const SAMPLE_CODE = `class UserService {
	private _users: Map<string, User> = new Map();

	getUser(userId: string): User | undefined {
		return this._users.get(userId);
	}

	addUser(user: User): void {
		this._users.set(user.id, user);
	}
}
`;

interface RenameFixtureOptions extends ComponentFixtureContext {
	cursorLine: number;
	cursorColumn: number;
	currentName: string;
	rangeStartColumn: number;
	rangeEndColumn: number;
}

function renderRenameWidget(options: RenameFixtureOptions): void {
	const { container, disposableStore, theme } = options;
	container.style.width = '500px';
	container.style.height = '280px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://rename-fixture.ts'),
		'typescript'
	));

	const editorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			cursorBlinking: 'solid',
		},
		editorWidgetOptions
	));

	editor.setModel(textModel);
	editor.setPosition({ lineNumber: options.cursorLine, column: options.cursorColumn });

	const renameWidget = instantiationService.createInstance(
		RenameWidget,
		editor,
		['editor.action.rename', 'editor.action.rename'],
	);
	disposableStore.add(renameWidget);

	const cts = new CancellationTokenSource();
	disposableStore.add(cts);

	renameWidget.getInput(
		{
			startLineNumber: options.cursorLine,
			startColumn: options.rangeStartColumn,
			endLineNumber: options.cursorLine,
			endColumn: options.rangeEndColumn,
		},
		options.currentName,
		false,
		undefined,
		cts
	);
}

export default defineThemedFixtureGroup({
	RenameVariable: defineComponentFixture({
		render: (context) => renderRenameWidget({
			...context,
			cursorLine: 4,
			cursorColumn: 2,
			currentName: 'getUser',
			rangeStartColumn: 2,
			rangeEndColumn: 9,
		}),
	}),
	RenameClass: defineComponentFixture({
		render: (context) => renderRenameWidget({
			...context,
			cursorLine: 1,
			cursorColumn: 7,
			currentName: 'UserService',
			rangeStartColumn: 7,
			rangeEndColumn: 18,
		}),
	}),
});
