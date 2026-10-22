/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { extname, basename } from '../../../../base/common/path.js';
// ✨ MenuId をインポートに追加します
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';

export class SortEditorsByExtensionAction extends Action2 {
	static readonly ID = 'workbench.action.files.sortEditorsByExtension';

	constructor() {
		super({
			id: SortEditorsByExtensionAction.ID,
			title: nls.localize2('sortEditorsByExtension', "Sort Tabs by Extension"),
			f1: true, // コマンドパレット（F1）に表示
			category: Categories.File,

			// ✨ ここにメニュー追加の設定を追記します
			menu: {
				id: MenuId.EditorTitleContext, // タブの右クリックメニューを指定
				group: '2_close',             // メレニュー内の配置グループ（閉じるメニューの付近）
				order: 10                     // グループ内での表示順序
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		// 1. 現在アクティブなエディタグループを取得する
		const group = editorGroupService.activeGroup;
		if (!group) {
			return;
		}

		// 2. 現在の見た目の並び順（SEQUENTIAL）で、グループ内のすべてのタブを取得する
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
		if (editors.length <= 1) {
			return; // タブが0または1つの場合は並び替える必要がないので終了
		}

		// 3. 元の並び順のコピーを作成し、拡張子のアルファベット順でソートする
		const sortedEditors = [...editors].sort((a, b) => {
			const uriA = EditorResourceAccessor.getOriginalUri(a);
			const uriB = EditorResourceAccessor.getOriginalUri(b);

			// URI が取得できない特殊なタブ（設定画面など）は末尾に送るための処理
			const extA = uriA ? extname(uriA.path).toLowerCase() : 'zzzz';
			const extB = uriB ? extname(uriB.path).toLowerCase() : 'zzzz';

			// 拡張子が同じ場合は、ファイル名（basename）順でさらにソートする
			if (extA === extB) {
				const nameA = uriA ? basename(uriA.path).toLowerCase() : '';
				const nameB = uriB ? basename(uriB.path).toLowerCase() : '';
				return nameA.localeCompare(nameB);
			}

			return extA.localeCompare(extB);
		});

		// 4. ソート結果に基づいて、実際のタブ位置を正確に移動させる
		for (let i = 0; i < sortedEditors.length; i++) {
			const editor = sortedEditors[i];

			// 現在のエディタグループ内での、このタブの「今現在のリアルタイムな位置」を取得
			const currentIndex = group.getIndexOfEditor(editor);

			// すでに正しい位置（i番目）にある場合は、無駄な移動処理をスキップ
			if (currentIndex !== i) {
				// VS Code 本体の正しい API 仕様に合わせて引数を指定
				group.moveEditor(editor, group, { index: i });
			}
		}
	}
}

export class SortEditorsByNameAction extends Action2 {
	static readonly ID = 'workbench.action.files.sortEditorsByName';

	constructor() {
		super({
			id: SortEditorsByNameAction.ID,
			title: nls.localize2('sortEditorsByName', "Sort Tabs by Name"), // 表示名
			f1: true, // コマンドパレット(F1)に表示
			category: Categories.File,
			menu: {
				id: MenuId.EditorTitleContext, // タブ右クリックメニュー
				group: '2_close',             // 拡張子順と同じグループ
				order: 11                     // 拡張子順(10)のすぐ下に配置
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const group = editorGroupService.activeGroup;
		if (!group) { return; }

		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
		if (editors.length <= 1) { return; }

		// アルファベットの名前順でソートするロジック
		const sortedEditors = [...editors].sort((a, b) => {
			const uriA = EditorResourceAccessor.getOriginalUri(a);
			const uriB = EditorResourceAccessor.getOriginalUri(b);

			// 拡張子を無視して純粋なファイル名(basename)を取得
			const nameA = uriA ? basename(uriA.path).toLowerCase() : 'zzzz';
			const nameB = uriB ? basename(uriB.path).toLowerCase() : 'zzzz';

			// ファイル名が同じ場合は、拡張子(extname)でさらにソート
			if (nameA === nameB) {
				const extA = uriA ? extname(uriA.path).toLowerCase() : '';
				const extB = uriB ? extname(uriB.path).toLowerCase() : '';
				return extA.localeCompare(extB);
			}
			return nameA.localeCompare(nameB);
		});

		// ソート結果に基づいて、実際のタブ位置を正確に移動
		for (let i = 0; i < sortedEditors.length; i++) {
			const editor = sortedEditors[i];
			const currentIndex = group.getIndexOfEditor(editor);
			if (currentIndex !== i) {
				group.moveEditor(editor, group, { index: i });
			}
		}
	}
}

// コマンドをVS Codeの仕組みに登録
registerAction2(SortEditorsByExtensionAction);
registerAction2(SortEditorsByNameAction);
