/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickInputToolbarItem3, ExtensionContext, commands, QuickPickItem, window, QuickInputSession9, QuickInput3, Disposable, CancellationToken, QuickInput7, QuickInput6, QuickInput11, QuickInputToolbarItem11 } from 'vscode';

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
		const inputs11 = await collectInputs11();
		const inputs12 = await collectInputs12();
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

const createResourceGroupItem10 = { iconPath: 'createResourceGroup.svg' };

async function collectInputs10() {
	const result: Partial<Result10> = {};

	const multiStep = createMultiStepInput10([pickResourceGroup]);
	await stepThrough10(multiStep);

	async function pickResourceGroup() {
		return showQuickPick10({
			multiStep,
			placeHolder: 'Pick a resource group',
			items: resourceGroups,
			toolbarItems: [createResourceGroupItem10],
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

interface MultiStepInput10 {
	input: QuickInput3;
	steps: InputStep10[];
}

function createMultiStepInput10(steps: InputStep10[]): MultiStepInput10 {
	return {
		input: window.createQuickInput3(),
		steps
	};
}

type InputStep10 = (() => Thenable<InputStep10>) | void;

async function stepThrough10(multiStep: MultiStepInput10) {
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
	multiStep: MultiStepInput10;
	items: QuickPickItem[];
	placeHolder: string;
	toolbarItems?: QuickInputToolbarItem3[]; // TODO
	triggerToolbarItem?: (item: QuickInputToolbarItem3) => InputStep10;
	pick: (item: QuickPickItem) => InputStep10;
	shouldResume?: () => Thenable<boolean>;
}

const backItem10: QuickInputToolbarItem3 = { iconPath: 'back.svg' };

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
			toolbar.toolbarItems = [backItem10];
			toolbar.onDidTriggerToolbarItem(item => {
				if (item === backItem10) {
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
	multiStep: MultiStepInput10;
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
			toolbar.toolbarItems = [backItem10];
			toolbar.onDidTriggerToolbarItem(item => {
				if (item === backItem10) {
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

// #region Take 11 --------------------------------------------------------------------------------

interface Result11 {
	resourceGroup: QuickPickItem | string;
	name: string;
	runtime: QuickPickItem;
}

async function collectInputs11() {
	return (await MultiStepInput11.run(pickResourceGroup11, {} as Partial<Result11>)) as Result11;
}

class MyToolbarItem11 implements QuickInputToolbarItem11 {
	constructor(public iconPath: string) { }
}

async function pickResourceGroup11(input: MultiStepInput11, state: Partial<Result11>) {
	const createResourceGroupItem11 = new MyToolbarItem11('createResourceGroup.svg');
	const pick = await input.showQuickPick11({
		placeHolder: 'Pick a resource group',
		items: resourceGroups,
		toolbarItems: [createResourceGroupItem11]
	});
	if (pick instanceof InputFlowAction11) {
		return pick;
	}
	if (pick instanceof MyToolbarItem11) {
		return inputResourceGroupName11;
	}
	state.resourceGroup = pick;
	return inputName11;
}

async function inputResourceGroupName11(input: MultiStepInput11, state: Partial<Result11>) {
	const name = await input.showInputBox11({
		prompt: 'Choose a unique name for the resource group',
		validate: validateNameIsUnique
	});
	if (name === InputFlowAction11.cancel && await suspend11()) {
		return InputFlowAction11.resume;
	}
	if (name instanceof InputFlowAction11) {
		return name;
	}
	state.resourceGroup = name;
	return inputName11;
}

async function inputName11(input: MultiStepInput11, state: Partial<Result11>) {
	const name = await input.showInputBox11({
		prompt: 'Choose a unique name for the application service',
		validate: validateNameIsUnique
	});
	if (name === InputFlowAction11.cancel && await suspend11()) {
		return InputFlowAction11.resume;
	}
	if (name instanceof InputFlowAction11) {
		return name;
	}
	state.name = name;
	return pickRuntime11;
}

async function pickRuntime11(input: MultiStepInput11, state: Partial<Result11>) {
	const runtimes = await getAvailableRuntimes(state.resourceGroup, null /* token */);
	const runtime = await input.showQuickPick11({
		placeHolder: 'Pick a runtime',
		items: runtimes
	});
	if (runtime === InputFlowAction11.cancel && await suspend11()) {
		return InputFlowAction11.resume;
	}
	if (runtime instanceof InputFlowAction11) {
		return runtime;
	}
	state.runtime = runtime;
}

function suspend11() {
	// Could show a notification with the option to resume.
	return new Promise<boolean>((resolve, reject) => {

	});
}

class InputFlowAction11 {
	private constructor() { }
	static back = new InputFlowAction11();
	static cancel = new InputFlowAction11();
	static resume = new InputFlowAction11();
}

type InputStep11<T> = (input: MultiStepInput11, state: T) => Thenable<InputStep11<T> | InputFlowAction11 | void>;

interface QuickPickParameters11 {
	items: QuickPickItem[];
	placeHolder: string;
	toolbarItems?: QuickInputToolbarItem11[]; // TODO
}

interface InputBoxParameters11 {
	prompt: string;
	validate: (value: string) => Promise<string>;
	toolbarItems?: QuickInputToolbarItem11[]; // TODO
}

const backItem11: QuickInputToolbarItem11 = { iconPath: 'back.svg' };

class MultiStepInput11 {

	static async run<T>(start: InputStep11<T>, state: T) {
		const input = new MultiStepInput11();
		return input.stepThrough11(start, state);
	}

	private current?: QuickInput11;
	private steps: InputStep11<any>[] = [];

	private async stepThrough11<T>(start: InputStep11<T>, state: T) {
		let step: InputStep11<T> | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			let next = await step(this, state);
			if (next === 'back') {
				this.steps.pop();
				step = this.steps.pop();
			} if (next === 'resume') {
				step = this.steps.pop();
			} else {
				step = next;
			}
		}
		if (this.current) {
			this.current.dispose();
		}
		return state;
	}

	async showQuickPick11<P extends QuickPickParameters11>({ items, placeHolder }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<QuickPickItem | (P extends { toolbarItems: (infer I)[] } ? I : never) | InputFlowAction11>((resolve, reject) => {
				const input = window.createQuickPick11();
				const { inputBox, toolbar, list } = input;
				inputBox.placeholder = placeHolder;
				list.items = items;
				toolbar.toolbarItems = this.steps.length > 1 ? [backItem11] : [];
				disposables.push(
					input,
					toolbar.onDidTriggerToolbarItem(item => {
						if (item === backItem11) {
							resolve(InputFlowAction11.back);
						}
					}),
					list.onDidSelectItem(item => resolve(item)),
					input.onHide(() => resolve(InputFlowAction11.cancel))
				);
				if (this.current) {
					this.current.replace(input);
				} else {
					input.show();
				}
				this.current = input;
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox11<P extends InputBoxParameters11>({ prompt, validate }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { toolbarItems: QuickInputToolbarItem11[] } ? QuickInputToolbarItem11 : never) | InputFlowAction11>((resolve, reject) => {
				const input = window.createInputBox11();
				const { inputBox, toolbar, message } = input;
				message.text = prompt;
				message.severity = 0;
				toolbar.toolbarItems = this.steps.length > 1 ? [backItem11] : [];
				let validating = validate('');
				disposables.push(
					input,
					toolbar.onDidTriggerToolbarItem(item => {
						if (item === backItem11) {
							resolve(InputFlowAction11.back);
						}
					}),
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
					input.onHide(() => resolve(InputFlowAction11.cancel))
				);
				if (this.current) {
					this.current.replace(input);
				} else {
					input.show();
				}
				this.current = input;
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}

// #endregion

// #region Take 12 --------------------------------------------------------------------------------

interface Result12 {
	resourceGroup: QuickPickItem | string;
	name: string;
	runtime: QuickPickItem;
}

async function collectInputs12() {
	const result = {} as Partial<Result12>;
	await MultiStepInput12.run(input => pickResourceGroup12(input, {}));
	return result;
}

class MyToolbarItem12 implements QuickInputToolbarItem11 {
	constructor(public iconPath: string) { }
}

async function pickResourceGroup12(input: MultiStepInput12, state: Partial<Result12>) {
	const createResourceGroupItem12 = new MyToolbarItem12('createResourceGroup.svg');
	const pick = await input.showQuickPick12({
		placeHolder: 'Pick a resource group',
		items: resourceGroups,
		toolbarItems: [createResourceGroupItem12],
		shouldResume: shouldResume12
	});
	if (pick instanceof MyToolbarItem12) {
		return (input: MultiStepInput12) => inputResourceGroupName12(input, state);
	}
	state.resourceGroup = pick;
	return (input: MultiStepInput12) => inputName12(input, state);
}

async function inputResourceGroupName12(input: MultiStepInput12, state: Partial<Result12>) {
	state.resourceGroup = await input.showInputBox12({
		prompt: 'Choose a unique name for the resource group',
		validate: validateNameIsUnique,
		shouldResume: shouldResume12
	});
	return (input: MultiStepInput12) => inputName12(input, state);
}

async function inputName12(input: MultiStepInput12, state: Partial<Result12>) {
	state.name = await input.showInputBox12({
		prompt: 'Choose a unique name for the application service',
		validate: validateNameIsUnique,
		shouldResume: shouldResume12
	});
	return (input: MultiStepInput12) => pickRuntime12(input, state);
}

async function pickRuntime12(input: MultiStepInput12, state: Partial<Result12>) {
	const runtimes = await getAvailableRuntimes(state.resourceGroup, null /* token */);
	state.runtime = await input.showQuickPick12({
		placeHolder: 'Pick a runtime',
		items: runtimes,
		shouldResume: shouldResume12
	});
}

function shouldResume12() {
	// Could show a notification with the option to resume.
	return new Promise<boolean>((resolve, reject) => {

	});
}

class InputFlowAction12 {
	private constructor() { }
	static back = new InputFlowAction12();
	static cancel = new InputFlowAction12();
	static resume = new InputFlowAction12();
}

type InputStep12 = (input: MultiStepInput12) => Thenable<InputStep12 | void>;

interface QuickPickParameters12 {
	items: QuickPickItem[];
	placeHolder: string;
	toolbarItems?: QuickInputToolbarItem11[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters12 {
	prompt: string;
	validate: (value: string) => Promise<string>;
	toolbarItems?: QuickInputToolbarItem11[];
	shouldResume: () => Thenable<boolean>;
}

const backItem12: QuickInputToolbarItem11 = { iconPath: 'back.svg' };

class MultiStepInput12 {

	static async run<T>(start: InputStep12) {
		const input = new MultiStepInput12();
		return input.stepThrough12(start);
	}

	private current?: QuickInput11;
	private steps: InputStep12[] = [];

	private async stepThrough12<T>(start: InputStep12) {
		let step: InputStep12 | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction12.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction12.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction12.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick12<P extends QuickPickParameters12>({ items, placeHolder, toolbarItems, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<QuickPickItem | (P extends { toolbarItems: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick11();
				const { inputBox, toolbar, list } = input;
				inputBox.placeholder = placeHolder;
				list.items = items;
				toolbar.toolbarItems = [
					...(this.steps.length > 1 ? [backItem12] : []),
					...(toolbarItems || [])
				];
				disposables.push(
					input,
					toolbar.onDidTriggerToolbarItem(item => {
						if (item === backItem12) {
							reject(InputFlowAction12.back);
						}
					}),
					list.onDidSelectItem(item => resolve(item)),
					input.onHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction12.resume : InputFlowAction12.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.replace(input);
				} else {
					input.show();
				}
				this.current = input;
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox12<P extends InputBoxParameters12>({ prompt, validate, toolbarItems, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { toolbarItems: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox11();
				const { inputBox, toolbar, message } = input;
				message.text = prompt;
				message.severity = 0;
				toolbar.toolbarItems = [
					...(this.steps.length > 1 ? [backItem12] : []),
					...(toolbarItems || [])
				];
				let validating = validate('');
				disposables.push(
					input,
					toolbar.onDidTriggerToolbarItem(item => {
						if (item === backItem12) {
							reject(InputFlowAction12.back);
						}
					}),
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
					input.onHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction12.resume : InputFlowAction12.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.replace(input);
				} else {
					input.show();
				}
				this.current = input;
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
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
