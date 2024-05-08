import {ITextModel} from 'vs/editor/common/model';
import {Editor, VirtualRenderer, Ace} from 'vs/editor/browser/widget/aceEditor/ace-editor';
import {Selection} from 'vs/editor/common/core/selection';
import {fromAceDelta} from 'vs/editor/browser/widget/aceEditor/converters';
import {mapToAceMode} from 'vs/editor/browser/widget/aceEditor/modesMapper';

//TODO: undo/redo
//TODO: other event types
//TODO: eol
//TODO: single line editor
//TODO: keybindings
//TODO: disposal
//TODO: ace extensions
export class AceEditor {
	private textModel: ITextModel;
	public editor?: Ace.Editor;
	private $deltaQueue?: Ace.Delta[];
	private domElement: HTMLElement;

	constructor(textModel: ITextModel, domElement: HTMLElement) {
		this.textModel = textModel;
		this.domElement = domElement;
	}

	setEventListeners() {
		if (!this.editor) {
			this.editor = this.createEditor();
		}
		this.editor.session.doc.on('change', this.$changeListener, true);
	}

	private $changeListener = (delta: Ace.Delta) => {
		if (!this.$deltaQueue) {
			this.$deltaQueue = [];
			setTimeout(this.$sendDeltaQueue, 0);
		}
		this.$deltaQueue.push(delta);
	};

	$sendDeltaQueue = () => {
		const deltas = this.$deltaQueue;
		if (!deltas) {
			return;
		}
		this.$deltaQueue = undefined;
		if (deltas.length) {
			if (!this.editor) {
				this.editor = this.createEditor();
			}
			//TODO: seelections should be formed before deltas are applied
			const selections = this.editor.selection.getAllRanges().map((range) => {
				return new Selection(range.start.row, range.start.column, range.end.row, range.end.column);
			});
			//TODO: eol needs to be passed in
			const eol = this.editor.session.doc.getNewLineCharacter();
			const edits = deltas.map((delta) => fromAceDelta(delta, eol));
			this.textModel.pushEditOperations(selections, edits, () => []);
		}
	};

	private createEditor() {
		const editor = new Editor(new VirtualRenderer(this.domElement), undefined, {
			enableBasicAutocompletion: true,
			enableSnippets: true,
			enableLiveAutocompletion: true
		});
		editor.setValue(this.textModel.getValue(), -1);
		console.log(this.textModel.getLanguageId());
		editor.session.setMode(mapToAceMode(this.textModel.getLanguageId()));
		return editor;
	}

	setMode(mode: string) {
		this.editor?.session.setMode(mapToAceMode(mode));
	}

	render() {
		this.editor = this.createEditor();
		this.setEventListeners();
	}
}
