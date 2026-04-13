# Requirements Document

## Introduction

本功能为 TSCode（VSCode fork 项目）实现启动时 OAuth 登录认证机制。系统在启动时检查本地存储的 token 有效性，若无效则展示登录页面，引导用户通过外部浏览器完成 OAuth 授权流程，获取 token 后存储到本地并展示用户信息。其他插件可通过 VSCode Authentication API 获取登录凭据。

## Glossary

- **TSCode**: 基于 VS Code 源码的 fork 项目，本功能的宿主应用
- **AuthService**: 负责 token 校验、存储和用户信息管理的核心认证服务
- **WelcomePage**: TSCode 启动时展示的登录欢迎页面（WebviewPanel）
- **OAuthProvider**: 实现 VSCode `AuthenticationProvider` 接口的自定义认证提供者
- **TokenStore**: 负责将 token 和用户信息持久化到本地存储（SecretStorage）的组件
- **CallbackHandler**: 处理 OAuth 回调 URI 并提取授权码的组件
- **AuthorizationCode**: OAuth 2.0 授权码，由外部浏览器完成授权后携带在回调 URI 中的 `code` 参数
- **AccessToken**: 通过 AuthorizationCode 换取的访问令牌，用于后续 API 调用
- **UserInfo**: 包含用户标识符和显示名称的用户信息对象
- **BackendAPI**: 提供 token 换取和用户信息查询接口的后端服务，基础地址为 `https://test.cmbchina.com`

---

## Requirements

### Requirement 1: 启动时 Token 有效性校验

**User Story:** 作为 TSCode 用户，我希望系统在启动时自动检查我的登录状态，以便在 token 有效时直接进入工作台，无需重复登录。

#### Acceptance Criteria

1. WHEN TSCode 启动时，THE AuthService SHALL 读取 TokenStore 中存储的 AccessToken
2. WHEN TSCode 启动且 TokenStore 中存在有效的 AccessToken 时，THE AuthService SHALL 跳过登录流程并直接加载工作台
3. WHEN TSCode 启动且 TokenStore 中不存在 AccessToken 时，THE AuthService SHALL 触发显示 WelcomePage
4. WHEN TSCode 启动且 TokenStore 中的 AccessToken 已过期时，THE AuthService SHALL 触发显示 WelcomePage
5. IF TokenStore 读取操作失败，THEN THE AuthService SHALL 记录错误日志并触发显示 WelcomePage

---

### Requirement 2: 登录欢迎页面展示

**User Story:** 作为未登录的 TSCode 用户，我希望看到一个清晰的登录引导页面，以便了解如何开始使用 TSCode。

#### Acceptance Criteria

1. WHEN WelcomePage 被触发显示时，THE WelcomePage SHALL 在工作台主区域以全屏 WebviewPanel 形式渲染
2. THE WelcomePage SHALL 展示品牌名称 "TSCode"
3. THE WelcomePage SHALL 展示标题文本 "欢迎使用 TSCode"
4. THE WelcomePage SHALL 展示一个标签为 "登录" 的按钮
5. WHILE WelcomePage 处于显示状态，THE WelcomePage SHALL 阻止用户访问工作台的其他功能区域
6. WHEN 用户点击 "登录" 按钮时，THE WelcomePage SHALL 通知 AuthService 发起 OAuth 授权流程

---

### Requirement 3: OAuth 授权流程发起

**User Story:** 作为未登录的 TSCode 用户，我希望点击登录按钮后能跳转到授权页面，以便通过标准 OAuth 流程完成身份验证。

#### Acceptance Criteria

1. WHEN AuthService 收到发起授权的指令时，THE AuthService SHALL 生成一个唯一的 `state` 参数用于防止 CSRF 攻击
2. WHEN AuthService 发起授权时，THE AuthService SHALL 构造授权 URL，目标地址为 `https://test.cmbchina.com`，且该 URL 必须包含以下参数：`client_id`（固定值，代表 TSCode 应用标识）、`redirect_uri`（值为 `tscode://auth/callback`）、`state`（防 CSRF 随机值）
3. WHEN AuthService 构造完授权 URL 后，THE AuthService SHALL 调用系统默认浏览器打开该 URL
4. THE AuthService SHALL 将 `redirect_uri` 设置为 TSCode 可拦截的自定义 URI 协议地址（格式：`tscode://auth/callback`）
5. WHEN 外部浏览器被打开后，THE WelcomePage SHALL 展示等待授权完成的提示信息

---

### Requirement 4: OAuth 回调处理与 Token 换取

