import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';

// 内置预设站（方便用户快速接入）
export const PRESET_SITES = {
    littleskin: {
        name: 'LittleSkin',
        authBase: 'https://mcskin.littleservice.cn/api/yggdrasil',
        profileBase: 'https://mcskin.littleservice.cn/api/yggdrasil'
    },
    blessskin: {
        name: 'Blessing Skin 官方示例站',
        authBase: 'https://skin.prinzeugen.net/api/yggdrasil',
        profileBase: 'https://skin.prinzeugen.net/api/yggdrasil'
    },
    unionpass: {
        name: '统一通行证 (UniAuth)',
        authBase: 'https://auth.mc-user.com:233',
        profileBase: 'https://auth.mc-user.com:233'
    }
};

/**
 * 第三方 Yggdrasil 认证（LittleSkin、BlessingSkin 等皮肤站/自助验证服务器通用）
 *
 * 支持的 API 模式：
 *   1. 密码登录（账号密码 -> accessToken）
 *   2. 已有 token 直接刷新 / 获取 profile
 *   3. 自定义站点任意组合（authBase / profileBase 独立配置）
 */
export class ThirdPartyAuth {
    constructor(options = {}) {
        this.logger = new Logger(options.enableDebug);
        let site = null;
        if (options.preset) {
            site = PRESET_SITES[options.preset.toLowerCase()];
            if (!site) throw new Error(`Unknown preset: ${options.preset}. Available: ${Object.keys(PRESET_SITES).join(', ')}`);
        }
        this.options = {
            preset: options.preset || null,
            siteName: site?.name || options.siteName || 'Third Party Yggdrasil',
            authBase: site?.authBase || options.authBase,
            profileBase: site?.profileBase || options.profileBase || site?.authBase || options.authBase,
            agentName: options.agentName || 'Minecraft',
            agentVersion: options.agentVersion || 1,
            ...options
        };
        if (!this.options.authBase) {
            throw new Error('Either preset or authBase is required for ThirdPartyAuth');
        }
        this.accessToken = null;
        this.clientToken = options.clientToken || this._randomClientToken();
    }

