# Implementation Plan: TSCode OAuth Login

## Overview

按照分层架构逐步实现 TSCode OAuth 登录认证机制：先定义公共接口与常量，再实现各核心组件（TokenStore、CallbackHandler、AuthService、WelcomePage、OAuthProvider），最后注册 Workbench Contribution 并接入主入口。所有 fork 特有改动需添加 `test-workbench_change` 注释。

## Tasks

- [x] 1. 定义公共接口与常量（tsCodeAuth.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/common/tsCodeAuth.ts` 中定义所有共享类型和接口
  - 定义 `StoredToken`、`UserInfo`、`OAuthState`、`TokenResponse` 数据模型
  - 定义 `ITsCodeAuthService`、`ITsCodeTokenStore` 服务接口
  - 定义服务标识符（`ITsCodeAuthService`、`ITsCodeTokenStore` ServiceIdentifier）
  - 定义常量：`TSCODE_OAUTH_CLIENT_ID`、`TSCODE_OAUTH_REDIRECT_URI`（`tscode://auth/callback`）、`TSCODE_AUTH_BASE_URL`（`https://test.cmbchina.com`）、SecretStorage key、globalState key
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 1.1, 3.2, 3.4, 5.1, 5.2_

- [x] 2. 实现 TokenStore（tsCodeTokenStore.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/browser/tsCodeTokenStore.ts` 中实现 `TsCodeTokenStore` 类
  - 实现 `getAccessToken()`：从 `ISecretStorageService` 读取并反序列化 `StoredToken`
  - 实现 `saveToken()`：将 `StoredToken` 序列化为 JSON 后写入 `ISecretStorageService`
  - 实现 `clearToken()`：从 `ISecretStorageService` 删除 token
  - 实现 `getUserInfo()` / `saveUserInfo()`：使用 `IStorageService`（StorageScope.APPLICATION）读写 `UserInfo`
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 1.1, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 2.1 为 TokenStore 编写属性测试（Property 7）
    - **Property 7: TokenStore 存储 round-trip**
    - 使用 fast-check 生成随机 `StoredToken` 和 `UserInfo`，验证 save → get 后数据等价
    - 添加注释 `// Feature: tscode-oauth-login, Property 7: TokenStore round-trip`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 2.2 为 TokenStore 编写单元测试
    - mock `ISecretStorageService` 和 `IStorageService`
    - 测试存储/读取/清除操作及序列化边界条件
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3. 实现 CallbackHandler（tsCodeCallbackHandler.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/browser/tsCodeCallbackHandler.ts` 中实现 `TsCodeCallbackHandler` 类
  - 实现 `IURLHandler.handleURL()`：检查 URI authority 为 `auth`、path 为 `/callback`
  - 从 URI 查询参数提取 `code` 和 `state`，缺少参数时记录错误并返回 `false`
  - 验证 `state` 与内存中保存的 `OAuthState.value` 一致，不匹配时调用 `authService` 报告安全错误
  - state 验证通过后调用 `authService.exchangeCodeForToken(code, state)`
  - 注册到 `IURLService`
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.1 为 CallbackHandler 编写属性测试（Property 4、Property 5）
    - **Property 4: 回调 URI 参数解析 round-trip**
    - 使用 fast-check 生成随机 `code`/`state` 字符串（含特殊字符），验证编码后解析结果与原始值一致
    - 添加注释 `// Feature: tscode-oauth-login, Property 4: callback URI parse round-trip`
    - **Validates: Requirements 4.2**
    - **Property 5: state 验证正确性**
    - 使用 fast-check 生成随机 expected/received state 对，验证仅当两者相等时验证通过
    - 添加注释 `// Feature: tscode-oauth-login, Property 5: state validation correctness`
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 3.2 为 CallbackHandler 编写单元测试
    - 测试合法 URI 解析、缺少 `code` 参数、非 `auth/callback` 路径、state 不匹配场景
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. 实现 AuthService（tsCodeAuthService.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/browser/tsCodeAuthService.ts` 中实现 `TsCodeAuthService` 类
  - 实现 `checkAndHandleAuth()`：调用 `tokenStore.getAccessToken()`，有效则直接返回，否则触发 WelcomePage
  - 实现 `buildAuthorizationUrl(state)`：构造包含 `client_id`、`redirect_uri`、`state` 的授权 URL
  - 实现 `startOAuthFlow()`：生成 `crypto.randomUUID()` state，保存 `OAuthState`，调用 `IOpenerService` 打开授权 URL
  - 实现 `exchangeCodeForToken(code, state)`：POST 到 `https://test.cmbchina.com/oauth/token`，解析 `TokenResponse`，调用 `tokenStore.saveToken()` 和 `tokenStore.saveUserInfo()`，触发 `onDidLogin` 事件
  - 实现 `refreshTokenIfNeeded()`：检查 `isTokenExpiringSoon()`，若是则调用刷新接口；刷新失败时调用 `tokenStore.clearToken()` 并触发 `onDidChangeSessions`
  - 实现 `isTokenExpiringSoon(token)`：判断 `expiresAt` 距当前时间是否不足 300,000 ms
  - 所有错误通过 `ILogService` 记录
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.5, 4.6, 4.7, 8.1, 8.2, 8.3_

  - [ ]* 4.1 为 AuthService 编写属性测试（Property 1、Property 2、Property 3、Property 6、Property 11）
    - **Property 1: Token 有效性决定登录流程触发**
    - 使用 fast-check 生成随机 `StoredToken`（有效/过期/undefined），验证 `checkAndHandleAuth()` 行为
    - 添加注释 `// Feature: tscode-oauth-login, Property 1: token validity determines login flow`
    - **Validates: Requirements 1.2, 1.3, 1.4**
    - **Property 2: OAuth state 参数唯一性**
    - 多次调用 `startOAuthFlow()`，收集所有 state 值，验证无重复
    - 添加注释 `// Feature: tscode-oauth-login, Property 2: OAuth state uniqueness`
    - **Validates: Requirements 3.1**
    - **Property 3: 授权 URL 包含所有必需参数**
    - 使用 fast-check 生成随机 state 字符串，验证 `buildAuthorizationUrl()` 返回 URL 包含 `client_id`、`redirect_uri`、`state`
    - 添加注释 `// Feature: tscode-oauth-login, Property 3: authorization URL contains required params`
    - **Validates: Requirements 3.2, 3.4**
    - **Property 6: BackendAPI 响应解析 round-trip**
    - 使用 fast-check 生成随机 `TokenResponse`，验证解析出的 `StoredToken` 和 `UserInfo` 字段一一对应
    - 添加注释 `// Feature: tscode-oauth-login, Property 6: backend API response parse round-trip`
    - **Validates: Requirements 4.6**
    - **Property 11: token 刷新阈值判断**
    - 使用 fast-check 生成随机 `expiresAt`（边界值附近），验证 `isTokenExpiringSoon()` 返回值正确
    - 添加注释 `// Feature: tscode-oauth-login, Property 11: token refresh threshold`
    - **Validates: Requirements 8.1**

  - [ ]* 4.2 为 AuthService 编写单元测试
    - 测试 state 不匹配时中止流程、BackendAPI 错误时的降级处理、刷新失败时清除 token
    - _Requirements: 1.5, 4.7, 8.3_

