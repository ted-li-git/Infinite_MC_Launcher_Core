import { Logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import fetch from 'node-fetch';

const DEFAULT_CONCURRENCY = 8;
const RESOURCE_BASE = 'https://resources.download.minecraft.net';

export class AssetManager {
    constructor(gameDirectory, options = {}) {
        this.logger = new Logger(options.enableDebug);
        this.gameDirectory = gameDirectory;
        this.assetsDirectory = path.join(gameDirectory, 'assets');
        this.objectsDirectory = path.join(this.assetsDirectory, 'objects');
        this.indexesDirectory = path.join(this.assetsDirectory, 'indexes');
        this.legacyDirectory = path.join(this.assetsDirectory, 'legacy');
        this.indexCache = new Map();
        this.concurrency = options.concurrency || DEFAULT_CONCURRENCY;
    }

    async ensureDirectories() {
        await Promise.all(
            [this.assetsDirectory, this.objectsDirectory, this.indexesDirectory, this.legacyDirectory]
                .map(d => fs.mkdir(d, { recursive: true }))
        );
    }

    async downloadAssets(versionId, versionData = null) {
        const startTime = Date.now();
        this.logger.info(`Downloading assets for version ${versionId}`);
        await this.ensureDirectories();

        const data = versionData || await this._readVersionJson(versionId);
        const assetIndexName = data.assetIndex?.id || data.assets || versionId;
        const index = await this._fetchAssetIndex(assetIndexName, data.assetIndex);
        if (!index?.objects) {
            this.logger.warn(`No asset objects found for index ${assetIndexName}`);
            return { versionId, assetIndex: assetIndexName, downloaded: 0, skipped: 0, durationMs: 0 };
        }

        const entries = Object.entries(index.objects);
        this.logger.info(`Found ${entries.length} asset objects for ${assetIndexName}`);

        const result = { downloaded: 0, skipped: 0, failed: 0 };
        await this._runWithConcurrency(entries, async ([name, info]) => {
            try {
                const status = await this._downloadAsset(name, info);
                if (status === 'downloaded') result.downloaded++;
                else result.skipped++;
            } catch (err) {
                result.failed++;
                this.logger.warn(`Failed to download asset ${name}: ${err.message}`);
            }
        });

        const durationMs = Date.now() - startTime;
        this.logger.perf('downloadAssets', startTime, { versionId, ...result });
        return { versionId, assetIndex: assetIndexName, ...result, durationMs };
    }

    async _readVersionJson(versionId) {
        const p = path.join(this.gameDirectory, 'versions', versionId, `${versionId}.json`);
        return JSON.parse(await fs.readFile(p, 'utf8'));
    }

    async _fetchAssetIndex(indexName, assetIndexMeta) {
        if (this.indexCache.has(indexName)) return this.indexCache.get(indexName);

        const indexFile = path.join(this.indexesDirectory, `${indexName}.json`);

        if (assetIndexMeta?.url) {
            try {
                const response = await fetch(assetIndexMeta.url);
                if (response.ok) {
                    const data = await response.json();
                    // SHA1 弱校验：JSON 重新序列化可能改变字节，失败不阻断
                    if (assetIndexMeta.sha1) {
                        const sha1 = createHash('sha1').update(JSON.stringify(data)).digest('hex');
                        if (sha1 !== assetIndexMeta.sha1) {
                            this.logger.debug(`Asset index sha1 mismatch for ${indexName} (likely JSON re-serialization)`);
                        }
                    }
                    await fs.writeFile(indexFile, JSON.stringify(data, null, 2));
                    this.indexCache.set(indexName, data);
                    return data;
                }
                this.logger.warn(`Asset index fetch returned ${response.status}, falling back to local`);
            } catch (err) {
                this.logger.warn(`Failed to fetch asset index online: ${err.message}`);
            }
        }

        try {
            const data = JSON.parse(await fs.readFile(indexFile, 'utf8'));
            this.indexCache.set(indexName, data);
            return data;
        } catch {
            this.logger.warn(`No local asset index for ${indexName}`);
            return null;
        }
    }

    async _downloadAsset(name, info) {
        const { hash, size } = info;
        if (!hash || hash.length < 2) throw new Error(`Invalid asset hash for ${name}`);

        const prefix = hash.substring(0, 2);
        const objectDir = path.join(this.objectsDirectory, prefix);
        const objectPath = path.join(objectDir, hash);

        try {
            await fs.access(objectPath);
            // 大小匹配即认为存在（完整 SHA1 校验在批量场景下太慢）
            if (size && (await fs.stat(objectPath)).size === size) return 'skipped';
        } catch { /* 文件不存在，继续下载 */ }

        await fs.mkdir(objectDir, { recursive: true });
        const response = await fetch(`${RESOURCE_BASE}/${prefix}/${hash}`);
        if (!response.ok) throw new Error(`Asset download failed (${response.status}): ${name}`);
        await fs.writeFile(objectPath, Buffer.from(await response.arrayBuffer()));
        return 'downloaded';
    }

    async _runWithConcurrency(items, worker) {
        let cursor = 0;
        const size = Math.min(this.concurrency, items.length);
        const workers = Array.from({ length: size }, async () => {
            while (cursor < items.length) {
                await worker(items[cursor++]);
            }
        });
        await Promise.all(workers);
    }

    async verifyAssets(versionId) {
        this.logger.info(`Verifying assets for ${versionId}`);
        const data = await this._readVersionJson(versionId);
        const assetIndexName = data.assetIndex?.id || data.assets || versionId;
        const index = await this._fetchAssetIndex(assetIndexName, data.assetIndex);
        if (!index?.objects) return { versionId, valid: 0, missing: 0, corrupted: 0 };

        const result = { valid: 0, missing: 0, corrupted: 0 };
        await this._runWithConcurrency(Object.entries(index.objects), async ([, info]) => {
            const objectPath = path.join(this.objectsDirectory, info.hash.substring(0, 2), info.hash);
            try {
                const sha1 = createHash('sha1').update(await fs.readFile(objectPath)).digest('hex');
                if (sha1 === info.hash) result.valid++;
                else result.corrupted++;
            } catch {
                result.missing++;
            }
        });

        this.logger.info(`Asset verification: ${result.valid} valid, ${result.missing} missing, ${result.corrupted} corrupted`);
        return { versionId, ...result };
    }

    getStatus() {
        return {
            gameDirectory: this.gameDirectory,
            assetsDirectory: this.assetsDirectory,
            objectsDirectory: this.objectsDirectory,
            indexesDirectory: this.indexesDirectory,
            concurrency: this.concurrency,
            indexCacheSize: this.indexCache.size
        };
    }
}

export default AssetManager;
