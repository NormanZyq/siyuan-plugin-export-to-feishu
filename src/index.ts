import {
    Plugin,
    showMessage,
    Dialog,
    Setting,
    fetchPost,
} from "siyuan";
import "./index.scss";

const STORAGE_NAME = "feishu-config";

interface FeishuConfig {
    tenantToken: string;
    tempFolderToken: string;      // 临时文件上传目录
    tempFolderName: string;
    lastTargetFolderToken: string; // 上次选择的目标目录
    lastTargetFolderName: string;
}

interface ExportRecord {
    siyuanId: string;
    feishuFileToken: string;
    feishuDocToken: string;
    title: string;
    exportTime: number;
}

export default class ExportToFeishuPlugin extends Plugin {
    private config: FeishuConfig = {
        tenantToken: "",
        tempFolderToken: "",
        tempFolderName: "",
        lastTargetFolderToken: "",
        lastTargetFolderName: "",
    };
    private exportRecords: Map<string, ExportRecord> = new Map();

    async onload() {
        // 加载配置
        await this.loadConfig();

        // 添加顶栏图标
        this.addIcons(`<symbol id="iconFeishu" viewBox="0 0 1024 1024">
<path d="M512 85.333333c235.648 0 426.666667 191.018667 426.666667 426.666667s-191.018667 426.666667-426.666667 426.666667S85.333333 747.648 85.333333 512 276.352 85.333333 512 85.333333z m-74.965333 228.949334l-0.490667 0.32-175.36 122.538666a42.666667 42.666667 0 0 0-15.872 49.28l0.256 0.618667 85.333333 200.533333a42.666667 42.666667 0 0 0 34.56 25.557334l1.066667 0.085333 195.114667 8.874667a42.666667 42.666667 0 0 0 23.893333-6.186667l0.426667-0.277333 175.36-122.538667a42.666667 42.666667 0 0 0 15.872-49.28l-0.256-0.618667-85.333334-200.533333a42.666667 42.666667 0 0 0-34.56-25.557334l-1.066666-0.085333-195.114667-8.874667a42.666667 42.666667 0 0 0-23.829333 6.144z m23.893333 55.04l171.050667 7.786666 74.837333 175.829334-153.770667 107.434666-171.050666-7.786666-74.837334-175.829334 153.770667-107.434666z"/>
</symbol>`);

        // 添加顶栏按钮
        this.addTopBar({
            icon: "iconFeishu",
            title: this.i18n.exportToFeishu,
            position: "right",
            callback: () => {
                this.handleExport();
            }
        });

        // 添加命令
        this.addCommand({
            langKey: "exportToFeishu",
            hotkey: "⇧⌘F",
            callback: () => {
                this.handleExport();
            },
        });

        // 设置页面
        this.initSetting();
    }

    async onunload() {
        await this.saveData(STORAGE_NAME, this.config);
    }

    private async loadConfig() {
        const data = await this.loadData(STORAGE_NAME);
        if (data) {
            this.config = { ...this.config, ...data };
        }
    }

    private initSetting() {
        // Token 输入框
        const tokenInput = document.createElement("input");
        tokenInput.type = "password";
        tokenInput.className = "b3-text-field fn__block";
        tokenInput.placeholder = this.i18n.tokenPlaceholder;
        tokenInput.value = this.config.tenantToken;

        // 临时文件夹选择
        const tempFolderContainer = document.createElement("div");
        tempFolderContainer.className = "fn__flex";

        const tempFolderInput = document.createElement("input");
        tempFolderInput.type = "text";
        tempFolderInput.className = "b3-text-field fn__flex-1";
        tempFolderInput.placeholder = this.i18n.tempFolderPlaceholder;
        tempFolderInput.value = this.config.tempFolderName || this.config.tempFolderToken;
        tempFolderInput.readOnly = true;

        const selectTempFolderBtn = document.createElement("button");
        selectTempFolderBtn.className = "b3-button b3-button--outline fn__flex-center";
        selectTempFolderBtn.style.marginLeft = "8px";
        selectTempFolderBtn.textContent = this.i18n.selectFolder;
        selectTempFolderBtn.addEventListener("click", async () => {
            if (!tokenInput.value) {
                showMessage(this.i18n.tokenRequired, 3000, "error");
                return;
            }
            this.config.tenantToken = tokenInput.value;
            await this.showFolderSelector((token, name) => {
                this.config.tempFolderToken = token;
                this.config.tempFolderName = name;
                tempFolderInput.value = name || token;
            });
        });

        tempFolderContainer.appendChild(tempFolderInput);
        tempFolderContainer.appendChild(selectTempFolderBtn);

        this.setting = new Setting({
            confirmCallback: async () => {
                this.config.tenantToken = tokenInput.value;
                await this.saveData(STORAGE_NAME, this.config);
                showMessage(this.i18n.configSaved);
            }
        });

        this.setting.addItem({
            title: this.i18n.tenantToken,
            description: this.i18n.tokenDescription,
            actionElement: tokenInput,
        });

        this.setting.addItem({
            title: this.i18n.tempFolder,
            description: this.i18n.tempFolderDescription,
            actionElement: tempFolderContainer,
        });
    }

