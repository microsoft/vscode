════════════════════════════════════════════════════════════
  ModelRouter v19.0 三洞补丁版 — 自检
════════════════════════════════════════════════════════════

🧪 测试1: caller 透传
  ✅ call() 方法签名包含 caller 参数
  ✅ _call_model() 方法签名包含 caller 参数
  ✅ record_cost() 接收 caller 参数

🧪 测试2: 免费池返回0
  ✅ siliconflow/deepseek-ai/DeepSeek-V3: $0.00000000 (expected $0.00000000)
  ✅ zhipu/glm-4-flash: $0.00000000 (expected $0.00000000)
  ✅ qianfan/glm-5: $0.00000000 (expected $0.00000000)
  ✅ deepseek/deepseek-chat: $0.00015000 (expected $0.00015000)
  ✅ openrouter/openai/gpt-5.4: $0.00300000 (expected $0.00300000)

🧪 测试3: 千帆 quota 扣减已删除
  ✅ _call_model 内无 decrement_qianfan_quota 调用

🧪 测试4: CostController date 修复
  ✅ 新建记录 date='2026-05-18' == today='2026-05-18'
  ✅ 两次记录后 total_cost=0.003, tasks数=2

🧪 测试5: 熔断检查
  ✅ is_locked_down() = False

════════════════════════════════════════════════════════════
  ✅ 全部自检通过！v19.0 可以部署
════════════════════════════════════════════════════════════