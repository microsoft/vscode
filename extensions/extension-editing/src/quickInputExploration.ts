/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, commands, QuickPickItem, window, Disposable, CancellationToken, QuickInputCommand, QuickInput } from 'vscode';

export function activate(context: ExtensionContext) {
	context.subscriptions.push(commands.registerCommand('foobar', async () => {
		const inputs = await collectInputs();
		console.log(inputs);
	}));
}

const resourceGroups: QuickPickItem[] = ['vscode-data-function', 'vscode-website-microservices', 'vscode-website-monitor', 'vscode-website-preview', 'vscode-website-prod']
	.map(label => ({ label }));


interface Result {
	resourceGroup: QuickPickItem | string;
	name: string;
	runtime: QuickPickItem;
}

async function collectInputs() {
	const result = {} as Partial<Result>;
	await MultiStepInput.run(input => pickResourceGroup(input, {}));
	return result;
}

class MyCommand implements QuickInputCommand {
	constructor(public iconPath: string) { }
}

async function pickResourceGroup(input: MultiStepInput, state: Partial<Result>) {
	const createResourceGroupItem = new MyCommand('createResourceGroup.svg');
	const pick = await input.showQuickPick({
		placeHolder: 'Pick a resource group',
		items: resourceGroups,
		commands: [createResourceGroupItem],
		shouldResume: shouldResume
	});
	if (pick instanceof MyCommand) {
		return (input: MultiStepInput) => inputResourceGroupName(input, state);
	}
	state.resourceGroup = pick;
	return (input: MultiStepInput) => inputName(input, state);
}

async function inputResourceGroupName(input: MultiStepInput, state: Partial<Result>) {
	state.resourceGroup = await input.showInputBox({
		prompt: 'Choose a unique name for the resource group',
		validate: validateNameIsUnique,
		shouldResume: shouldResume
	});
	return (input: MultiStepInput) => inputName(input, state);
}

async function inputName(input: MultiStepInput, state: Partial<Result>) {
	state.name = await input.showInputBox({
		prompt: 'Choose a unique name for the application service',
		validate: validateNameIsUnique,
		shouldResume: shouldResume
	});
	return (input: MultiStepInput) => pickRuntime(input, state);
}

async function pickRuntime(input: MultiStepInput, state: Partial<Result>) {
	const runtimes = await getAvailableRuntimes(state.resourceGroup, null /* token */);
	state.runtime = await input.showQuickPick({
		placeHolder: 'Pick a runtime',
		items: runtimes,
		shouldResume: shouldResume
	});
}

function shouldResume() {
	// Could show a notification with the option to resume.
	return new Promise<boolean>((resolve, reject) => {

	});
}

class InputFlowAction {
	private constructor() { }
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters {
	items: QuickPickItem[];
	placeHolder: string;
	commands?: QuickInputCommand[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	prompt: string;
	validate: (value: string) => Promise<string>;
	commands?: QuickInputCommand[];
	shouldResume: () => Thenable<boolean>;
}

const backItem: QuickInputCommand = { iconPath: 'back.svg' };

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
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

	async showQuickPick<P extends QuickPickParameters>({ items, placeHolder, commands, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<QuickPickItem | (P extends { commands: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick();
				input.placeholder = placeHolder;
				input.items = items;
				input.commands = [
					...(this.steps.length > 1 ? [backItem] : []),
					...(commands || [])
				];
				disposables.push(
					input,
					input.onDidTriggerCommand(item => {
						if (item === backItem) {
							reject(InputFlowAction.back);
						}
					}),
					input.onDidSelectItem(item => resolve(item)),
					input.onHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.hide();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ prompt, validate, commands, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { commands: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.prompt = prompt;
				input.commands = [
					...(this.steps.length > 1 ? [backItem] : []),
					...(commands || [])
				];
				let validating = validate('');
				disposables.push(
					input,
					input.onDidTriggerCommand(item => {
						if (item === backItem) {
							reject(InputFlowAction.back);
						}
					}),
					input.onDidAccept(async text => {
						if (!(await validate(text))) {
							resolve(text);
						}
					}),
					input.onDidValueChange(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.hide();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}


// ---------------------------------------------------------------------------------------


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