    private async handleExport() {
        // 检查配置
        if (!this.config.tenantToken) {
            showMessage(this.i18n.tokenRequired, 3000, "error");
            return;
        }

        if (!this.config.tempFolderToken) {
            showMessage(this.i18n.tempFolderRequired, 3000, "error");
            return;
        }

        // 通过 DOM 查找当前激活的编辑器
        const activePanel = document.querySelector('.layout__center .layout-tab-container > .fn__flex-1:not(.fn__none)');
        const protyleElement = activePanel?.querySelector('.protyle-wysiwyg[data-doc-type]') as HTMLElement;

        if (!protyleElement) {
            showMessage(this.i18n.noDocOpen, 3000, "error");
            return;
        }

        // 从 protyle-title 获取文档 root ID
        const titleElement = activePanel?.querySelector('.protyle-title[data-node-id]') as HTMLElement;
        const firstBlock = protyleElement.querySelector('[data-node-id]') as HTMLElement;
        const rootId = titleElement?.getAttribute('data-node-id') || firstBlock?.getAttribute('data-node-id');

        if (!rootId) {
            showMessage(this.i18n.noDocOpen, 3000, "error");
            return;
        }

        // 获取文档内容（先获取标题用于显示）
        const exportResult = await this.exportMarkdown(rootId);
        if (!exportResult) {
            showMessage(this.i18n.exportFailed, 3000, "error");
            return;
        }

        const { content, title } = exportResult;

        // 弹窗让用户选择目标文件夹
        const targetFolder = await this.selectTargetFolder(title);
        if (!targetFolder) {
            return; // 用户取消
        }

        // 保存用户选择的目标文件夹
        this.config.lastTargetFolderToken = targetFolder.token;
        this.config.lastTargetFolderName = targetFolder.name;
        await this.saveData(STORAGE_NAME, this.config);

        // 开始导出流程
        try {
            // 上传到临时文件夹
            showMessage(this.i18n.uploading, 0, "info", "export-progress");
            const fileToken = await this.uploadToFeishu(content, title + ".md", this.config.tempFolderToken);
            if (!fileToken) {
                showMessage(this.i18n.uploadFailed, 3000, "error", "export-progress");
                return;
            }

            // 创建导入任务（目标是用户选择的文件夹）
            showMessage(this.i18n.importing, 0, "info", "export-progress");
            const ticket = await this.createImportTask(fileToken, title, targetFolder.token);
            if (!ticket) {
                showMessage(this.i18n.importFailed, 3000, "error", "export-progress");
                // 删除临时文件
                await this.deleteFile(fileToken);
                return;
            }

            // 等待导入完成
            const importResult = await this.waitForImportComplete(ticket);

            // 删除临时文件
            await this.deleteFile(fileToken);

            if (importResult) {
                // 保存导出记录
                this.exportRecords.set(rootId, {
                    siyuanId: rootId,
                    feishuFileToken: fileToken,
                    feishuDocToken: importResult.token || "",
                    title: title,
                    exportTime: Date.now(),
                });

                showMessage(this.i18n.exportSuccess.replace("${title}", title), 5000, "info", "export-progress");
            } else {
                showMessage(this.i18n.importFailed, 3000, "error", "export-progress");
            }
        } catch (error) {
            console.error("Export to Feishu failed:", error);
            showMessage(this.i18n.exportError + ": " + error.message, 5000, "error", "export-progress");
        }
    }

