# scene-prod-server

Scene Prod 的后端服务（Fastify + TypeScript + Zod + lowdb）。

## 启动

```bash
pnpm --filter scene-prod-server dev
```

默认端口 `3100`，健康检查：`GET /health`。

## 目录

```
src/
├── app.ts             # Fastify 实例入口
├── plugins/           # db / cors / multipart 等插件封装
└── routes/
    ├── project.ts     # 工程 CRUD
    ├── asset.ts       # 模型 / HDR 上传
    └── share.ts       # 分享链接
uploads/               # 上传文件目录（已 gitignore）
```

## 技术选型理由

- **Fastify**：比 Express 快，内置 schema 校验、logger。
- **TypeScript + Zod**：配合 `@scene-prod/shared` 做端到端类型 / 运行时校验。
- MongoDB。


## 使用的点
- 保存场景时，将场景及场景对象数据分开保存，场景对象数据保存到 SceneObjectModel 中，场景数据保存到 SceneModel 中。


