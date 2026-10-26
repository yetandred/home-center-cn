# HomeCenter 中文化翻译规范（zh-CN 分支）

## 目标
将界面中所有用户可见的英文文案翻译为简体中文。这是"硬翻"模式：直接改源文件中的字符串。

## 术语表（必须统一，不得各自发挥）
| 英文 | 中文 |
|---|---|
| Asset | 资产 |
| Property | 房产 |
| Vehicle | 车辆 |
| Equipment | 设备 |
| Room | 房间 |
| Maintenance | 维护 |
| Service Record | 维护记录 |
| Reminder | 提醒 |
| Due / Overdue | 到期 / 已逾期 |
| Snooze | 稍后提醒 |
| Warranty | 保修 |
| Insurance | 保险 |
| Receipt | 收据 |
| Cost / Expense | 费用 / 支出 |
| Provider | 供应商 |
| Document | 文档 |
| Attachment | 附件 |
| Intake / Inbox | 收件箱 |
| Health | 健康 |
| Condition / Symptom | 病症 / 症状 |
| Medication | 用药 |
| Allergy | 过敏 |
| Immunization | 疫苗接种 |
| Visit / Appointment | 就诊 / 预约 |
| Dashboard | 仪表盘 |
| Search | 搜索 |
| Settings | 设置 |
| Notification | 通知 |
| Report | 报告 |
| Export / Import / Backup / Restore | 导出 / 导入 / 备份 / 恢复 |
| Save / Cancel / Delete / Edit | 保存 / 取消 / 删除 / 编辑 |
| Add / New | 添加 / 新建 |
| Confirm | 确认 |
| Upload / Download | 上传 / 下载 |
| Sign in / Sign out / Login | 登录 / 退出登录 / 登录 |
| User / Account / Password | 用户 / 账户 / 密码 |
| Mileage / Odometer | 里程 / 里程表 |
| Category | 分类 |
| Merchant / Vendor | 商家 |
| Notes | 备注 |
| People / Person | 成员 / 成员 |
| Assistant (AI) | AI 助手 |

## 必须翻译
- JSX 文本节点（`<Button>Save</Button>` → `<Button>保存</Button>`）
- `placeholder`、`title`、`aria-label`、`label`、`alt`、`description` 等用户可见属性中的英文
- toast / sonner 提示消息、`confirm()` 文案、错误提示、空状态文案（"No items yet" → "暂无内容"）
- 页面 `metadata` 中的 title/description（仅用户可见部分）

## 禁止改动
- 变量名、函数名、类型名、接口字段、对象 key
- CSS 类名、Tailwind 类、URL、路由路径、文件路径
- 专有名词与技术缩写：OpenAI、Ollama、LM Studio、PDF、CSV、XLSX、API、URL、ID、PWA、OCR、LLM、BGE、E5 等
- 代码注释保持原样（不翻译，减小 diff）
- `*.test.ts` / `*.test.tsx` 测试文件一律不动
- `prisma/migrations/` 一律不动

## 特别小心（防破坏代码）
1. **字符串比较**：如果某字符串同时被代码逻辑比较（如 `if (status === "Active")` 或作为对象 key 查找），界面显示处可翻译，但逻辑判断处的字符串绝不能动。翻译前看清字符串的使用上下文；吃不准就不翻，记录下来。
2. **模板字符串**：`${...}` 插值表达式原样保留，只翻周围的静态文字。
3. **日期/数字格式化**：`toLocaleDateString("en-US")`、`Intl.*` 中的 locale 参数本次一律不动（后续统一处理）。
4. **Aria/屏幕阅读器**也可翻译，但属性名不能改。
5. 不要重排代码、不要改缩进、不要增删空行，保持最小 diff。
6. 翻译要自然、简洁，符合中文软件界面习惯；按钮文案一般 2-6 个字；不要逐词硬译。
7. 中英混排时英文与中文之间留一个空格（如 "PDF 文件"）。
8. 使用中文全角标点（，。：？！）于句子内；列表、标签等短语末尾不加句号。
