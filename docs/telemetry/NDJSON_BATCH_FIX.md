# NDJSON 批量事件处理问题修复

## 问题描述

VS Code 使用 1DS 库批量发送遥测事件（NDJSON 格式，多个 JSON 对象用换行符分隔），但 Logstash 的 HTTP input plugin 使用 `codec => json` 只能解析第一个 JSON 对象，导致批量事件中的其他事件被丢弃。

### 症状
- 扩展激活信息（`activatePlugin`, `extensionActivationTimes`）丢失
- 批量发送的事件只有第一个被处理
- Elasticsearch 的 `event.original` 字段中可以看到完整的批量数据，但只有第一个被解析成独立记录

### 根本原因
**不是 Nginx 导致的问题**，而是 Logstash 的限制：
- Logstash HTTP input plugin 的 `codec => json` 只能处理单个 JSON 对象
- VS Code 的 1DS 库默认会批量发送事件（NDJSON 格式）
- 之前的配置（`logstash 2.conf`）也存在同样的问题

## 解决方案

### 方案 1：修改 VS Code 源码（推荐）✅

禁用 1DS 库的批量发送功能，让每个事件单独发送。

**修改文件：** `src/vs/platform/telemetry/common/1dsAppender.ts`

```typescript
const channelConfig: IChannelConfiguration = {
    alwaysUseXhrOverride: true,
    ignoreMc1Ms0CookieProcessing: true,
    httpXHROverride: xhrOverride,
    // test-workbench_change: 禁用批量发送
    maxBatchSizeInBytes: 1,
    maxBatchInterval: 0
};
```

**优点：**
- 彻底解决问题
- 不需要修改 Logstash 或 Nginx 配置
- 每个事件都能被正确处理

**缺点：**
- 需要重新编译 VS Code
- 会增加 HTTP 请求数量（但对内网部署影响不大）

### 方案 2：使用中间层处理（备选）

在 Nginx 和 Logstash 之间添加一个 Python/Node.js 服务，将 NDJSON 批量请求拆分成多个单独的请求。

**优点：**
- 不需要修改 VS Code 源码

**缺点：**
- 增加系统复杂度
- 需要维护额外的服务
- 可能成为性能瓶颈

### 方案 3：接受现状（不推荐）

只处理批量中的第一个事件，接受部分数据丢失。

## 实施步骤

### 1. 应用代码修改

代码已修改：`src/vs/platform/telemetry/common/1dsAppender.ts`

### 2. 重新编译 VS Code

```bash
# 安装依赖（如果还没有）
yarn install

# 编译
yarn compile

# 或者完整构建
yarn gulp vscode-darwin-arm64  # macOS ARM64
# yarn gulp vscode-linux-x64    # Linux x64
# yarn gulp vscode-win32-x64    # Windows x64
```

### 3. 测试验证

1. 启动编译后的 VS Code
2. 触发扩展激活（打开文件、使用扩展功能）
3. 在 Kibana 中查询扩展激活事件：

```
event_type: "activatePlugin" OR event_type: "extensionActivationTimes"
```

4. 验证事件数量是否正常

### 4. 监控 Logstash 日志

```bash
docker logs -f logstash 2>&1 | grep -E "(event_name|activatePlugin)"
```

## 验证结果

修改前：
- 批量发送 3 个事件，只有第一个被处理
- Elasticsearch 中只有 1 条记录

修改后（预期）：
- 每个事件单独发送
- Elasticsearch 中有 3 条记录
- 所有扩展激活信息都能正常收集

## 相关文件

- `src/vs/platform/telemetry/common/1dsAppender.ts` - 遥测发送配置
- `docs/telemetry/logstash.conf` - Logstash 配置
- `docs/telemetry/nginx/nginx.conf` - Nginx 配置

## 注意事项

1. **标记修改**：所有修改都使用 `test-workbench_change` 注释标记，便于后续合并上游代码
2. **性能影响**：禁用批量发送会增加 HTTP 请求数量，但对内网部署（1000 用户）影响不大
3. **Nginx 配置**：已移除强制修改 Content-Type 的配置，保留原始请求头