    _randomClientToken() {
        // 生成 32 位十六进制 clientToken（与 Minecraft 启动器惯例一致）
        const bytes = new Uint8Array(16);
        if (globalThis.crypto?.getRandomValues) {
            globalThis.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async _postJson(url, body) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    /**
     * 统一接口：
     *  authenticate({ username, password })  —— 用账密登录
     *  authenticate({ accessToken })          —— 用已有 accessToken 直接拉 profile
     */
    async authenticate(credentialOrToken) {
        if (!credentialOrToken || typeof credentialOrToken !== 'object') {
            throw new Error('ThirdPartyAuth.authenticate requires an argument: {username,password} or {accessToken}');
        }

        if (credentialOrToken.accessToken && !credentialOrToken.username) {
            return this._authWithToken(credentialOrToken.accessToken, credentialOrToken.clientToken);
        }
        return this._authWithPassword(credentialOrToken.username, credentialOrToken.password);
    }

    async _authWithPassword(username, password) {
        if (!username || !password) {
            throw new Error('username and password are required for password-based third-party login');
        }
        this.logger.info(`${this.options.siteName} password login: ${username}`);

        const resp = await this._postJson(`${this.options.authBase}/authserver/authenticate`, {
            agent: { name: this.options.agentName, version: this.options.agentVersion },
            username,
            password,
            clientToken: this.clientToken,
            requestUser: true
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`${this.options.siteName} authentication failed (${resp.status}): ${txt || resp.statusText}`);
        }
        const data = await resp.json();
        this.accessToken = data.accessToken;
        this.clientToken = data.clientToken || this.clientToken;
        const selected = data.selectedProfile || (data.availableProfiles && data.availableProfiles[0]) || null;
        if (!selected) {
            throw new Error(`${this.options.siteName} account has no linked game profile. Please create one on the skin site first.`);
        }
        const profile = await this._buildProfile(selected, data.user);
        this.logger.info(`${this.options.siteName} password login OK`, { username: profile.username, uuid: profile.uuid });
        return profile;
    }

    async _authWithToken(accessToken, clientToken) {
        this.logger.info(`${this.options.siteName} token-based login`);
        this.accessToken = accessToken;
        if (clientToken) this.clientToken = clientToken;

        // 优先用 validate 检查 token 有效性；失败抛错（调用方决定是否 refresh）
        const valid = await this.validate(accessToken, this.clientToken);
        if (!valid) {
            throw new Error(`${this.options.siteName} accessToken is invalid or expired`);
        }

        // 尝试拉完整 profile（含皮肤/披风）：UUID 来自 /sessionserver/session/minecraft/profile
        let profileInfo = null;
        try {
            // 先从 refresh 拿 selectedProfile UUID；拿不到再 try sessionserver 的 profileByToken 端点
            const refreshed = await this._safeRefresh(accessToken, this.clientToken);
            if (refreshed && refreshed.selectedProfile) {
                profileInfo = await this._fetchFullProfile(refreshed.selectedProfile.id);
            }
        } catch (e) {
            this.logger.debug('Refresh-based profile lookup skipped:', e.message);
        }

        if (!profileInfo) {
            // 某些皮肤站提供 /authserver/validate 直接返回 user，但没有 sessionserver 接口
            // 这时降级：用 refresh 拿到的 selectedProfile 作为最小信息
            throw new Error(`Cannot get profile from ${this.options.siteName}. Try password login to ensure account has a profile.`);
        }
        const profile = this._profileFromSession(profileInfo);
        this.logger.info(`${this.options.siteName} token login OK`, { username: profile.username });
        return profile;
    }

    async _safeRefresh(accessToken, clientToken) {
        try {
            const resp = await this._postJson(`${this.options.authBase}/authserver/refresh`, {
                accessToken,
                clientToken,
                requestUser: true,
                selectedProfile: null
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            this.accessToken = data.accessToken || accessToken;
            return data;
        } catch { return null; }
    }

    async _fetchFullProfile(uuid) {
        // sessionserver 端点：/sessionserver/session/minecraft/profile/<uuid>
        const url = `${this.options.profileBase}/sessionserver/session/minecraft/profile/${uuid}?unsigned=false`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) return null;
        return resp.json();
    }

    _profileFromSession(sessionProfile) {
        const propertiesRaw = sessionProfile.properties?.[0]?.value;
        let textures = null;
        if (propertiesRaw) {
            try { textures = JSON.parse(Buffer.from(propertiesRaw, 'base64').toString('utf-8')); }
            catch { textures = null; }
        }
        return {
            type: 'third-party',
            preset: this.options.preset,
            siteName: this.options.siteName,
            authBase: this.options.authBase,
            profileBase: this.options.profileBase,
            username: sessionProfile.name,
            uuid: sessionProfile.id,
            displayName: sessionProfile.name,
            createdAt: new Date().toISOString(),
            properties: sessionProfile.properties || [],
            textures,
            accessToken: this.accessToken,
            clientToken: this.clientToken,
            isLegacy: false,
            isPremium: true
        };
    }

    async _buildProfile(selectedProfile, user) {
        // password auth 路径：selectedProfile 仅含 id+name，皮肤属性需要从 sessionserver 取
        const full = await this._fetchFullProfile(selectedProfile.id);
        if (full) return this._profileFromSession(full);
        // 最小 fallback（极少数站点没开 sessionserver）
        return {
            type: 'third-party',
            preset: this.options.preset,
            siteName: this.options.siteName,
            authBase: this.options.authBase,
            profileBase: this.options.profileBase,
            username: selectedProfile.name,
            uuid: selectedProfile.id,
            displayName: selectedProfile.name,
            createdAt: new Date().toISOString(),
            properties: [],
            textures: null,
            accessToken: this.accessToken,
            clientToken: this.clientToken,
            user: user || null,
            isLegacy: false,
            isPremium: true
        };
    }

    async validate(accessToken, clientToken) {
        this.logger.debug(`Validating ${this.options.siteName} token`);
        try {
            const body = { accessToken };
            if (clientToken) body.clientToken = clientToken;
            const resp = await this._postJson(`${this.options.authBase}/authserver/validate`, body);
            return resp.ok;
        } catch (e) {
            this.logger.error('Third party validate failed:', e.message);
            return false;
        }
    }

    async refresh(accessToken, clientToken) {
        this.logger.info(`Refreshing ${this.options.siteName} token`);
        const resp = await this._postJson(`${this.options.authBase}/authserver/refresh`, {
            accessToken,
            clientToken,
            requestUser: true
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`${this.options.siteName} refresh failed (${resp.status}): ${txt || resp.statusText}`);
        }
        const data = await resp.json();
        this.accessToken = data.accessToken;
        this.clientToken = data.clientToken || this.clientToken;
        this.logger.info(`${this.options.siteName} token refreshed`);
        return data;
    }

    async signout(username, password) {
        this.logger.info(`Signing out ${username} from ${this.options.siteName}`);
        const resp = await this._postJson(`${this.options.authBase}/authserver/signout`, {
            username, password
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`${this.options.siteName} signout failed (${resp.status}): ${txt || resp.statusText}`);
        }
        this.accessToken = null;
        this.logger.info(`${this.options.siteName} account signed out (invalidated all tokens)`);
        return true;
    }

    async invalidate(accessToken, clientToken) {
        this.logger.info(`Invalidating ${this.options.siteName} token`);
        const resp = await this._postJson(`${this.options.authBase}/authserver/invalidate`, {
            accessToken, clientToken
        });
        this.accessToken = null;
        return resp.ok;
    }

    async logout() {
        this.accessToken = null;
        this.logger.info(`${this.options.siteName} local logout completed`);
    }
}

export default ThirdPartyAuth;
