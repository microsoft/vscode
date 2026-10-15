import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

// 1. アクション（実行される処理）の定義
class MyCustomEditorAction extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.action.myCustomAction', // 固有のID
			title: { value: 'カスタム機能を実行', original: 'Run Custom Action' },
			f1: true, // コマンドパレット(F1)にも表示するかどうか
			menu: {
				id: MenuId.EditorContext, // ✨ ここで「エディタの右クリックメニュー」を指定
				group: 'navigation',      // メニュー内のどのグループに配置するか (例: navigation, 1_modification)
				order: 1                  // グループ内での表示順序
			}
		});
	}

	// 2. メニューがクリックされた時の実際の処理
	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const model = editor.getModel();
		if (!model) { return; }

		// 例：現在選択されているテキストを取得
		const selection = editor.getSelection();
		if (selection) {
			const selectedText = model.getValueInRange(selection);

			// ここに独自のロジックを記述します
			console.log('選択されたテキスト:', selectedText);
			alert(`選択されたテキスト: ${selectedText}`);
		}
	}
}

// 3. VSCodeのシステムにアクションを登録
registerAction2(MyCustomEditorAction);
