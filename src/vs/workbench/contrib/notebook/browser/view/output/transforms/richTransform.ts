/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { dirname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { handleANSIOutput } from 'vs/workbench/contrib/debug/browser/debugANSIHandling';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { ICellOutputViewModel, ICommonNotebookEditor, IOutputTransformContribution as IOutputRendererContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { OutputRendererRegistry } from 'vs/workbench/contrib/notebook/browser/view/output/rendererRegistry';
import { truncatedArrayOfString } from 'vs/workbench/contrib/notebook/browser/view/output/transforms/textHelper';
import { IOutputItemDto, TextOutputLineLimit } from 'vs/workbench/contrib/notebook/common/notebookCommon';


class JavaScriptRendererContrib extends Disposable implements IOutputRendererContribution {
	getType() {
		return RenderOutputType.Html;
	}

	getMimetypes() {
		return ['application/javascript'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {

		const str = getStringValue(item);
		const scriptVal = `<script type="application/javascript">${str}</script>`;

		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: scriptVal
		};
	}
}

class StreamRendererContrib extends Disposable implements IOutputRendererContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return ['application/vnd.code.notebook.stdout', 'application/x.notebook.stdout', 'application/x.notebook.stream'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const linkDetector = this.instantiationService.createInstance(LinkDetector);

		const text = getStringValue(item);
		const contentNode = DOM.$('span.output-stream');
		const lineLimit = this.configurationService.getValue<number>(TextOutputLineLimit) ?? 30;
		truncatedArrayOfString(notebookUri, output.cellViewModel, Math.max(lineLimit, 6), contentNode, [text], linkDetector, this.openerService, this.themeService);
		container.appendChild(contentNode);

		return { type: RenderOutputType.Mainframe };
	}
}

class StderrRendererContrib extends StreamRendererContrib {
	override getType() {
		return RenderOutputType.Mainframe;
	}

	override getMimetypes() {
		return ['application/vnd.code.notebook.stderr', 'application/x.notebook.stderr'];
	}

	override render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const result = super.render(output, item, container, notebookUri);
		container.classList.add('error');
		return result;
	}
}

class JSErrorRendererContrib implements IOutputRendererContribution {

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IThemeService private readonly _themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	dispose(): void {
		// nothing
	}

	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return ['application/vnd.code.notebook.error'];
	}

	render(_output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, _notebookUri: URI): IRenderOutput {
		const linkDetector = this._instantiationService.createInstance(LinkDetector);

		type ErrorLike = Partial<Error>;


		let err: ErrorLike;
		try {
			err = <ErrorLike>JSON.parse(getStringValue(item));
		} catch (e) {
			this._logService.warn('INVALID output item (failed to parse)', e);
			return { type: RenderOutputType.Mainframe };
		}

		const header = document.createElement('div');
		const headerMessage = err.name && err.message ? `${err.name}: ${err.message}` : err.name || err.message;
		if (headerMessage) {
			header.innerText = headerMessage;
			container.appendChild(header);
		}
		const stack = document.createElement('pre');
		stack.classList.add('traceback');
		if (err.stack) {
			stack.appendChild(handleANSIOutput(err.stack, linkDetector, this._themeService, undefined));
		}
		container.appendChild(stack);
		container.classList.add('error');

		return { type: RenderOutputType.Mainframe };
	}
}

class PlainTextRendererContrib extends Disposable implements IOutputRendererContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return [Mimes.text];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const linkDetector = this.instantiationService.createInstance(LinkDetector);

		const str = getStringValue(item);
		const contentNode = DOM.$('.output-plaintext');
		const lineLimit = this.configurationService.getValue<number>(TextOutputLineLimit) ?? 30;
		truncatedArrayOfString(notebookUri, output.cellViewModel, Math.max(lineLimit, 6), contentNode, [str], linkDetector, this.openerService, this.themeService);
		container.appendChild(contentNode);

		return { type: RenderOutputType.Mainframe, supportAppend: true };
	}
}

class HTMLRendererContrib extends Disposable implements IOutputRendererContribution {
	getType() {
		return RenderOutputType.Html;
	}

	getMimetypes() {
		return ['text/html', 'image/svg+xml'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const str = getStringValue(item);
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: str
		};
	}
}

class MdRendererContrib extends Disposable implements IOutputRendererContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return [Mimes.markdown];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const disposable = new DisposableStore();
		const str = getStringValue(item);
		const mdOutput = document.createElement('div');
		const mdRenderer = this.instantiationService.createInstance(MarkdownRenderer, { baseUrl: dirname(notebookUri) });
		mdOutput.appendChild(mdRenderer.render({ value: str, isTrusted: true, supportThemeIcons: true }, undefined, { gfm: true }).element);
		container.appendChild(mdOutput);
		disposable.add(mdRenderer);
		return { type: RenderOutputType.Mainframe, disposable };
	}
}

class ImgRendererContrib extends Disposable implements IOutputRendererContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return ['image/png', 'image/jpeg', 'image/gif'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const disposable = new DisposableStore();

		const blob = new Blob([item.data.buffer], { type: item.mime });
		const src = URL.createObjectURL(blob);
		disposable.add(toDisposable(() => URL.revokeObjectURL(src)));

		const image = document.createElement('img');
		image.src = src;
		const display = document.createElement('div');
		display.classList.add('display');
		display.appendChild(image);
		container.appendChild(display);

		return { type: RenderOutputType.Mainframe, disposable };
	}
}

OutputRendererRegistry.registerOutputTransform(JavaScriptRendererContrib);
OutputRendererRegistry.registerOutputTransform(HTMLRendererContrib);
OutputRendererRegistry.registerOutputTransform(MdRendererContrib);
OutputRendererRegistry.registerOutputTransform(ImgRendererContrib);
OutputRendererRegistry.registerOutputTransform(PlainTextRendererContrib);
OutputRendererRegistry.registerOutputTransform(JSErrorRendererContrib);
OutputRendererRegistry.registerOutputTransform(StreamRendererContrib);
OutputRendererRegistry.registerOutputTransform(StderrRendererContrib);


// --- utils ---
export function getStringValue(item: IOutputItemDto): string {
	return item.data.toString();
}