    private async selectTargetFolder(docTitle: string): Promise<{ token: string; name: string } | null> {
        return new Promise(async (resolve) => {
            const rootFolder = await this.getRootFolder();
            if (!rootFolder) {
                showMessage(this.i18n.getRootFolderFailed, 3000, "error");
                resolve(null);
                return;
            }

            const dialog = new Dialog({
                title: this.i18n.selectExportFolder,
                content: `<div class="b3-dialog__content">
                    <div class="feishu-export-info">${this.i18n.exportingDoc}: <strong>${docTitle}</strong></div>
                    <div class="feishu-folder-tree" id="feishuFolderTree">
                        <div class="fn__loading"><img src="/stage/loading-pure.svg"></div>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button>
                    <div class="fn__space"></div>
                    <button class="b3-button b3-button--text" id="confirmFolderBtn" disabled>${this.i18n.exportConfirm}</button>
                </div>`,
                width: "520px",
                height: "450px",
            });

            const treeContainer = dialog.element.querySelector("#feishuFolderTree") as HTMLElement;
            const confirmBtn = dialog.element.querySelector("#confirmFolderBtn") as HTMLButtonElement;
            const cancelBtn = dialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;

            let selectedToken = this.config.lastTargetFolderToken || "";
            let selectedName = this.config.lastTargetFolderName || "";

            // 如果有上次选择的目录，预先启用确认按钮
            if (selectedToken) {
                confirmBtn.disabled = false;
            }

            cancelBtn.addEventListener("click", () => {
                dialog.destroy();
                resolve(null);
            });

            confirmBtn.addEventListener("click", () => {
                if (selectedToken) {
                    dialog.destroy();
                    resolve({ token: selectedToken, name: selectedName });
                }
            });

            await this.loadFolderTree(treeContainer, rootFolder.token, rootFolder.name || this.i18n.mySpace, (token, name) => {
                selectedToken = token;
                selectedName = name;
                confirmBtn.disabled = false;
            }, this.config.lastTargetFolderToken);
        });
    }

    private async exportMarkdown(docId: string): Promise<{ content: string; title: string } | null> {
        return new Promise((resolve) => {
            fetchPost("/api/export/exportMdContent", { id: docId }, (response) => {
                if (response.code === 0 && response.data) {
                    const hPath = response.data.hPath as string;
                    const title = hPath.split("/").pop() || "Untitled";
                    resolve({
                        content: response.data.content,
                        title: title,
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    private async uploadToFeishu(content: string, fileName: string, folderToken: string): Promise<string | null> {
        const blob = new Blob([content], { type: "text/markdown" });
        const formData = new FormData();
        formData.append("file_name", fileName);
        formData.append("parent_type", "explorer");
        formData.append("parent_node", folderToken);
        formData.append("size", String(blob.size));
        formData.append("file", blob, fileName);

        try {
            const response = await fetch("https://open.feishu.cn/open-apis/drive/v1/files/upload_all", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.config.tenantToken}`,
                },
                body: formData,
            });

            const result = await response.json();
            if (result.code === 0 && result.data?.file_token) {
                return result.data.file_token;
            } else {
                console.error("Upload failed:", result);
                return null;
            }
        } catch (error) {
            console.error("Upload error:", error);
            return null;
        }
    }

    private async createImportTask(fileToken: string, fileName: string, targetFolderToken: string): Promise<string | null> {
        try {
            const response = await fetch("https://open.feishu.cn/open-apis/drive/v1/import_tasks", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.config.tenantToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    file_extension: "md",
                    file_token: fileToken,
                    type: "docx",
                    file_name: fileName,
                    point: {
                        mount_type: 1,
                        mount_key: targetFolderToken,
                    },
                }),
            });

            const result = await response.json();
            if (result.code === 0 && result.data?.ticket) {
                return result.data.ticket;
            } else {
                console.error("Import task failed:", result);
                return null;
            }
        } catch (error) {
            console.error("Import task error:", error);
            return null;
        }
    }

    private async getImportTaskStatus(ticket: string): Promise<{ status: number; token?: string } | null> {
        try {
            const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/import_tasks/${ticket}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.config.tenantToken}`,
                },
            });

            const result = await response.json();
            if (result.code === 0 && result.data?.result) {
                return {
                    status: result.data.result.job_status,
                    token: result.data.result.token,
                };
            }
            return null;
        } catch (error) {
            console.error("Get import task status error:", error);
            return null;
        }
    }

    private async waitForImportComplete(ticket: string, maxRetries: number = 30): Promise<{ token: string } | null> {
        for (let i = 0; i < maxRetries; i++) {
            const status = await this.getImportTaskStatus(ticket);
            if (!status) {
                return null;
            }

            // job_status: 0 - 初始化, 1 - 处理中, 2 - 成功, 3 - 失败
            if (status.status === 2) {
                return { token: status.token || "" };
            } else if (status.status === 3) {
                return null;
            }

            // 等待 1 秒后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return null;
    }

    private async deleteFile(fileToken: string): Promise<boolean> {
        try {
            const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/files/${fileToken}?type=file`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${this.config.tenantToken}`,
                },
            });

            const result = await response.json();
            return result.code === 0;
        } catch (error) {
            console.error("Delete file error:", error);
            return false;
        }
    }

    private async showFolderSelector(onSelect: (token: string, name: string) => void) {
        const rootFolder = await this.getRootFolder();
        if (!rootFolder) {
            showMessage(this.i18n.getRootFolderFailed, 3000, "error");
            return;
        }

        const dialog = new Dialog({
            title: this.i18n.selectFolder,
            content: `<div class="b3-dialog__content">
                <div class="feishu-folder-tree" id="feishuFolderTree">
                    <div class="fn__loading"><img src="/stage/loading-pure.svg"></div>
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text" id="confirmFolderBtn" disabled>${this.i18n.confirm}</button>
            </div>`,
            width: "520px",
            height: "400px",
        });

        const treeContainer = dialog.element.querySelector("#feishuFolderTree") as HTMLElement;
        const confirmBtn = dialog.element.querySelector("#confirmFolderBtn") as HTMLButtonElement;
        const cancelBtn = dialog.element.querySelector(".b3-button--cancel") as HTMLButtonElement;

        let selectedToken = "";
        let selectedName = "";

        cancelBtn.addEventListener("click", () => dialog.destroy());
        confirmBtn.addEventListener("click", () => {
            if (selectedToken) {
                onSelect(selectedToken, selectedName);
                dialog.destroy();
            }
        });

        await this.loadFolderTree(treeContainer, rootFolder.token, rootFolder.name || this.i18n.mySpace, (token, name) => {
            selectedToken = token;
            selectedName = name;
            confirmBtn.disabled = false;
        });
    }

    private async getRootFolder(): Promise<{ token: string; name?: string } | null> {
        try {
            const response = await fetch("https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.config.tenantToken}`,
                },
            });

            const result = await response.json();
            if (result.code === 0 && result.data?.token) {
                return { token: result.data.token };
            }

            showMessage(`${this.i18n.getRootFolderFailed}: ${result.msg || result.code}`, 5000, "error");
            return null;
        } catch (error) {
            console.error("[ExportToFeishu] Get root folder error:", error);
            showMessage(`${this.i18n.getRootFolderFailed}: ${error.message}`, 5000, "error");
            return null;
        }
    }

    private async getFiles(folderToken: string): Promise<any[]> {
        try {
            const response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/files?folder_token=${folderToken}&page_size=50`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.config.tenantToken}`,
                },
            });

