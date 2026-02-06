/**
 * Runtime Script 注入管理
 * ✅ Cursor 2.2準拠: fs.readFileSync による注入は禁止
 *
 * 原則:
 * - Runtime は WebView 側で直接 import される
 * - 「生成されたJSを読む」工程は禁止
 * - 文字列テンプレート方式は一切使わない
 */

/**
 * Runtime Script の注入順序（互換性のため残す）
 *
 * 注意: Cursor 2.2準拠では、Runtime は WebView 側で直接 import されるため、
 * この関数は使用されません。互換性のため残しています。
 */
export interface RuntimeInjection {
  name: string;
  code: string;
}

/**
 * Runtime Script を取得
 * ✅ Cursor 2.2準拠: 空配列を返す（Runtime は直接 import）
 */
export function getRuntimeInjections(): RuntimeInjection[] {
  // ✅ Cursor 2.2準拠: Runtime は WebView 側で直接 import されるため、空配列を返す
  return [];
}

/**
 * Runtime Script を文字列として結合
 * ✅ Cursor 2.2準拠: 空文字列を返す（Runtime は直接 import）
 */
export function getRuntimeScriptsString(): string {
  // ✅ Cursor 2.2準拠: Runtime は WebView 側で直接 import されるため、空文字列を返す
  return '';
}
