# VS Code 遥测系统搭建指南

基于 ELK Stack 收集和分析 VS Code 遥测数据。VS Code 通过 1DS 协议将遥测事件以 HTTP POST 方式发送到 Logstash，再存入 Elasticsearch，最终在 Kibana 中可视化。

## 目录结构

```
遥测配置/
├── docker-compose.yml                      # ELK Stack 容器编排（部署在 ELK 服务器）
├── logstash.conf                           # Logstash 数据处理管道
├── elasticsearch-template-v8.json          # ES 索引模板（v8 格式）
├── nginx/
│   ├── docker-compose.yml                  # Nginx 容器编排（部署在 Nginx 服务器）
│   └── nginx.conf                          # Nginx 反向代理配置
├── vscode-telemetry-dashboard.ndjson       # Kibana 总览仪表板
└── vscode-extensions-dashboard.ndjson      # Kibana 扩展分析仪表板
```

## 部署架构

```
VS Code 客户端
  │  :8070 遥测数据
  │  :8071 健康检查
  ▼
[ Nginx 服务器 ]          ← nginx/docker-compose.yml
  │  :8070 → ELK服务器:8080 (Logstash)
  │  :8071 → ELK服务器:8081 (Logstash)
  │  :8088 → ELK服务器:5601 (Kibana)
  ▼
[ ELK 服务器 ]            ← docker-compose.yml
  ├── Logstash :8080/:8081
  ├── Elasticsearch :9200
  └── Kibana :5601
```

## 前置要求

- Docker 和 Docker Compose
- 内存 ≥ 4GB（Elasticsearch 1GB + Logstash 512MB）
- 端口 5601、8080、8081、9200、9600 未被占用

## 第一步：修改 VS Code 源码

打包前需要修改两处源码，让 VS Code 将遥测数据发送到本地服务器。

**1. 修改遥测端点** (`src/vs/platform/telemetry/common/1dsAppender.ts`)

```typescript
// test-workbench_change start
const endpointUrl = 'http://<服务器IP>:8070';
const endpointHealthUrl = 'http://<服务器IP>:8071';
// test-workbench_change end
```

本机测试时用 `http://127.0.0.1:8070`，部署到服务器时替换为实际 IP。注意端口是 8070/8071（Nginx 映射端口），不是 8080/8081（Logstash 内部端口）。

**2. 启用遥测** (`product.json`)

```json
{
  "enableTelemetry": true,
  "aiConfig": {
    "ariaKey": "any-non-empty-string"
  }
}
```

`ariaKey` 可以是任意非空字符串，不需要真实的 Microsoft 密钥。

修改完成后重新打包：

```bash
npm run compile-build
npm run compile-extensions-build
npm run gulp vscode-darwin-arm64   # macOS arm64
```

## 第二步：启动 ELK Stack

在 **ELK 服务器**上执行：

```bash
cd 遥测配置
docker compose up -d
```

首次启动时，`es-setup` 容器会自动完成以下初始化：
- 设置 `kibana_system` 内置用户密码
- 创建 `logstash_user`（写入权限）
- 创建 `viewer` 访客用户（只读权限）

等待所有服务健康（约 2-3 分钟）：

```bash
docker compose ps
```

`elasticsearch`、`logstash`、`kibana` 均显示 `healthy` 后继续。

## 第二步（可选）：启动 Nginx

如果 VS Code 客户端与 ELK 服务器之间需要通过独立的 Nginx 服务器中转，在 **Nginx 服务器**上执行：

**1. 修改后端地址**

编辑 `nginx/nginx.conf`，将 `ELK_SERVER_IP` 替换为 ELK 服务器的实际 IP：

```nginx
upstream logstash_telemetry { server 192.168.1.100:8080; }
upstream logstash_health     { server 192.168.1.100:8081; }
upstream kibana_backend      { server 192.168.1.100:5601; }
```

**2. 启动 Nginx**

```bash
cd 遥测配置/nginx
docker compose up -d
```

**3. 修改 VS Code 遥测端点**

将 `1dsAppender.ts` 中的端点改为 Nginx 服务器的 IP：

```typescript
const endpointUrl = 'http://<Nginx服务器IP>:8070';
const endpointHealthUrl = 'http://<Nginx服务器IP>:8071';
```

> 如果不需要 Nginx 中转，VS Code 直接指向 ELK 服务器 IP 即可，ELK 的 8080/8081 端口已对外暴露。