- [x] 5. 检查点 - 确保核心逻辑测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [ ] 6. 实现 WelcomePage（tsCodeWelcomePage.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/browser/tsCodeWelcomePage.ts` 中实现 `TsCodeWelcomePage` 类
  - 使用 `IWebviewService` 创建 WebviewPanel，设置 `retainContextWhenHidden: true`
  - HTML 内容包含品牌名称 "TSCode"、标题 "欢迎使用 TSCode"、标签为 "登录" 的按钮
  - 实现 `show()` / `hide()` 方法控制 WebviewPanel 可见性
  - 实现 `showWaitingState()` 展示等待授权提示
  - 实现 `showErrorState(message)` 展示错误信息
  - 通过 `webview.onDidReceiveMessage` 接收登录按钮点击事件，触发 `onLoginClicked` 事件
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5_

  - [ ]* 6.1 为 WelcomePage 编写单元测试
    - 验证 HTML 内容包含 "TSCode"、"欢迎使用 TSCode"、登录按钮
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 7. 实现 OAuthProvider（tsCodeOAuthProvider.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/browser/tsCodeOAuthProvider.ts` 中实现 `TsCodeOAuthProvider` 类
  - 实现 `IAuthenticationProvider` 接口，设置 `id = 'tscode-oauth'`、`label = 'TSCode'`、`supportsMultipleAccounts = false`
  - 实现 `getSessions()`：从 `tokenStore.getAccessToken()` 和 `tokenStore.getUserInfo()` 构造 `AuthenticationSession`
  - 实现 `createSession()`：调用 `authService.startOAuthFlow()`，等待 `onDidLogin` 事件后返回 session
  - 实现 `removeSession()`：调用 `tokenStore.clearToken()`，触发 `onDidChangeSessions`
  - 订阅 `authService.onDidLogin` 和 `authService.onDidLogout`，在 token 变更时触发 `onDidChangeSessions`
  - 注册到 `IAuthenticationService`
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 8.4_

  - [ ]* 7.1 为 OAuthProvider 编写属性测试（Property 8、Property 9、Property 10）
    - **Property 8: AuthenticationSession 字段映射**
    - 使用 fast-check 生成随机 `UserInfo`，验证构造的 `AuthenticationSession.id === userInfo.id` 且 `account.label === userInfo.displayName`
    - 添加注释 `// Feature: tscode-oauth-login, Property 8: AuthenticationSession field mapping`
    - **Validates: Requirements 6.3**
    - **Property 9: getSessions 返回有效 token**
    - 使用 fast-check 生成随机有效 token，验证 `getSessions()` 返回至少一个包含非空 `accessToken` 的 session
    - 添加注释 `// Feature: tscode-oauth-login, Property 9: getSessions returns valid token`
    - **Validates: Requirements 7.2**
    - **Property 10: token 变更触发 onDidChangeSessions 事件**
    - 使用 fast-check 生成随机 token 变更操作序列，验证每次变更触发恰好一次 `onDidChangeSessions`
    - 添加注释 `// Feature: tscode-oauth-login, Property 10: token change triggers onDidChangeSessions`
    - **Validates: Requirements 7.3, 8.4**

  - [ ]* 7.2 为 OAuthProvider 编写单元测试
    - 测试未登录时 `getSessions()` 返回空数组、`createSession()` 触发登录流程
    - _Requirements: 7.2, 7.4_

