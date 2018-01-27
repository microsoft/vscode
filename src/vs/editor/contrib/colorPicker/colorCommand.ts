import 'vs/css!./colorPicker';
import * as nls from 'vs/nls';
// import * as dom from 'vs/base/browser/dom';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/colorPickerModel';
import { Color, RGBA } from 'vs/base/common/color';
import { registerEditorAction, registerEditorContribution, EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ColorPickerWidget } from './colorPickerWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

class ShowColorPickerAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.showColorPicker',
			label: nls.localize('showColorPicker', "Show Color Picker"),
			alias: 'Show Hover',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.getDomNode()) {
			return;
		}
		// Default
		const rgb = new RGBA(255,255,255);
		const color = new Color(rgb);
		const widget = new ColorPickerWidget(editor.getDomNode(), new ColorPickerModel(color, [], 100), 100);
		console.log(widget);
	}
}

registerEditorAction(ShowColorPickerAction);