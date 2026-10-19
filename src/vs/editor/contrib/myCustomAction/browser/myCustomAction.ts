import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import * as path from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';

// 1. アクション（実行される処理）の定義
class MyCustomEditorAction extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.action.myCustomAction', // 固有のID
			title: { value: '選択テキストから新規ファイルを作成', original: 'Run Custom Action' },
			f1: true, // コマンドパレット(F1)にも表示するかどうか
			menu: {
				id: MenuId.EditorContext, // ✨ ここで「エディタの右クリックメニュー」を指定
				group: 'navigation',      // メニュー内のどのグループに配置するか (例: navigation, 1_modification)
				order: 1                  // グループ内での表示順序
			}
		});
	}

	// 2. メニューがクリックされた時の実際の処理
	async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<void> {
		const model = editor.getModel();
		if (!model) { return; }

		// 例：現在選択されているテキストを取得
		const selection = editor.getSelection();
		if (selection) {
			const fileService = accessor.get(IFileService);
			const editorService = accessor.get(IEditorService);

			const selectedText = model.getValueInRange(selection);

			const fileName = resources.basename(model.uri);
			const ext = path.extname(fileName);
			const base = path.basename(fileName, ext);

			const parentDirUri = resources.dirname(model.uri);

			let newFileName = `${base}_copy${ext}`;
			let newFileUri = URI.from({
				scheme: 'file',
				authority: parentDirUri.authority,
				path: resources.joinPath(parentDirUri, newFileName).path
			});

			const MAX_ATTEMPTS = 100;
			let counter = 1;
			while (counter <= MAX_ATTEMPTS) {
				const isExist = await fileService.exists(newFileUri);
				if (!isExist) {
					break;
				}

				newFileName = `${base}_copy_${counter}${ext}`;
				newFileUri = URI.from({
					scheme: 'file',
					authority: parentDirUri.authority,
					path: resources.joinPath(parentDirUri, newFileName).path
				});
				counter++;
			}

			if (counter > MAX_ATTEMPTS) {
				throw new Error('作成可能なファイル名の空き制限（100回）を超過しました。');
			}

			try {
				const buffer = VSBuffer.fromString(selectedText);
				fileService.writeFile(newFileUri, buffer);
				editorService.openEditor({
					resource: newFileUri,
					options: {
						pinned: true // タブを固定して開く
					}
				});
			} catch (error) {
				console.error('ファイルの自動保存または判定に失敗しました:', error);
				const notificationService = accessor.get(INotificationService);
				notificationService.error(`ファイル生成エラー: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}
}

// 3. VSCodeのシステムにアクションを登録
registerAction2(MyCustomEditorAction);
