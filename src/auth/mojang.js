import { Logger } from '../utils/logger.js';
import { generateOfflineUUID } from '../utils/uuid.js';
import fetch from 'node-fetch';

// Mojang 经典认证端点（已弃用，仅用于兼容）
const MOJANG_AUTH_BASE = 'https://authserver.mojang.com';

export class MojangAuth {
    constructor(options = {}) {
        this.logger = new Logger(options.enableDebug);
        this.options = {
            authBase: options.authBase || MOJANG_AUTH_BASE,
            agentName: options.agentName || 'Minecraft',
            agentVersion: options.agentVersion || 1,
            ...options
        };
        this.accessToken = null;
        this.clientToken = null;
    }

    validateUsername(username) {
        if (typeof username !== 'string') return false;
        if (username.length < 3 || username.length > 16) return false;
        if (/^\d/.test(username)) return false;
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return false;
        const reserved = ['steve', 'alex', 'player', 'minecraft'];
        return !reserved.includes(username.toLowerCase());
    }

    async authenticate(username, password) {
        this.logger.info(`Mojang login attempt for: ${username}`);
        if (!username || !password) {
            throw new Error('Username and password are required for Mojang authentication');
        }
        // 旧式用户名走离线兼容路径（无法真正在线验证）
        if (this.validateUsername(username)) {
            this.logger.warn('Username looks like an offline name; Mojang online auth requires an email. Falling back to offline-style profile.');
            return this._buildOfflineCompatibleProfile(username);
        }
        // 尝试在线认证（端点已弃用，多数情况会失败）
        const response = await fetch(`${this.options.authBase}/authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                agent: { name: this.options.agentName, version: this.options.agentVersion },
                username,
                password,
                requestUser: true
            })
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Mojang authentication failed (${response.status}): ${text || response.statusText}. Mojang accounts have been migrated to Microsoft; please use microsoftLogin instead.`);
        }
        const data = await response.json();
        this.accessToken = data.accessToken;
        this.clientToken = data.clientToken;
        const selected = data.selectedProfile || {};
        const profile = {
            type: 'mojang',
            username: selected.name || username,
            uuid: selected.id || generateOfflineUUID(username),
            displayName: selected.name || username,
            createdAt: new Date().toISOString(),
            properties: selected.properties || [],
            accessToken: data.accessToken,
            clientToken: data.clientToken,
            isLegacy: false,
            isPremium: true
        };
        this.logger.info('Mojang authentication successful', { username: profile.username, uuid: profile.uuid });
        return profile;
    }

    _buildOfflineCompatibleProfile(username) {
        const profile = {
            type: 'mojang',
            username,
            uuid: generateOfflineUUID(username),
            displayName: username,
            createdAt: new Date().toISOString(),
            properties: [],
            accessToken: null,
            clientToken: null,
            isLegacy: true,
            isPremium: false
        };
        this.logger.info('Built offline-compatible Mojang profile', { username });
        return profile;
    }

    async refresh(accessToken, clientToken) {
        this.logger.info('Refreshing Mojang access token');
        const response = await fetch(`${this.options.authBase}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, clientToken, requestUser: true })
        });
        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }
        const data = await response.json();
        this.accessToken = data.accessToken;
        this.clientToken = data.clientToken;
        this.logger.info('Mojang access token refreshed');
        return data;
    }

    async validate(accessToken, clientToken) {
        this.logger.debug('Validating Mojang access token');
        try {
            const response = await fetch(`${this.options.authBase}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken, clientToken })
            });
            return response.ok;
        } catch (error) {
            this.logger.error('Mojang token validation failed', error);
            return false;
        }
    }

    async logout() {
        this.accessToken = null;
        this.clientToken = null;
        this.logger.info('Mojang logout completed');
    }
}

export default MojangAuth;
