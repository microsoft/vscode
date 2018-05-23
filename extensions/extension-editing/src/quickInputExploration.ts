/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickInputToolbarItem3, ExtensionContext, commands, QuickPickItem, window, QuickInputSession9, QuickInput3, Disposable, CancellationToken, QuickInput7, QuickInput6 } from 'vscode';

export function activate(context: ExtensionContext) {
	context.subscriptions.push(commands.registerCommand('foobar', async () => {
		const inputs1 = await collectInputs1();
		const inputs2 = await collectInputs2();
		const inputs3 = await collectInputs3();
		const inputs4 = await collectInputs4();
		const inputs5 = await collectInputs5();
		const inputs6 = await collectInputs6();
		const inputs7 = await collectInputs7();
		const inputs8 = await collectInputs8();
		const inputs9 = await collectInputs9();
		const inputs10 = await collectInputs10();
	}));
}

const resourceGroups: QuickPickItem[] = ['vscode-data-function', 'vscode-website-microservices', 'vscode-website-monitor', 'vscode-website-preview', 'vscode-website-prod']
	.map(label => ({ label }));




// #region Take 1 --------------------------------------------------------------------------------

async function collectInputs1() {
	return window.multiStepInput(async (input, token) => {
		const resourceGroup = await input.showQuickPick(resourceGroups, { placeHolder: 'Pick a resource group' });
		if (!resourceGroup || token.isCancellationRequested) {
			return undefined;
		}
		const name = await input.showInputBox({
			prompt: 'Choose a unique name',
			validateInput: value => validateNameIsUnique(value)
		});
		if (!name || token.isCancellationRequested) {
			return undefined;
		}
		const runtimes = await getAvailableRuntimes(resourceGroup, token);
		const runtime = await input.showQuickPick(runtimes, { placeHolder: 'Pick a runtime' });
		return { resourceGroup, name, runtime };
	});
}

// #endregion

// #region Take 2 --------------------------------------------------------------------------------

async function collectInputs2() {
	const input = window.createQuickInput2();
	try {
		const resourceGroup = await input.showQuickPick(resourceGroups, { placeHolder: 'Pick a resource group' });
		if (!resourceGroup || input.token.isCancellationRequested) {
			return undefined;
		}
		const name = await input.showInputBox({
			prompt: 'Choose a unique name',
			validateInput: value => validateNameIsUnique(value)
		});
		if (!name || input.token.isCancellationRequested) {
			return undefined;
		}
		const runtimes = await getAvailableRuntimes(resourceGroup, input.token);
		const runtime = await input.showQuickPick(runtimes, { placeHolder: 'Pick a runtime' });
		return { resourceGroup, name, runtime };
	} finally {
		input.dispose();
	}
}

// #endregion

// #region Take 3 --------------------------------------------------------------------------------

async function collectInputs3() {
	const input = window.createQuickInput3();

	const resourceGroup = await showQuickPick3({
		input,
		placeHolder: 'Pick a resource group',
		items: resourceGroups
	});
	if (!resourceGroup) {
		return undefined;
	}

	const name = await showInputBox3({
		input,
		prompt: 'Choose a unique name',
		validate: validateNameIsUnique
	});
	if (name === undefined) {
		return undefined;
	}

	const runtimes = await getAvailableRuntimes(resourceGroup, null /* token */);
	const runtime = await showQuickPick3({
		input,
		placeHolder: 'Pick a runtime',
		items: runtimes
	});
	if (!runtime) {
		return undefined;
	}

	input.hide();
	return { resourceGroup, name, runtime };
}

interface QuickPickParameters3 {
	input: QuickInput3;
	items: QuickPickItem[];
	placeHolder: string;
}

async function showQuickPick3({ input, items, placeHolder }: QuickPickParameters3) {
	const disposables: Disposable[] = [];
	try {
		return await new Promise<QuickPickItem>(resolve => {
			const { inputBox, message, list } = input;
			inputBox.visible = true;
			inputBox.placeholder = placeHolder;
			inputBox.text = '';
			message.visible = false;
			list.visible = true;
			list.items = items;
			disposables.push(
				list.onDidSelectItem(item => resolve(item)),
				input.onHide(() => resolve(undefined))
			);
			input.show();
		});
	} finally {
		disposables.forEach(d => d.dispose());
	}
}

interface InputBoxParameters3 {
	input: QuickInput3;
	prompt: string;
	validate: (value: string) => Promise<string>;
}

