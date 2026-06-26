# План фикса: BYOK-модели, квоты и аутентификация

## Проблема

1. **Основная:** Даже когда пользователь настроил собственную BYOK-модель, приложение требует наличия подписки на Copilot (хотя бы бесплатной). Никакие функции не работают без подписки.
2. **Вторичная:** Когда пользователь исчерпывает лимиты платной подписки Copilot, утилитарные фичи перестают работать — даже если есть кастомная BYOK-модель.
3. **Третичная:** Нет понятного уведомления о том, как настроить отдельную utility-модель.

---

## Рут-коза

### 🔴 БЛОКЕР 1: `isClientBYOKAllowed()` запрещает BYOK для залогиненных пользователей без entitlement

**Файл:** `extensions/copilot/src/extension/byok/common/byokProvider.ts` (строки 173-180)

```typescript
export function isClientBYOKAllowed(hasGitHubSession: boolean, copilotToken: Omit<CopilotToken, 'token'> | undefined): boolean {
    if (!hasGitHubSession) {
        return true;  // ✅ Signed-out users ARE allowed
    }
    if (!copilotToken) {
        return false; // ❌ Signed-in WITHOUT token are DENIED
    }
    return copilotToken.isInternal || copilotToken.isIndividual || copilotToken.isClientBYOKEnabled();
}
```

**Цепочка последствий:**
1. `isClientBYOKAllowed(false)` → `clientByokEnabled` контекстный ключ = `false`
2. `clientByokEnabled = false` → `HasByokModelsContribution._isFeatureEnabled()` = `false` → `hasByokModels = false`
3. `hasByokModels = false` → `byokContribution._applyPolicy()` **отрегистрировывает** все BYOK провайдеры
4. Без зарегистрированных провайдеров → `lm.selectChatModels()` возвращает пустой массив → `_resolveUtilityOverride()` = `undefined`
5. Фолбэк на `CopilotUtilitySmallChatEndpoint` → требует Copilot токен → **всё падает**

**Это главная причина почему "никакие функции не работают".**

---

### 🔴 БЛОКЕР 2: `_inspectContext()` ставит негативные контекстные ключи

**Файл:** `extensions/copilot/src/extension/contextKeys/vscode-node/contextKeys.contribution.ts` (строки ~125-175)

Когда `getCopilotToken()` бросает `NotSignedUpError`/`SubscriptionExpiredError`, устанавливается `IndividualDisabled`/`IndividualExpired`. Это триггерит welcome-панель с требованием подписки, даже если у пользователя есть BYOK-модели.

---

### 🔴 БЛОКЕР 3: `_resolveUtilityFamily()` фолбэкает на Copilot endpoint

**Файл:** `extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts` (строки 130-150)

Если `chat.utilitySmallModel` не настроен, фолбэк идёт на `CopilotUtilitySmallChatEndpoint` который требует Copilot токен.

---

### ⚠️ БЛОКЕР 4: Review фича жёстко блокирует no-auth пользователей

**Файл:** `extensions/copilot/src/extension/review/node/doReview.ts` (строки 141-146)

Code review явно блокирует `isNoAuthUser`, даже с BYOK-моделью.

---

### ⚠️ БЛОКЕР 5: `ExtensionContributedChatEndpoint` глотает типы ошибок

**Файл:** `extensions/copilot/src/platform/endpoint/vscode-node/extChatEndpoint.ts` (строки 289-292)

Любая ошибка от BYOK-провайдера становится `ChatFetchResponseType.Failed`.

---

### ⚠️ БЛОКЕР 6: Утилитарные генераторы молча глотают `Failed`

**Файлы:** `gitCommitMessageGenerator.ts:85`, `githubPullRequestTitleAndDescriptionGenerator.ts:102`, `renameSuggestionsProvider.ts:159`

---

### ⚠️ БЛОКЕР 7: `ByokUtilityModelNotification` только для signed-out

**Файл:** `extensions/copilot/src/extension/chatInputNotification/vscode-node/byokUtilityModel.contribution.ts` (строка 70)

---

### ⚠️ БЛОКЕР 8: `showQuotaExceededDialog` открывает настройку Copilot

**Файл:** `extensions/copilot/src/platform/notification/vscode/notificationServiceImpl.ts` (строка 34)

---

## План фикса

### Фаза 1: Разрешить BYOK для залогиненных пользователей без Copilot подписки (критическая)

**Цель:** Пользователь, залогиненный в GitHub но без Copilot подписки, может использовать BYOK-модели.

**Файл:** `extensions/copilot/src/extension/byok/common/byokProvider.ts`

**Изменения:**
1. Изменить `isClientBYOKAllowed()`: когда `hasGitHubSession = true` но `!copilotToken`, проверить есть ли доступные BYOK-модели (через `lm.selectChatModels()`). Если да — вернуть `true`.
2. Альтернативно: добавить новый флаг `chat.allowByokWithoutSubscription` (по умолчанию `true`), который разрешает BYOK без подписки.

**Файл:** `extensions/copilot/src/extension/contextKeys/vscode-node/contextKeys.contribution.ts`

**Изменения:**
3. В `_inspectContext()`: когда ошибка `NotSignedUpError`/`SubscriptionExpiredError` И `clientByokEnabled = true`, НЕ устанавливать негативные контекстные ключи (или устанавливать `Activated`).
4. В `_updateClientByokEnabledContext()`: использовать обновлённую логику `isClientBYOKAllowed()`.

---

### Фаза 2: Уведомление при отсутствии подписки + предложение BYOK

**Цель:** Когда пользователь без подписки пытается использовать Copilot фичу, показать понятное сообщение с предложением настроить BYOK.

