import * as base from '@jupyter-widgets/base';
import * as controls from '@jupyter-widgets/controls';
import * as output from './output';
import { ActivationFunction } from 'vscode-notebook-renderer';
import { ErdosWidgetManager } from './manager';
import { Messaging } from './messaging';

import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';
import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets.css';
import '@lumino/widgets/style/index.css';

function isDefineFn(x: unknown): x is (name: string, fn: () => any) => void {
	return typeof x === 'function';
}

export const activate: ActivationFunction = async (context) => {
	const define = (window as any).define;
	if (!isDefineFn(define)) {
		throw new Error('Requirejs is needed, please ensure it is loaded on the page.');
	}
	define('@jupyter-widgets/base', () => base);
	define('@jupyter-widgets/controls', () => controls);
	define('@jupyter-widgets/output', () => output);

	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = import.meta.url.replace(/\.js$/, '.css');
	document.head.appendChild(link);

	const messaging = new Messaging(context);

	const manager = new ErdosWidgetManager(messaging, context);

	await new Promise<void>((resolve) => {
		console.debug('erdos-ipywidgets renderer: Waiting for initialize_result');
		const disposable = messaging.onDidReceiveMessage(message => {
			if (message.type === 'initialize_result') {
				disposable.dispose();
				resolve();
			}
		});
	});

	console.debug('erdos-ipywidgets renderer: Ready!');

	return {
		async renderOutputItem(outputItem, element, _signal) {
			const widgetData = outputItem.json();

			if (!manager.has_model(widgetData.model_id)) {
				await manager.loadFromKernel();

				if (!manager.has_model(widgetData.model_id)) {
					throw new Error(`Widget model with ID ${widgetData.model_id} not found`);
				}
			}

			const model = await manager.get_model(widgetData.model_id);
			const view = await manager.create_view(model);
			manager.display_view(view, element);

			console.log('erdos-ipywidgets renderer: done!');
		},
	};
};