async function showInputBox3({ input, prompt, validate }: InputBoxParameters3) {
	const disposables: Disposable[] = [];
	try {
		return await new Promise<string>(resolve => {
			const { inputBox, message, list } = input;
			inputBox.visible = true;
			inputBox.placeholder = undefined;
			inputBox.text = '';
			message.visible = true;
			message.text = prompt;
			message.severity = 0;
			list.visible = true;
			list.items = undefined;
			let validating = validate('');
			disposables.push(
				inputBox.onDidAccept(async text => {
					if (!(await validate(text))) {
						resolve(text);
					}
				}),
				inputBox.onDidTextChange(async text => {
					const current = validate(text);
					validating = current;
					const validationMessage = await current;
					if (current === validating) {
						if (validationMessage) {
							message.text = validationMessage;
							message.severity = 2;
						} else {
							message.text = prompt;
							message.severity = 0;
						}
					}
				}),
				input.onHide(() => resolve(undefined))
			);
			input.show();
		});
	} finally {
		disposables.forEach(d => d.dispose());
	}
}

// #endregion

// #region Take 4 --------------------------------------------------------------------------------

async function collectInputs4() {
	return window.multiStepInput4('resourceGroup', {
		resourceGroup: {
			kind: 'singlePick',
			items: resourceGroups,
			placeHolder: 'Pick a resource group',
			nextStep: 'name'
		},
		name: {
			kind: 'textInput',
			prompt: 'Choose a unique name',
			validateInput: value => validateNameIsUnique(value),
			nextStep: 'runtime'
		},
		runtime: {
			kind: 'singlePick',
			items: await getAvailableRuntimes(null /* inputs.resourceGroup */, null /* token */),
			placeHolder: 'Pick a runtime'
		},
	});
}

// #endregion

// #region Take 5 --------------------------------------------------------------------------------

async function collectInputs5() {
	return window.multiStepInput5('resourceGroup', {
		resourceGroup: async input => ({
			value: input.showQuickPick(resourceGroups, { placeHolder: 'Pick a resource group' }),
			next: 'name'
		}),
		name: async input => ({
			value: input.showInputBox({
				prompt: 'Choose a unique name',
				validateInput: value => validateNameIsUnique(value)
			}),
			next: 'runtime'
		}),
		runtime: async (input, values) => {
			const runtimes = await getAvailableRuntimes(values.resourceGroup, input.token);
			return { value: input.showQuickPick(runtimes, { placeHolder: 'Pick a runtime' }) };
		}
	});
}

// #endregion

// #region Take 6 --------------------------------------------------------------------------------

async function collectInputs6() {
	const result: Partial<Result> = {};

	const resourceGroup = await window.showQuickPick(resourceGroups, {
		placeHolder: 'Pick a resource group',
		next: chooseName
	});

	async function chooseName(input: QuickInput6, resourceGroup: QuickPickItem) {
		result.resourceGroup = resourceGroup;
		const name = await input.showInputBox({
			prompt: 'Choose a unique name',
			validateInput: value => validateNameIsUnique(value),
			next: chooseRuntime
		});
	}

	async function chooseRuntime(input: QuickInput6, name: string) {
		result.name = name;
		const runtimes = await getAvailableRuntimes(result.resourceGroup, input.token);
		const runtime = await input.showQuickPick(runtimes, { placeHolder: 'Pick a runtime' });
		result.runtime = runtime;
	}

	return <Result>result;
}

// #endregion

// #region Take 7 --------------------------------------------------------------------------------

async function collectInputs7() {
	let step = 1;
	const result: Partial<Result> = {};
	await window.multiStepInput7({
		next: async input => {
			await collectInput7(input, result, ++step);
		},
		previous: async input => {
			await collectInput7(input, result, --step);
		},
		cancel: async input => {
			input.close();
		},
	});
	return <Result>result;
}

async function collectInput7(input: QuickInput7, result: Partial<Result>, step: number) {
	switch (step) {
		case 1:
			result.resourceGroup = await input.showQuickPick(resourceGroups, { placeHolder: 'Pick a resource group' });
			break;
		case 2:
			result.name = await input.showInputBox({
				prompt: 'Choose a unique name',
				validateInput: value => validateNameIsUnique(value)
			});
			break;
		case 3:
			const runtimes = await getAvailableRuntimes(result.resourceGroup, input.token);
			result.runtime = await input.showQuickPick(runtimes, { placeHolder: 'Pick a runtime' });
			break;
		case 4:
			input.close();
			break;
	}
}