**Файлы:**
- `extensions/copilot/src/platform/notification/common/notificationService.ts` (интерфейс)
- `extensions/copilot/src/platform/notification/vscode/notificationServiceImpl.ts` (реализация)

**Изменения:**
1. Добавить метод `showByokSuggestionDialog()`:
   - Сообщение: "Copilot subscription required. You can use your own AI model instead."
   - Кнопка "Configure BYOK Model" → открывает настройки BYOK провайдеров
   - Кнопка "Sign Up for Copilot" → стандартный setup flow
   - Кнопка "Dismiss"

2. В `chatSetupProviders.doInvoke()`: когда `entitlement = Unknown` и `!hasByokModels` но BYOK провайдеры доступны → показать новый диалог.

---

### Фаза 3: Распознавание ошибок BYOK-провайдеров

**Цель:** Когда BYOK-модель возвращает quota/rate-limit ошибку, правильно её классифицировать.

**Файл:** `extensions/copilot/src/platform/endpoint/vscode-node/extChatEndpoint.ts`

**Изменения:**
1. В catch-блоке `makeChatRequest2` добавить анализ ошибки:
   - 429, "rate limit", "too many requests" → `ChatFetchResponseType.RateLimited`
   - "quota exceeded", "insufficient quota", "billing" → `ChatFetchResponseType.QuotaExceeded`
   - Остальные → `ChatFetchResponseType.Failed`

---

### Фаза 4: Уведомления об ошибках в утилитарных генераторах

**Цель:** Показать пользователю конкретное сообщение об ошибке вместо молчаливого `undefined`.

**Файлы:** `gitCommitMessageGenerator.ts`, `githubPullRequestTitleAndDescriptionGenerator.ts`, `renameSuggestionsProvider.ts`, `doReview.ts`

**Изменения:**
1. Когда `endpoint.isExtensionContributed` и `fetchResult.type === Failed` → показать `showWarningMessage` с `fetchResult.reason`
2. Добавить кнопку "Change Model" → открывает `chat.utility*` настройки
3. В `doReview.checkAuthentication()`: разрешить `isNoAuthUser` когда `hasByokModels = true`

---

### Фаза 5: Расширить `ByokUtilityModelNotification`

**Цель:** Показывать уведомление также при исчерпании квоты (не только для signed-out).

**Файл:** `extensions/copilot/src/extension/chatInputNotification/vscode-node/byokUtilityModel.contribution.ts`

**Изменения:**
1. Добавить проверку `chatQuotaExceeded` контекстного ключа
2. Когда квота исчерпана И есть BYOK-модели И utility-модель не настроена → показать уведомление

---

### Фаза 6: Новый диалог квоты с предложением BYOK

**Цель:** Когда Copilot-квота исчерпана, предложить настроить BYOK utility-модель.

**Файл:** `extensions/copilot/src/platform/notification/vscode/notificationServiceImpl.ts`

**Изменения:**
1. Добавить `showUtilityModelQuotaExceededDialog()`:
   - "Copilot quota exceeded. Configure a BYOK utility model to continue using AI features."
   - Кнопка "Configure Utility Model" → `workbench.action.openSettings` с `chat.utility`
   - Кнопка "Dismiss"

---

## Приоритет и порядок

| Приоритет | Фаза | Влияние |
|-----------|------|---------|
| **P0** | Фаза 1 | Без этого BYOK не работает для залогиненных пользователей без подписки |
| **P0** | Фаза 2 | Пользователь видит предложение настроить BYOK вместо "sign up" |
| **P1** | Фаза 3 | Правильная классификация ошибок BYOK |
| **P1** | Фаза 4 | Обратная связь когда BYOK модель падает |
| **P2** | Фаза 5 | Проактивное уведомление в чате |
| **P2** | Фаза 6 | Диалог квоты с предложением BYOK |

## Затронутые файлы

| Файл | Фаза | Изменение |
|------|------|-----------|
| `byokProvider.ts` | 1 | `isClientBYOKAllowed()` логика |
| `contextKeys.contribution.ts` | 1 | `_inspectContext()` не блокирует при BYOK |
| `notificationService.ts` | 2, 6 | Новый метод интерфейса |
| `notificationServiceImpl.ts` | 2, 6 | Реализация новых диалогов |
| `chatSetupProviders.ts` | 2 | Показать BYOK диалог |
| `extChatEndpoint.ts` | 3 | Классификация ошибок |
| `gitCommitMessageGenerator.ts` | 4 | Обработка `Failed` + новый диалог |
| `githubPullRequestTitleAndDescriptionGenerator.ts` | 4 | Обработка `Failed` + новый диалог |
| `renameSuggestionsProvider.ts` | 4 | Обработка `Failed` + новый диалог |
| `doReview.ts` | 4 | Разрешить no-auth при BYOK |
| `byokUtilityModel.contribution.ts` | 5 | Расширить условия показа |

## Тестирование

1. **Сценарий 1:** Залогиненный пользователь без Copilot подписки + BYOK модель настроена → все функции работают
2. **Сценарий 2:** Залогиненный пользователь без Copilot подписки + BYOK модель НЕ настроена → показать диалог с предложением настроить BYOK
3. **Сценарий 3:** Залогиненный пользователь с Copilot подпиской, квота исчерпана + BYOK модель → коммит-сообщение генерируется через BYOK
4. **Сценарий 4:** Signed-out пользователь с BYOK моделью → существующий функционал продолжает работать
5. **Сценарий 5:** BYOK модель возвращает 429 → показывается `RateLimited` ошибка
6. **Сценарий 6:** BYOK модель возвращает bad API key → показывается конкретное сообщение
