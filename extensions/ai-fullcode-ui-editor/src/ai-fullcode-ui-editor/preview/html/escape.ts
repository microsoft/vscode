/**
 * HTML文字列エスケープ関数
 *
 * Webview に注入する JavaScript 文字列のエスケープ処理
 */

/**
 * </script> タグをエスケープ
 *
 * HTML文字列内に </script> が含まれると、HTMLパーサーが誤って
 * スクリプトタグを閉じてしまうため、エスケープが必要
 */
export function escapeScriptCloseTag(code: string): string {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