// #endregion

// #region Take 8 --------------------------------------------------------------------------------

async function collectInputs8() {
	const session = window.createQuickInputSession();
	try {
		const resourceGroup = await window.showQuickPick(resourceGroups, { placeHolder: 'Pick a resource group', session });
		if (!resourceGroup || session.token.isCancellationRequested) {
			return undefined;
		}
		const name = await window.showInputBox({
			prompt: 'Choose a unique name',
			validateInput: value => validateNameIsUnique(value),
			session
		});
		if (!name || session.token.isCancellationRequested) {
			return undefined;
		}
		const runtimes = await getAvailableRuntimes(resourceGroup, session.token);
		const runtime = await window.showQuickPick(runtimes, { placeHolder: 'Pick a runtime', session });
		return { resourceGroup, name, runtime };
	} finally {
		session.dispose();
	}
}

// #endregion

// #region Take 9 --------------------------------------------------------------------------------

async function collectInputs9() {
	// How to surface 'Back', 'Create Resource Group' as result?

	const result: Partial<Result> = {};

	window.multiStepInput9(async session => {
		result.resourceGroup = await window.showQuickPick(resourceGroups, {
			placeHolder: 'Pick a resource group',
			session
		});
		return chooseName;
	});

	async function chooseName(session: QuickInputSession9) {
		result.name = await window.showInputBox({
			prompt: 'Choose a unique name',
			validateInput: value => validateNameIsUnique(value),
			session
		});
		return chooseRuntime;
	}

	async function chooseRuntime(session: QuickInputSession9) {
		const runtimes = await getAvailableRuntimes(result.resourceGroup, session.token);
		const runtime = await window.showQuickPick(runtimes, { placeHolder: 'Pick a runtime', session });
		result.runtime = runtime;
	}

	return <Result>result;
}

// #endregion

// #region Take 10 --------------------------------------------------------------------------------

interface Result10 {
	resourceGroup: QuickPickItem | string;
	name: string;
	runtime: QuickPickItem;
}

const createResourceGroupItem = { iconPath: 'createResourceGroup.svg' };

async function collectInputs10() {
	const result: Partial<Result10> = {};

	const multiStep = createMultiStepInput([pickResourceGroup]);
	await stepThrough(multiStep);

	async function pickResourceGroup() {
		return showQuickPick10({
			multiStep,
			placeHolder: 'Pick a resource group',
			items: resourceGroups,
			toolbarItems: [createResourceGroupItem],
			triggerToolbarItem: item => inputResourceGroupName,
			pick: item => {
				result.resourceGroup = item;
				return inputName;
			}
		});
	}

	async function inputResourceGroupName() {
		return showInputBox10({
			multiStep,
			prompt: 'Choose a unique name for the resource group',
			validate: validateNameIsUnique,
			accept: text => {
				result.resourceGroup = text;
				return inputName;
			},
			shouldResume: suspend
		});
	}

	async function inputName() {
		return showInputBox10({
			multiStep,
			prompt: 'Choose a unique name for the application service',
			validate: validateNameIsUnique,
			accept: text => {
				result.name = text;
				return pickRuntime;
			},
			shouldResume: suspend
		});
	}

	async function pickRuntime() {
		const runtimes = await getAvailableRuntimes(result.resourceGroup, null /* token */);
		return showQuickPick10({
			multiStep,
			placeHolder: 'Pick a runtime',
			items: runtimes,
			pick: item => {
				result.runtime = item;
			},
			shouldResume: suspend
		});
	}

	function suspend() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {

		});
	}

	return <Result10>result;
}

interface MultiStepInput {
	input: QuickInput3;
	steps: InputStep10[];
}

function createMultiStepInput(steps: InputStep10[]): MultiStepInput {
	return {
		input: window.createQuickInput3(),
		steps
	};
}

type InputStep10 = (() => Thenable<InputStep10>) | void;

async function stepThrough(multiStep: MultiStepInput) {
	let step = multiStep.steps.pop();
	while (step) {
		multiStep.steps.push(step);
		multiStep.input.enabled = false;
		multiStep.input.busy = true;
		try {
			step = await step();
		} catch (e) {
			if (e === 'back') {
				multiStep.steps.pop();
				step = multiStep.steps.pop();
			} if (e === 'resume') {
				multiStep.steps.pop();
			} else {
				throw e;
			}
		}
	}
	multiStep.input.hide();
}