**User Story:** 作为完成外部浏览器授权的用户，我希望 TSCode 能自动接收授权结果并换取 token，以便无缝完成登录流程。

#### Acceptance Criteria

1. WHEN 外部浏览器完成授权并跳转回调 URI 时，THE CallbackHandler SHALL 拦截该 URI 请求
2. WHEN CallbackHandler 拦截到回调 URI 时，THE CallbackHandler SHALL 从 URI 的查询参数中提取 `code` 参数
3. WHEN CallbackHandler 提取到 `code` 参数时，THE CallbackHandler SHALL 验证回调中的 `state` 参数与发起授权时生成的 `state` 一致
4. IF 回调中的 `state` 参数与预期不符，THEN THE CallbackHandler SHALL 中止流程并向用户展示安全错误提示
5. WHEN `state` 验证通过后，THE AuthService SHALL 携带 `code` 参数调用 BackendAPI 的 token 换取接口
6. WHEN BackendAPI 返回成功响应时，THE AuthService SHALL 从响应中提取 AccessToken 和 UserInfo
7. IF BackendAPI 返回错误响应，THEN THE AuthService SHALL 向用户展示登录失败提示，并允许用户重试

---

### Requirement 5: Token 和用户信息本地存储

**User Story:** 作为已完成登录的用户，我希望我的登录状态能被持久化保存，以便下次启动 TSCode 时无需重新登录。

#### Acceptance Criteria

1. WHEN AuthService 成功获取 AccessToken 和 UserInfo 后，THE TokenStore SHALL 将 AccessToken 存储到 VSCode SecretStorage 中
2. WHEN AuthService 成功获取 UserInfo 后，THE TokenStore SHALL 将 UserInfo 存储到 VSCode globalState 中
3. THE TokenStore SHALL 在存储 AccessToken 时同时存储其过期时间（若 BackendAPI 返回该信息）
4. IF TokenStore 存储操作失败，THEN THE AuthService SHALL 记录错误日志并向用户展示存储失败提示

---

### Requirement 6: 登录成功后用户信息展示

**User Story:** 作为已登录的 TSCode 用户，我希望在界面上能看到我的账户信息，以便确认当前登录身份。

#### Acceptance Criteria

1. WHEN 登录流程成功完成后，THE OAuthProvider SHALL 通过 VSCode Authentication API 注册当前用户的 AuthenticationSession
2. WHEN OAuthProvider 注册 AuthenticationSession 后，THE TSCode SHALL 在活动栏的账户图标处展示已登录用户的显示名称
3. THE OAuthProvider SHALL 将 AuthenticationSession 的 `id` 设置为用户唯一标识符，`label` 设置为用户显示名称
4. WHEN 登录成功后，THE WelcomePage SHALL 关闭，工作台正常加载

---

### Requirement 7: 对外暴露认证信息供其他插件使用

**User Story:** 作为 TSCode 平台上的插件开发者，我希望能通过标准 VSCode API 获取当前用户的 token 和用户信息，以便插件实现与后端服务的集成。

#### Acceptance Criteria

1. THE OAuthProvider SHALL 以 `tscode-oauth` 为 `providerId` 注册到 VSCode Authentication API
2. WHEN 其他插件调用 `vscode.authentication.getSession('tscode-oauth', scopes)` 时，THE OAuthProvider SHALL 返回包含 AccessToken 的 AuthenticationSession
3. WHEN AccessToken 发生变更（刷新或重新登录）时，THE OAuthProvider SHALL 触发 `onDidChangeSessions` 事件通知所有订阅方
4. WHILE 用户未登录时，THE OAuthProvider SHALL 在其他插件请求 session 且 `createIfNone` 为 `true` 时触发登录流程

---

### Requirement 8: Token 过期与刷新处理

**User Story:** 作为长期使用 TSCode 的用户，我希望系统能自动处理 token 过期问题，以便在不打扰我的情况下保持登录状态。

#### Acceptance Criteria

1. WHEN AuthService 检测到 AccessToken 即将过期（距过期时间不足 5 分钟）时，THE AuthService SHALL 尝试调用 BackendAPI 的 token 刷新接口
2. WHEN token 刷新成功时，THE TokenStore SHALL 更新存储的 AccessToken 和过期时间
3. IF token 刷新失败，THEN THE AuthService SHALL 清除 TokenStore 中的 AccessToken，并在下次需要认证时触发重新登录流程
4. WHEN AccessToken 被清除后，THE OAuthProvider SHALL 触发 `onDidChangeSessions` 事件

