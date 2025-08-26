import { JupyterLuminoPanelWidget } from '@jupyter-widgets/base';
import * as outputBase from '@jupyter-widgets/output';
import * as nbformat from '@jupyterlab/nbformat';
import { OutputArea, OutputAreaModel } from '@jupyterlab/outputarea';
import { Disposable } from 'vscode-notebook-renderer/events';
import { ErdosWidgetManager } from './manager';

export interface ISetOutputOptions {
	newMessage?: boolean;
}

export class OutputModel extends outputBase.OutputModel {
	private _outputAreaModel!: OutputAreaModel;
	public override widget_manager!: ErdosWidgetManager;

	private _messageHandler?: Disposable;

	public override defaults(): Backbone.ObjectHash {
		return {
			...super.defaults(),
			msg_id: '',
			outputs: [],
		};
	}

	public override initialize(attributes: any, options: any): void {
		super.initialize(attributes, options);

		this._outputAreaModel = new OutputAreaModel({ trusted: true });

		this.listenTo(this, 'change:msg_id', this.handleChangeMsgId);
		this.listenTo(this, 'change:outputs', this.handleChangeOutputs);
	}

	public get outputAreaModel(): OutputAreaModel {
		return this._outputAreaModel;
	}

	private get msgId(): string {
		return this.get('msg_id');
	}

	private get outputs(): unknown[] {
		return this.get('outputs');
	}

	private handleChangeMsgId(): void {
		this._messageHandler?.dispose();

		if (this.msgId.length > 0) {
			this._messageHandler = this.widget_manager.onDidReceiveKernelMessage(this.msgId, (message) => {

				switch (message.type) {
					case 'execute_result': {
						const output: nbformat.IExecuteResult = {
							output_type: 'execute_result',
							execution_count: null,
							data: message.data as nbformat.IMimeBundle,
							metadata: message.metadata as nbformat.OutputMetadata,
						};
						this._outputAreaModel.add(output);
						break;
					}
					case 'display_data': {
						const output: nbformat.IDisplayData = {
							output_type: 'display_data',
							data: message.data as nbformat.IMimeBundle,
							metadata: message.metadata as nbformat.OutputMetadata,
						};
						this._outputAreaModel.add(output);
						break;
					}
					case 'stream': {
						const output: nbformat.IStream = {
							output_type: 'stream',
							name: message.name,
							text: message.text,
						};
						this._outputAreaModel.add(output);
						break;
					}
					case 'error': {
						const output: nbformat.IError = {
							output_type: 'error',
							ename: message.name,
							evalue: message.message,
							traceback: message.traceback,
						};
						this._outputAreaModel.add(output);
						break;
					}
					case 'clear_output': {
						this._outputAreaModel.clear(message.wait);
						break;
					}
				}

				const options: ISetOutputOptions = { newMessage: true };
				this.set('outputs', this._outputAreaModel.toJSON(), options);

				this.save_changes();
			});
		}
	}

	private handleChangeOutputs(_model: OutputModel, _value: string[], options: ISetOutputOptions): void {
		if (!options?.newMessage) {
			this._outputAreaModel.clear();
			const outputs = JSON.parse(JSON.stringify(this.outputs));
			this._outputAreaModel.fromJSON(outputs);
		}
	}
}

export class OutputView extends outputBase.OutputView {
	override model!: OutputModel;
	private _outputView!: OutputArea;
	override luminoWidget!: JupyterLuminoPanelWidget;

	override _createElement(_tagName: string): HTMLElement {
		this.luminoWidget = new JupyterLuminoPanelWidget({ view: this });
		return this.luminoWidget.node;
	}

	override _setElement(el: HTMLElement): void {
		if (this.el || el !== this.luminoWidget.node) {
			throw new Error('Cannot reset the DOM element.');
		}

		this.el = this.luminoWidget.node;
		this.$el = $(this.luminoWidget.node);
	}

	override render(): void {
		super.render();
		this._outputView = new OutputArea({
			rendermime: this.model.widget_manager.renderMime,
			contentFactory: OutputArea.defaultContentFactory,
			model: this.model.outputAreaModel,
		});
		this.luminoWidget.insertWidget(0, this._outputView);

		this.luminoWidget.addClass('jupyter-widgets');
		this.luminoWidget.addClass('widget-output');
		this.update();
	}

	override remove(): any {
		this._outputView.dispose();
		return super.remove();
	}
}

