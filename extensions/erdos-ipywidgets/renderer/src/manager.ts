import * as base from '@jupyter-widgets/base';
import { ManagerBase } from '@jupyter-widgets/base-manager';
import { JSONObject } from '@lumino/coreutils';
import * as LuminoWidget from '@lumino/widgets';
import type * as WebviewMessage from '../../../../src/vs/workbench/services/languageRuntime/common/erdosIPyWidgetsWebviewMessages';
import { RendererContext } from 'vscode-notebook-renderer';
import { Disposable } from 'vscode-notebook-renderer/events';
import { Messaging } from './messaging';
import { Comm } from './comm';
import { IRenderMime, RenderMimeRegistry, standardRendererFactories } from '@jupyterlab/rendermime';
import { ErdosRenderer } from './renderer';

const CDN = 'https://cdn.jsdelivr.net/npm/';

function moduleNameToCDNUrl(moduleName: string, moduleVersion: string): string {
	let packageName = moduleName;
	let fileName = 'index';
	let index = moduleName.indexOf('/');
	if (index !== -1 && moduleName[0] === '@') {
		index = moduleName.indexOf('/', index + 1);
	}
	if (index !== -1) {
		fileName = moduleName.substring(index + 1);
		packageName = moduleName.substring(0, index);
	}
	return `${CDN}${packageName}@${moduleVersion}/dist/${fileName}`;
}

function createRenderMimeRegistry(messaging: Messaging, context: RendererContext<any>): RenderMimeRegistry {
	const erdosRendererFactory = (options: IRenderMime.IRendererOptions) => {
		return new ErdosRenderer(options, messaging, context);
	};

	const initialFactories = [];

	for (const factory of standardRendererFactories) {
		initialFactories.push({
			...factory,
			createRenderer: erdosRendererFactory,
		});
	}

	initialFactories.push({
		safe: false,
		mimeTypes: [
			'application/geo+json',
			'application/vdom.v1+json',
			'application/vnd.dataresource+json',
			'application/vnd.jupyter.widget-view+json',
			'application/vnd.plotly.v1+json',
			'application/vnd.r.htmlwidget',
			'application/vnd.vega.v2+json',
			'application/vnd.vega.v3+json',
			'application/vnd.vega.v4+json',
			'application/vnd.vega.v5+json',
			'application/vnd.vegalite.v1+json',
			'application/vnd.vegalite.v2+json',
			'application/vnd.vegalite.v3+json',
			'application/vnd.vegalite.v4+json',
			'application/x-nteract-model-debug+json',
		],
		createRenderer: erdosRendererFactory,
	});
	return new RenderMimeRegistry({ initialFactories });
}

export class ErdosWidgetManager extends ManagerBase implements base.IWidgetManager, Disposable {
	private _disposables: Disposable[] = [];

	private _pendingLoadFromKernel: Promise<void> | undefined;

	public readonly renderMime: RenderMimeRegistry;

	constructor(
		private readonly _messaging: Messaging,
		context: RendererContext<any>,
	) {
		super();

		this.renderMime = createRenderMimeRegistry(_messaging, context);

		this._disposables.push(_messaging.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'comm_open':
					await this._handle_comm_open(message);
					break;
			}
		}));

		this._messaging.postMessage({ type: 'initialize' });
	}

	private async _handle_comm_open(message: WebviewMessage.ICommOpenToWebview): Promise<void> {
		const comm = new Comm(message.comm_id, message.target_name, this._messaging);
		await this.handle_comm_open(
			comm,
			{
				content: {
					comm_id: message.comm_id,
					target_name: message.target_name,
					data: message.data as JSONObject,
				},
				buffers: message.buffers?.map(buffer => new Uint8Array(buffer.buffer)),
				metadata: message.metadata as JSONObject,
				channel: 'iopub',
				header: {
					date: '',
					msg_id: '',
					msg_type: 'comm_open',
					session: '',
					username: '',
					version: '',
				},
				parent_header: {},
			}
		);
	}

	private async loadModule(moduleName: string, moduleVersion: string): Promise<any> {
		const require = (window as any).requirejs;
		if (require === undefined) {
			throw new Error('Requirejs is needed, please ensure it is loaded on the page.');
		}

		try {
			return await new Promise((resolve, reject) => require([moduleName], resolve, reject));
		} catch (err: any) {
			const failedId = err.requireModules && err.requireModules[0];
			if (failedId) {
				if (require.specified(failedId)) {
					require.undef(failedId);
				}

				console.log(`Falling back to ${CDN} for ${moduleName}@${moduleVersion}`);
				require.config({
					paths: { [moduleName]: moduleNameToCDNUrl(moduleName, moduleVersion) }
				});

				return await new Promise((resolve, reject) => require([moduleName], resolve, reject));
			}
		}

		throw new Error(`Error loading module ${moduleName}@${moduleVersion}`);
	}

	protected override async loadClass(className: string, moduleName: string, moduleVersion: string): Promise<typeof base.WidgetModel | typeof base.WidgetView> {
		const module = await this.loadModule(moduleName, moduleVersion);
		if (!module[className]) {
			throw new Error(`Class ${className} not found in module ${moduleName}@${moduleVersion}`);
		}
		return module[className];
	}

	protected override async _create_comm(
		comm_target_name: string,
		model_id?: string | undefined,
		data?: JSONObject | undefined,
		metadata?: JSONObject | undefined,
		_buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined
	): Promise<base.IClassicComm> {
		if (!model_id) {
			throw new Error('model_id is required to create a comm.');
		}

		const comm = new Comm(model_id, comm_target_name, this._messaging);

		if (data || metadata) {
			this._messaging.postMessage({
				type: 'comm_open',
				comm_id: model_id,
				target_name: comm_target_name,
				data: data,
				metadata: metadata,
			});
		}
		return comm;
	}

	protected override _get_comm_info(): Promise<{}> {
		throw new Error('Method not implemented.');
	}

	async display_view(view: base.DOMWidgetView, element: HTMLElement): Promise<void> {
		LuminoWidget.Widget.attach(view.luminoWidget, element);
	}

	loadFromKernel(): Promise<void> {
		this._pendingLoadFromKernel ??= this._loadFromKernel()
			.finally(() => this._pendingLoadFromKernel = undefined);
		return this._pendingLoadFromKernel;
	}

	onDidReceiveKernelMessage(
		parentId: string,
		listener: (message: WebviewMessage.IRuntimeMessageContent) => any
	): Disposable {
		return this._messaging.onDidReceiveMessage(message => {
			if (message.type === 'kernel_message' && message.parent_id === parentId) {
				listener(message.content);
			}
		});
	}

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this._disposables = [];
	}
}