- [x] 8. 实现 Workbench Contribution 注册入口（tsCodeAuth.contribution.ts）
  - 在 `src/vs/workbench/contrib/tsCodeAuth/browser/tsCodeAuth.contribution.ts` 中实现 `TsCodeAuthContribution` 类
  - 实现 `IWorkbenchContribution` 接口，设置 `static ID = 'workbench.contrib.tsCodeAuth'`
  - 构造函数中注入 `ITsCodeAuthService`、`ILifecycleService`
  - 调用 `authService.checkAndHandleAuth()` 执行启动时 token 校验
  - 使用 `registerWorkbenchContribution2` 以 `WorkbenchPhase.BlockRestore` 阶段注册
  - 注册 `TsCodeTokenStore` 和 `TsCodeAuthService` 到 DI 容器（`registerSingleton`）
  - 注册 `TsCodeCallbackHandler` 到 `IURLService`
  - 注册 `TsCodeOAuthProvider` 到 `IAuthenticationService`
  - 文件顶部添加 `// test-workbench_change - new file` 注释
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.5_

- [x] 9. 修改 workbench.desktop.main.ts 导入 contribution
  - 在 `src/vs/workbench/workbench.desktop.main.ts` 中添加 import 语句：
    `import './contrib/tsCodeAuth/browser/tsCodeAuth.contribution.js';`
  - 在 import 语句行末添加注释 `// test-workbench_change`
  - _Requirements: 1.1_

- [x] 10. 检查点 - 确保所有组件集成正确
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 11. 编写集成测试
  - [ ]* 11.1 完整 OAuth 流程 happy path 集成测试
    - mock BackendAPI，验证从点击登录到 session 注册的完整链路
    - 验证 `WelcomePage` 关闭、工作台正常加载、`OAuthProvider.getSessions()` 返回有效 session
    - _Requirements: 2.6, 4.5, 4.6, 6.1, 6.4_

  - [ ]* 11.2 token 过期自动刷新集成测试
    - mock 时间和 BackendAPI，验证 `refreshTokenIfNeeded()` 在 token 即将过期时自动刷新
    - 验证刷新失败时 token 被清除并触发 `onDidChangeSessions`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 11.3 多插件 session 共享集成测试
    - 验证 `vscode.authentication.getSession('tscode-oauth', [])` 返回正确 session
    - _Requirements: 7.1, 7.2_

- [x] 12. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

## Notes

- 标有 `*` 的子任务为可选项，可跳过以加快 MVP 交付
- 每个任务均标注了对应的需求编号以保证可追溯性
- 所有新增文件和对现有文件的修改均需添加 `test-workbench_change` 注释
- 属性测试使用 fast-check 库，每个属性至少运行 100 次迭代
- 单元测试 mock `ISecretStorageService`、`IStorageService`、`IWebviewService` 等 VSCode 服务