### 账号说明

| 用户 | 密码 | 权限 | 用途 |
|---|---|---|---|
| `elastic` | `Admin@123456` | 超级管理员 | 管理 ES 集群、修改配置 |
| `viewer` | `Viewer@123456` | 只读 | 访客查看 Kibana 仪表板 |
| `logstash_user` | `Logstash@123456` | 写入遥测索引 | Logstash 内部使用，无需手动登录 |

> 生产环境请修改 `docker-compose.yml` 中的默认密码。

## 第三步：验证服务

```bash
# Elasticsearch（需要认证）
curl -u elastic:Admin@123456 http://localhost:9200

# 遥测接收端点（经 Nginx 转发，返回 ok 表示正常）
curl -X POST http://localhost:8070 \
  -H "Content-Type: application/json" \
  -d '{"name":"monacoworkbench/test","time":"2024-01-01T00:00:00.000Z","iKey":"test","data":{"baseData":{"properties":{"version":"1.0"}}}}'

# 健康检查端点（经 Nginx 转发，返回 ok 表示正常）
curl http://localhost:8071
```

## 第四步：导入 Kibana 仪表板

Kibana 登录地址：http://localhost:8088（经 Nginx 转发）

- 管理员：`elastic` / `Admin@123456`
- 访客：`viewer` / `Viewer@123456`

```bash
# 导入总览仪表板（需要管理员权限）
curl -X POST "http://localhost:8088/api/saved_objects/_import?overwrite=true" \
  -u elastic:Admin@123456 \
  -H "kbn-xsrf: true" \
  -F "file=@tscode-telemetry-dashboard.ndjson"

# 导入扩展分析仪表板
curl -X POST "http://localhost:8088/api/saved_objects/_import?overwrite=true" \
  -u elastic:Admin@123456 \
  -H "kbn-xsrf: true" \
  -F "file=@tscode-extensions-dashboard.ndjson"
```

或在 Kibana 界面操作：**Management → Stack Management → Saved Objects → Import**

## 第五步：启动 VS Code 并验证

启动打包后的 VS Code，执行一些操作（打开文件、执行命令、激活扩展等），然后：

```bash
# 查看是否有数据写入（需要认证）
curl -u elastic:Admin@123456 -s "http://localhost:9200/vscode-telemetry-*/_count"
```

打开 Kibana（http://localhost:8088）→ Dashboard，选择仪表板查看数据。

---

## 数据流说明

```
VS Code
  │  POST http://<server>:8070   （遥测事件）
  │  GET  http://<server>:8071   （健康检查）
  ▼
Nginx
  │  :8070 → logstash:8080
  │  :8071 → logstash:8081
  │  :8088 → kibana:5601
  ▼
Logstash :8080
  │  解析字段，提取 event_type、machine_id 等
  ▼
Elasticsearch :9200
  │  索引：tscode-telemetry-YYYY.MM.dd
  ▼
Kibana（经 Nginx :8088 访问）
   仪表板可视化
```

### 1DS 事件格式

VS Code 发送的原始数据结构：

```json
{
  "name": "monacoworkbench/workbenchActionExecuted",
  "time": "2024-01-01T00:00:00.000Z",
  "iKey": "o:your-key",
  "data": {
    "baseData": {
      "properties": {
        "id": "workbench.action.showTelemetry",
        "from": "quick open",
        "common.machineId": "abc123",
        "sessionID": "session-xyz",
        "version": "1.95.0",
        "common.platform": "Mac"
      },
      "measurements": {
        "common.timesincesessionstart": 5000,
        "common.sequence": 42
      }
    }
  }
}
```

事件名前缀 `monacoworkbench/` 对应 VS Code 内部的事件名，Logstash 处理时会去掉前缀，存储为 `workbenchActionExecuted`。

### Logstash 处理后的字段

| 字段 | 来源 | 说明 |
|---|---|---|
| `event_name` | `name` 字段去掉前缀 | 如 `workbenchActionExecuted` |
| `event_type` | 同 `event_name` | 用于 Kibana 过滤 |
| `machine_id` | `telemetry.properties.common.machineId` | 用户机器唯一标识 |
| `session_id` | `telemetry.properties.sessionID` | 会话标识 |
| `vscode_version` | `telemetry.properties.version` | VS Code 版本号 |
| `platform` | `telemetry.properties.common.platform` | Mac / Windows / Linux |
| `node_arch` | `telemetry.properties.common.nodeArch` | arm64 / x64 |
| `telemetry.properties.*` | `data.baseData.properties` | 完整属性对象 |
| `telemetry.measurements.*` | `data.baseData.measurements` | 完整测量值对象 |

