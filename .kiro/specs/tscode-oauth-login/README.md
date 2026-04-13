# TSCode 认证模块使用文档

本文档涵盖两部分内容：
1. `TSCODE_AUTH_MOCK_ENABLED` 开发调试开关说明
2. 插件（Extension）通过 VS Code Authentication API 获取 token 的使用指南

---

## 一、TSCODE_AUTH_MOCK_ENABLED 说明

### 定义位置

```
src/vs/workbench/contrib/tsCodeAuth/common/tsCodeAuth.ts
```

### 作用

`TSCODE_AUTH_MOCK_ENABLED` 是一个本地开发调试开关。设为 `true` 时，认证服务会跳过真实的 OAuth 流程和后端 API 调用，直接使用预设的 mock token 完成登录，方便在无网络或无后端环境下进行本地开发和调试。

```typescript
// 默认关闭，生产环境必须为 false
export const TSCODE_AUTH_MOCK_ENABLED = false;

// mock 模式下使用的假 token 数据
export const TSCODE_AUTH_MOCK_TOKEN: StoredToken = {
    token: 'mock-access-token-for-dev',
    userName: 'Mock User',
    employeeId: 'mock-001',
};
```

### 行为差异对比

| 场景 | `TSCODE_AUTH_MOCK_ENABLED = false`（默认） | `TSCODE_AUTH_MOCK_ENABLED = true` |
| --- | --- | --- |
| 触发登录 | 打开浏览器跳转 OAuth 页面 | 不打开浏览器 |
| token 获取 | 轮询后端接口 `/login/relate-token` | 10 秒后直接写入 mock token |
| 依赖网络 | 是 | 否 |
| 适用场景 | 生产 / 测试环境 | 本地开发调试 |

### 开启方式

修改 `src/vs/workbench/contrib/tsCodeAuth/common/tsCodeAuth.ts`，将值改为 `true`：

```typescript
export const TSCODE_AUTH_MOCK_ENABLED = true; // test-workbench_change
```

> **注意：** 此开关仅用于本地开发，提交代码前必须还原为 `false`。

### mock 模式下的登录流程

1. 调用 `startOAuthFlow()` 后，服务不会打开浏览器
2. 等待约 10 秒，`TSCODE_AUTH_MOCK_TOKEN` 会被自动写入 SecretStorage
3. 触发 `onDidLogin` 事件，UI 进入已登录状态
4. 后续 `getToken()` 返回 mock token 数据

---

## 二、插件获取 Token 使用指南

TSCode 内置了 OAuth 认证提供者，Provider ID 为 `tscode-oauth`。用户登录后，token 和用户信息以 `AuthenticationSession` 的形式暴露给所有插件。

### AuthenticationSession 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 用户唯一标识（优先取 `employeeId`，其次 `userName`） |
| `accessToken` | `string` | 登录 token，用于调用后端接口 |
| `account.id` | `string` | 同 `id` |
| `account.label` | `string` | 用户显示名（优先取 `userName`，其次 `employeeId`） |
| `idToken` | `string \| undefined` | ID Token（可选） |
| `scopes` | `string[]` | 请求时传入的 scopes |

### 静默获取（推荐）

不弹出任何 UI，仅在用户已登录时返回 session，适合大多数场景。

```typescript
import * as vscode from 'vscode';

async function getSession(): Promise<vscode.AuthenticationSession | undefined> {
    return vscode.authentication.getSession('tscode-oauth', [], {
        createIfNone: false,  // 不自动触发登录流程
        silent: true,         // 静默模式，不弹 UI
    });
}

const session = await getSession();
if (session) {
    const token = session.accessToken;
    const userName = session.account.label;
    const employeeId = session.account.id;
    console.log(`当前用户: ${userName}，token: ${token}`);
} else {
    console.log('用户未登录');
}
```