interface QuickPickParameters10 {
	multiStep: MultiStepInput;
	items: QuickPickItem[];
	placeHolder: string;
	toolbarItems?: QuickInputToolbarItem3[]; // TODO
	triggerToolbarItem?: (item: QuickInputToolbarItem3) => InputStep10;
	pick: (item: QuickPickItem) => InputStep10;
	shouldResume?: () => Thenable<boolean>;
}

const backItem: QuickInputToolbarItem3 = { iconPath: 'back.svg' };

async function showQuickPick10({ multiStep, items, placeHolder, pick, shouldResume }: QuickPickParameters10) {
	const disposables: Disposable[] = [];
	try {
		return await new Promise<InputStep10>((resolve, reject) => {
			const { input } = multiStep;
			const { inputBox, toolbar, message, list } = input;
			inputBox.visible = true;
			inputBox.placeholder = placeHolder;
			inputBox.text = '';
			message.visible = false;
			list.visible = true;
			list.items = items;
			toolbar.visible = multiStep.steps.length > 1;
			toolbar.toolbarItems = [backItem];
			toolbar.onDidTriggerToolbarItem(item => {
				if (item === backItem) {
					reject('back');
				}
			});
			disposables.push(
				list.onDidSelectItem(item => resolve(pick(item))),
				input.onHide(() => {
					if (shouldResume) {
						resolve(shouldResume().then(resume => {
							if (resume) {
								// tslint:disable-next-line:no-string-throw
								throw 'resume';
							}
						}));
					} else {
						resolve();
					}
				})
			);
			input.enabled = true;
			input.busy = false;
			input.show();
		});
	} finally {
		disposables.forEach(d => d.dispose());
	}
}

interface InputBoxParameters10 {
	multiStep: MultiStepInput;
	prompt: string;
	validate: (value: string) => Promise<string>;
	toolbarItems?: QuickInputToolbarItem3[]; // TODO
	triggerToolbarItem?: (item: QuickInputToolbarItem3) => InputStep10;
	accept: (text: string) => InputStep10;
	shouldResume?: () => Thenable<boolean>;
}

async function showInputBox10({ multiStep, prompt, validate, accept, shouldResume }: InputBoxParameters10) {
	const disposables: Disposable[] = [];
	try {
		return await new Promise<InputStep10>((resolve, reject) => {
			const { input } = multiStep;
			const { inputBox, toolbar, message, list } = input;
			inputBox.visible = true;
			inputBox.placeholder = undefined;
			inputBox.text = '';
			message.visible = true;
			message.text = prompt;
			message.severity = 0;
			list.visible = true;
			list.items = undefined;
			toolbar.visible = multiStep.steps.length > 1;
			toolbar.toolbarItems = [backItem];
			toolbar.onDidTriggerToolbarItem(item => {
				if (item === backItem) {
					reject('back');
				}
			});
			let validating = validate('');
			disposables.push(
				inputBox.onDidAccept(async text => {
					if (!(await validate(text))) {
						resolve(accept(text));
					}
				}),
				inputBox.onDidTextChange(async text => {
					const current = validate(text);
					validating = current;
					const validationMessage = await current;
					if (current === validating) {
						if (validationMessage) {
							message.text = validationMessage;
							message.severity = 2;
						} else {
							message.text = prompt;
							message.severity = 0;
						}
					}
				}),
				input.onHide(() => {
					if (shouldResume) {
						resolve(shouldResume().then(resume => {
							if (resume) {
								// tslint:disable-next-line:no-string-throw
								throw 'resume';
							}
						}));
					} else {
						resolve();
					}
				})
			);
			input.enabled = true;
			input.busy = false;
			input.show();
		});
	} finally {
		disposables.forEach(d => d.dispose());
	}
}

// #endregion



// ---------------------------------------------------------------------------------------


interface Result {
	resourceGroup: QuickPickItem;
	name: string;
	runtime: QuickPickItem;
}

async function validateNameIsUnique(name: string) {
	// ...validate...
	await new Promise(resolve => setTimeout(resolve, 1000));
	return name === 'vscode' ? 'Name not unique' : undefined;
}

async function getAvailableRuntimes(resourceGroup: QuickPickItem | string, token: CancellationToken): Promise<QuickPickItem[]> {
	// ...retrieve...
	await new Promise(resolve => setTimeout(resolve, 2000));
	return ['Node 8.9', 'Node 6.11', 'Node 4.5']
		.map(label => ({ label }));
}