---

## 仪表板说明

### VS Code 遥测总览

文件：`vscode-telemetry-dashboard.ndjson`

| 面板 | 说明 |
|---|---|
| 活跃用户数 | 按 `machine_id` 去重计数 |
| 活跃会话数 | 按 `session_id` 去重计数 |
| 总事件数 | 所有事件总量 |
| 事件趋势 | 按时间分组的事件数量折线图 |
| 事件类型分布 | `event_type` 饼图 |
| 最常用命令 Top 20 | `workbenchActionExecuted` 事件中的 `id` 字段 |
| 扩展激活 Top 20 | `activatePlugin` 事件，含平均激活耗时 |
| 平台分布 | Mac / Windows / Linux 占比 |
| 版本分布 | 各 VS Code 版本占比 |
| 用户活跃度排行 | 按用户统计事件数和会话数 |
| 错误事件列表 | `UnhandledError` 事件 |
| 最近事件 | Discover 原始数据视图 |

### VS Code 扩展分析

文件：`vscode-extensions-dashboard.ndjson`

| 面板 | 说明 |
|---|---|
| 扩展激活次数 Top 20 | 含平均激活耗时和加载耗时 |
| 扩展激活耗时柱状图 | 最慢的扩展，100ms 红线标注 |
| 激活触发原因分布 | `onStartupFinished` / `onLanguage` 等 |
| 内置 vs 第三方 | `isBuiltin` 字段区分 |
| 激活结果分布 | success / failure |
| 废弃 API 使用情况 | 哪些扩展在调用废弃 API |
| 扩展触发操作 Top 20 | `Extension:ActionExecuted` 事件 |
| 发布者分布 | 按 `publisherDisplayName` 聚合 |
| 启动时激活扩展趋势 | `startup=1` 的扩展数量变化 |
| 激活详情 | Discover 原始数据视图 |

---

## 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看 Logstash 日志（排查接收问题）
docker compose logs -f logstash

# 查询今日事件数量（需要认证）
curl -u elastic:Admin@123456 -s "http://localhost:9200/tscode-telemetry-*/_count"

# 查询最新 5 条事件
curl -u elastic:Admin@123456 -s "http://localhost:9200/tscode-telemetry-*/_search?size=5&sort=@timestamp:desc&pretty"

# 重启 Logstash（修改配置后）
docker compose restart logstash

# 停止所有服务
docker compose down

# 停止并清除数据
docker compose down -v
```

## 调试：查看原始接收数据

编辑 `logstash.conf`，在 output 块中取消注释：

```
if [type] == "vscode_telemetry_http" {
  stdout { codec => rubydebug }
}
```

然后 `docker compose restart logstash`，执行 `docker compose logs -f logstash` 即可看到完整的原始事件结构。**调试完记得注释回去。**

### 重要说明：批量事件处理

VS Code 的 1DS 遥测库会将多个事件批量发送（NDJSON 格式，每行一个 JSON 对象）。Logstash 配置使用 `codec => json_lines` 来正确解析这种格式。如果使用 `codec => json`，只会处理第一个事件，导致大部分扩展激活信息丢失。

## 常见问题

**Q: VS Code 没有发送遥测数据**

检查以下几点：
1. `product.json` 是否包含 `enableTelemetry: true` 和 `aiConfig.ariaKey`
2. 是否重新打包（开发模式下遥测端点不生效）
3. 健康检查端点是否可访问：`curl http://<server>:8071`
4. VS Code 设置中 `telemetry.telemetryLevel` 是否为 `all` 或 `error`

**Q: Logstash 启动失败**

查看日志：`docker compose logs logstash`。常见原因是配置文件语法错误，可用以下命令验证：

```bash
docker run --rm \
  -v $(pwd)/logstash.conf:/config/logstash.conf \
  logstash:7.17.26 logstash -f /config/logstash.conf --config.test_and_exit
```

**Q: Kibana 仪表板没有数据**

确认索引模式时间范围，默认显示最近 24 小时。点击右上角时间选择器调整范围。
