/**
 * Internationalization Messages
 * Supports English and Japanese based on VS Code IDE language settings
 */

export const messages: Record<string, Record<string, string>> = {
    en: {
        // Token Usage
        tokenUsageTooltip: 'Context window usage. Shows total tokens from chat history and code that AI can reference. History is automatically compressed when exceeding 80K.',

        // Rollback Dialog
        phaseRollbackTitle: 'Go back to this phase?',
        phaseRollbackMessage: 'Going back from {from} to {to}.',
        historyPreserved: 'Chat history is preserved',
        milestonesCollapsed: 'Current milestones will be collapsed',
        newWorkStart: 'You can start new work',
        cancel: 'Cancel',
        goBack: 'Go Back',

        // Forward Phase Dialog
        phaseForwardTitle: 'Advance to next phase?',
        phaseForwardMessage: 'Advancing from {from} to {to}.',
        phaseForwardMilestones: 'Current phase milestones will be marked complete',
        phaseForwardNewWork: 'New phase work will begin',
        advance: 'Advance',

        // Progress States
        thinking: 'Thinking...',
        searching: 'Searching {target}...',
        reading: 'Reading files...',
        writing: 'Writing files...',
        editing: 'Editing files...',
        executing: 'Executing command...',

        // Phase Names
        phaseDesign: 'Design',
        phaseImplementation: 'Implementation',
        phaseReview: 'Review',

        // Milestone States
        milestoneComplete: 'Complete',
        milestoneActive: 'In Progress',
        milestonePending: 'Pending',

        // Common
        send: 'Send',
        clear: 'Clear',
        retry: 'Retry',
        delete: 'Delete',

        // History
        history: 'History',
        newChat: 'New Chat',
        noSessions: 'No previous sessions',
        deleteSession: 'Delete session',
        deleteSessionConfirm: 'Are you sure you want to delete this session?',
        sessionMessages: '{count} messages',
        currentSession: 'Current'
    },
    ja: {
        // Token Usage
        tokenUsageTooltip: 'コンテキストウィンドウの使用量です。AIが参照できる会話履歴とコードの合計トークン数を表示しています。80Kを超えると古い履歴が自動的に圧縮されます。',

        // Rollback Dialog
        phaseRollbackTitle: 'フェーズを戻しますか？',
        phaseRollbackMessage: '{from}から{to}に戻ります。',
        historyPreserved: 'チャット履歴は保持されます',
        milestonesCollapsed: '現在のマイルストーンは折りたたまれます',
        newWorkStart: '新しい作業を開始できます',
        cancel: 'キャンセル',
        goBack: '戻る',

        // Forward Phase Dialog
        phaseForwardTitle: 'フェーズを進めますか？',
        phaseForwardMessage: '{from}から{to}に進めます。',
        phaseForwardMilestones: '現在のフェーズのマイルストーンが完了になります',
        phaseForwardNewWork: '新しいフェーズの作業が開始されます',
        advance: '進める',

        // Progress States
        thinking: '考え中...',
        searching: '{target}を検索中...',
        reading: 'ファイルを読み込み中...',
        writing: 'ファイルを書き込み中...',
        editing: 'ファイルを編集中...',
        executing: 'コマンドを実行中...',

        // Phase Names
        phaseDesign: '設計',
        phaseImplementation: '実装',
        phaseReview: 'レビュー',

        // Milestone States
        milestoneComplete: '完了',
        milestoneActive: '進行中',
        milestonePending: '待機中',

        // Common
        send: '送信',
        clear: 'クリア',
        retry: '再試行',
        delete: '削除',

        // History
        history: '履歴',
        newChat: '新規チャット',
        noSessions: '過去のセッションはありません',
        deleteSession: 'セッションを削除',
        deleteSessionConfirm: 'このセッションを削除しますか？',
        sessionMessages: '{count}件のメッセージ',
        currentSession: '現在'
    }
};

/**
 * Get supported locale from VS Code language string
 * Falls back to 'en' for unsupported locales
 */
export function getSupportedLocale(vscodeLocale: string): string {
    const lang = vscodeLocale.split('-')[0].toLowerCase();
    return messages[lang] ? lang : 'en';
}
