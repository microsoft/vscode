cd c:\vscode
git checkout -b feature/output-filter-accessibility-help develop
git add src/vs/workbench/contrib/output/browser/outputAccessibilityHelp.ts
git commit -m "Add output filter accessibility help"
git checkout -b feature/problems-filter-accessibility-help develop
git add src/vs/workbench/contrib/markers/browser/markersAccessibilityHelp.ts
git commit -m "Add problems filter accessibility help"
git checkout -b feature/debug-console-accessibility-help develop
git add src/vs/workbench/contrib/debug/browser/replAccessibilityHelp.ts
git commit -m "Add debug console accessibility help"
git checkout -b feature/search-accessibility-help develop
git add src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts
git commit -m "Add search across files accessibility help"
git checkout -b bugfix/aria-alerts-find-dialog develop
git add src/vs/editor/contrib/find/browser/findWidget.ts
git commit -m "Fix: Only announce search results when search string is present

Bug fix for ARIA alerts:
- Prevents empty search announcements
- Improves accessibility hint discoverability
- Maintains screen reader experience"
git checkout -b bugfix/notfound-message-empty-field develop
git add src/vs/editor/contrib/find/browser/findWidget.ts
git commit -m "Fix: Proper aria-label timing and visibility check

Bug fixes for find widget ARIA support:
- Update aria-label before widget becomes visible
- Only update aria-label when widget is visible
- Prevents premature accessibility hint clearing"