            const result = await response.json();
            if (result.code === 0 && result.data?.files) {
                return result.data.files;
            }
            return [];
        } catch (error) {
            console.error("Get files error:", error);
            return [];
        }
    }

    private async loadFolderTree(
        container: HTMLElement,
        folderToken: string,
        folderName: string,
        onSelect: (token: string, name: string) => void,
        preSelectedToken?: string
    ) {
        container.innerHTML = "";

        const createFolderItem = (token: string, name: string, level: number = 0) => {
            const item = document.createElement("div");
            item.className = "feishu-folder-item";
            item.dataset.token = token;
            item.style.paddingLeft = `${level * 20 + 8}px`;
            item.innerHTML = `
                <span class="feishu-folder-toggle">
                    <svg class="feishu-folder-arrow"><use xlink:href="#iconRight"></use></svg>
                </span>
                <svg class="feishu-folder-icon"><use xlink:href="#iconFolder"></use></svg>
                <span class="feishu-folder-name">${name}</span>
            `;

            // 如果是预选中的文件夹，标记为选中
            if (preSelectedToken && token === preSelectedToken) {
                item.classList.add("feishu-folder-item--selected");
            }

            const toggle = item.querySelector(".feishu-folder-toggle") as HTMLElement;
            const arrow = item.querySelector(".feishu-folder-arrow") as SVGElement;
            let childrenContainer: HTMLElement | null = null;
            let loaded = false;

            item.addEventListener("click", (e) => {
                e.stopPropagation();
                container.querySelectorAll(".feishu-folder-item").forEach(el => el.classList.remove("feishu-folder-item--selected"));
                item.classList.add("feishu-folder-item--selected");
                onSelect(token, name);
            });

            toggle.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!loaded) {
                    const files = await this.getFiles(token);
                    const folders = files.filter(f => f.type === "folder");

                    if (folders.length > 0) {
                        childrenContainer = document.createElement("div");
                        childrenContainer.className = "feishu-folder-children";
                        for (const folder of folders) {
                            const childItem = createFolderItem(folder.token, folder.name, level + 1);
                            childrenContainer.appendChild(childItem);
                        }
                        item.after(childrenContainer);
                    }
                    loaded = true;
                }

                if (childrenContainer) {
                    const isExpanded = arrow.classList.contains("feishu-folder-arrow--expanded");
                    if (isExpanded) {
                        arrow.classList.remove("feishu-folder-arrow--expanded");
                        childrenContainer.style.display = "none";
                    } else {
                        arrow.classList.add("feishu-folder-arrow--expanded");
                        childrenContainer.style.display = "block";
                    }
                }
            });

            return item;
        };

        const rootItem = createFolderItem(folderToken, folderName, 0);
        container.appendChild(rootItem);

        // 自动展开根文件夹
        const toggle = rootItem.querySelector(".feishu-folder-toggle") as HTMLElement;
        toggle.click();
    }
}
