# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SiYuan Note plugin called "Export to Feishu" (导出到飞书) that exports SiYuan documents to Feishu (Lark) Docs. It uses the Feishu Open API to upload markdown files and import them as Feishu documents.

## Build Commands

```bash
pnpm install          # Install dependencies
pnpm run dev          # Development build with watch mode
pnpm run build        # Production build (generates package.zip for marketplace release)
pnpm run lint         # Run ESLint with auto-fix
```

## Architecture

### Plugin Entry Point
- `src/index.ts` - Main plugin class `ExportToFeishuPlugin` that extends SiYuan's `Plugin` base class

### Export Flow
1. Get current document's root ID from DOM
2. Export document as markdown via SiYuan API (`/api/export/exportMdContent`)
3. Upload markdown to Feishu temp folder via Feishu Drive API
4. Create import task to convert markdown to Feishu Doc
5. Poll for import completion, then delete temp file

### Key Feishu APIs Used
- `drive/v1/files/upload_all` - Upload files
- `drive/v1/import_tasks` - Create/check import tasks
- `drive/v1/files/{token}` - Delete files
- `drive/explorer/v2/root_folder/meta` - Get root folder

### Configuration Storage
Plugin config stored via SiYuan's `loadData`/`saveData` with key `feishu-config`:
- `tenantToken` - Feishu tenant access token
- `tempFolderToken` - Folder token for temporary file uploads
- `lastTargetFolderToken` - Last selected export destination

### Internationalization
- `src/i18n/en_US.json` and `src/i18n/zh_CN.json`
- Accessed via `this.i18n.key` in code

## Build Output

Development mode outputs to project root:
- `index.js`, `index.css`, `i18n/`

Production mode (`pnpm run build`):
- Outputs to `dist/` folder
- Creates `package.zip` for marketplace upload containing: `index.js`, `index.css`, `plugin.json`, `icon.png`, `preview.png`, `README*.md`, `i18n/`

## SiYuan Plugin Development Notes

- Use SiYuan kernel API for file operations (`/api/file/*`), not Node.js `fs`
- Plugin metadata in `plugin.json` (name must match repo name)
- Frontend API: https://github.com/siyuan-note/petal
- Backend API: https://github.com/siyuan-note/siyuan/blob/master/API.md
