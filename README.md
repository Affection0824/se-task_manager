# 拾序 · 任务管理器

软件工程课程实践 01：一个基于 **Vue 3 + Vite + Tailwind CSS + localStorage** 的中文任务管理网页。

仓库：<https://github.com/Affection0824/se-task_manager>（私有）

## 快速开始

需要先安装 Node.js 22.12+（22 系列）或 Node.js 24+，以及随附的 npm。开发工具属于运行环境，不需要安装全局项目依赖。

在本项目文件夹打开终端：

```sh
npm ci
npm run dev
```

打开终端显示的地址：<http://127.0.0.1:5173>。Windows 也可以双击 **启动项目.cmd**；首次运行会安装依赖，然后打开网页。关闭对应终端或按 Ctrl+C 停止服务。

开发和预览固定使用端口 5173。如果端口被占用，请先关闭之前启动的本项目服务，再运行。固定访问地址可以持续读取同一份本地任务。

## 已实现的功能

- 新增任务：标题必填，去除首尾空格，最多 100 个字符；备注选填，最多 1000 个字符。
- 修改任务：在弹窗编辑标题、备注，支持取消和 Esc 关闭。
- 删除任务：二次确认，取消不会改变数据。
- 完成状态：点击任务左侧圆圈，在待完成和已完成之间切换。
- 任务概览、状态筛选、标题及备注搜索。
- localStorage 自动保存；刷新、关闭后重新打开同一地址仍可读取。
- JSON 备份导出与导入；导入采用合并方式，相同编号保留现有任务，不会重复添加。
- 存储异常提示；存储写入成功才更新界面；读取失败时保留原数据并阻止覆盖。
- 同一浏览器多个标签页之间同步任务变更。
- 桌面及移动宽度布局，键盘操作和带标签的表单。

## 移动项目与数据

所有源码、图标、样式、依赖和缓存都在本文件夹中。没有 CDN、外部字体、远程图片或运行时后端请求。源码引用使用相对路径，Vite 的 `base` 为 `./`，构建资源可放入静态服务器的子目录。

**移动项目**：复制整个文件夹即可（包括 `.git` 才能保留 Git 历史）。换一台电脑或操作系统时，建议重新运行 `npm ci` 安装适配平台的依赖。`node_modules`、`.npm-cache`、`dist` 是可重新生成的内容，不提交到 GitHub。

**移动任务数据**：localStorage 位于浏览器的当前站点存储中，不是本项目中的文件。换浏览器、访问域名或端口、电脑，任务不会自动跟随。

1. 移动之前，点击网页中的「导出备份」。
2. 将下载的 JSON 文件放到本项目的 `data/` 文件夹，再复制整个项目。
3. 在新位置启动项目，点击「导入」选择备份文件。

`data/*.json` 已加入忽略规则，个人任务备份不会被提交到 GitHub。清除浏览器站点数据会删除本地任务，请提前导出。导入单个备份文件上限为 2 MB。

不要直接双击 `index.html` 或 `dist/index.html`：这是通过本地 HTTP 服务运行的 Vue 应用。

## 验证与构建

```sh
npm test
npm run build
npm run preview
```

`npm test` 使用 Node 自带的测试工具，覆盖标题校验、增删改和状态切换、存储往返、非法备份、存储异常、合并去重。`npm run build` 生成 `dist/`，`npm run preview` 预览构建结果。预览前需停止正在占用 5173 的开发服务。

GitHub Actions 在推送和 Pull Request 时自动安装依赖、运行测试并构建，不会发布网页。

## 文件结构

```text
./
├── .github/workflows/ci.yml   # 自动验证
├── data/                     # 任务备份存放说明
├── public/favicon.svg        # 本地图标
├── src/
│   ├── components/AppIcon.vue # 项目内的 SVG 图标
│   ├── lib/tasks.js           # 任务操作、数据校验和持久化
│   ├── App.vue               # 中文任务管理界面
│   ├── main.js               # Vue 入口
│   └── style.css             # Tailwind 引入及响应式样式
├── tests/tasks.test.js        # 数据逻辑测试
├── index.html
├── package.json
├── package-lock.json         # 锁定实际依赖版本
├── vite.config.js            # 相对资源路径配置
└── 启动项目.cmd               # Windows 启动入口
```

## GitHub 日常管理

在项目文件夹内执行：

```sh
git status
git add .
git commit -m "描述本次修改"
git push
```

其他电脑首次使用可运行 `git clone` 下载私有仓库，需登录有访问权限的 GitHub 账户。已有项目更新使用 `git pull --ff-only`。项目不保存访问令牌或账户密码。

技术文档：[Vue 3](https://vuejs.org/guide/quick-start.html) · [Vite](https://vite.dev/guide/) · [Tailwind CSS](https://tailwindcss.com/docs/installation/using-vite)
