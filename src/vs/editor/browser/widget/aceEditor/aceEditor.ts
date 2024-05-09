import {ITextModel} from 'vs/editor/common/model';
import {
	Editor,
	VirtualRenderer,
	Ace,
	createEditSession
} from 'vs/editor/browser/widget/aceEditor/ace-editor';
import {Selection} from 'vs/editor/common/core/selection';
import {fromAceDelta} from 'vs/editor/browser/widget/aceEditor/converters';
import {mapToAceMode} from 'vs/editor/browser/widget/aceEditor/modesMapper';

//TODO: other event types
//TODO: eol
//TODO: single line editor
//TODO: keybindings
//TODO: disposal
//TODO: ace extensions
export class AceEditor {
	private textModel?: ITextModel;
	public editor?: Ace.Editor;
	private $deltaQueue?: Ace.Delta[];
	private domElement: HTMLElement;
	private sessions: { [id: string]: Ace.EditSession } = {};

	constructor(domElement: HTMLElement) {
		this.domElement = domElement;
	}

	setEventListeners() {
		if (!this.editor) {
			this.editor = this.createEditor();
		}
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
			this.textModel?.pushEditOperations(selections, edits, () => []);
		}
	};

	private createEditor() {
		const session = this.createSession();
		const editor = new Editor(new VirtualRenderer(this.domElement), session, {
			enableBasicAutocompletion: true,
			enableSnippets: true,
			enableLiveAutocompletion: true
		});
		return editor;
	}

	setMode(mode: string) {
		this.editor?.session.setMode(mapToAceMode(mode));
	}

	setModel(model: ITextModel) {
		this.textModel = model;
		if (!this.editor) {
			this.editor = this.createEditor();
		}
		this.setSession();
	}

	setSession() {
		const id = this.textModel?.id || '';
		if (!this.sessions[id]) {
			this.createSession();
		}
		this.editor?.setSession(this.sessions[id]);
	}

	createSession() {
		const id = this.textModel?.id || '';
		this.sessions[id] = createEditSession(this.textModel?.getValue() || '', mapToAceMode(this.textModel!.getLanguageId()));
		this.sessions[id].doc.on('change', this.$changeListener, true);
		return this.sessions[id];
	}
}
