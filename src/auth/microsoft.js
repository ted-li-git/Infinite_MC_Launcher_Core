import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';

export class MicrosoftAuth {
    constructor(options = {}) {
        this.logger = new Logger(options.enableDebug);
        this.options = {
            clientId: options.clientId || '00000000402b5328', // Mojang官方clientId
            redirectUri: options.redirectUri || 'https://login.live.com/oauth20_desktop.srf',
            scope: options.scope || 'XboxLive.signin XboxLive.offline_access',
            apiBase: options.apiBase || 'https://login.microsoftonline.com/consumers',
            xboxApiBase: options.xboxApiBase || 'https://user.auth.xboxlive.com',
            minecraftApiBase: options.minecraftApiBase || 'https://api.minecraftservices.com',
            ...options
        };
        this.authState = null;
        this.deviceCode = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.xboxTokens = null;
        this.minecraftToken = null;
    }

    async _postForm(url, params) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params)
        });
    }

    async _postJson(url, body) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body)
        });
    }

    async startDeviceFlow() {
        this.logger.info('Starting Microsoft device flow');
        const response = await this._postForm(`${this.options.apiBase}/oauth2/v2.0/devicecode`, {
            client_id: this.options.clientId,
            scope: this.options.scope
        });
        if (!response.ok) {
            throw new Error(`Device code request failed: ${response.statusText}`);
        }
        const data = await response.json();
        this.deviceCode = data;
        this.logger.info('Device code obtained', {
            deviceCode: data.device_code,
            expiresIn: data.expires_in
        });
        return {
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            verificationUriComplete: data.verification_uri_complete,
            expiresIn: data.expires_in,
            interval: data.interval
        };
    }

    async checkDeviceAuthorization(deviceCode) {
        this.logger.debug('Checking device authorization status');
        const response = await this._postForm(`${this.options.apiBase}/oauth2/v2.0/token`, {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: this.options.clientId
        });
        if (response.status === 400) {
            const errorData = await response.json();
            if (errorData.error === 'authorization_pending') {
                this.logger.debug('Authorization pending');
                return null;
            }
            throw new Error(`Authorization error: ${errorData.error_description}`);
        }
        if (!response.ok) {
            throw new Error(`Token request failed: ${response.statusText}`);
        }
        const tokenData = await response.json();
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        this.logger.info('Device authorization successful', {
            accessToken: this.accessToken?.substring(0, 20) + '...',
            expiresIn: tokenData.expires_in
        });
        return tokenData;
    }

    async getXboxLiveToken(accessToken) {
        this.logger.info('Getting Xbox Live token');
        const response = await this._postJson(`${this.options.xboxApiBase}/user/authenticate`, {
            Properties: {
                AuthMethod: 'RPS',
                SiteName: 'user.auth.xboxlive.com',
                RpsTicket: `d=${accessToken}`
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        });
        if (!response.ok) {
            throw new Error(`Xbox Live authentication failed: ${response.statusText}`);
        }
        const data = await response.json();
        this.xboxTokens = data;
        this.logger.info('Xbox Live token obtained', {
            userHash: data.DisplayClaims.xui[0].uhs,
            token: data.Token?.substring(0, 20) + '...'
        });
        return data;
    }

    async getXboxServicesToken(xboxToken) {
        this.logger.info('Getting Xbox Services token');
        const response = await this._postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
            Properties: {
                SandboxId: 'RETAIL',
                UserTokens: [xboxToken.Token]
            },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT'
        });
        if (!response.ok) {
            if (response.status === 401) {
                const { XErr } = await response.json();
                if (XErr === 2148916233) throw new Error('Xbox Live account not linked to Microsoft account');
                if (XErr === 2148916235) throw new Error('Xbox Live services not available in your country');
                if (XErr === 2148916236 || XErr === 2148916237) throw new Error('Parental consent required');
            }
            throw new Error(`XSTS authentication failed: ${response.statusText}`);
        }
        const data = await response.json();
        this.logger.info('Xbox Services token obtained', {
            userHash: data.DisplayClaims.xui[0].uhs,
            token: data.Token?.substring(0, 20) + '...'
        });
        return data;
    }

    async getMinecraftToken(xstsToken, userHash) {
        this.logger.info('Getting Minecraft token');
        const response = await this._postJson(`${this.options.minecraftApiBase}/authentication/login_with_xbox`, {
            identityToken: `XBL3.0 x=${userHash};${xstsToken.Token}`
        });
        if (!response.ok) {
            throw new Error(`Minecraft authentication failed: ${response.statusText}`);
        }
        const data = await response.json();
        this.minecraftToken = data.access_token;
        this.logger.info('Minecraft token obtained', {
            accessToken: data.access_token?.substring(0, 20) + '...',
            expiresIn: data.expires_in
        });
        return data;
    }

    async getMinecraftProfile(minecraftToken) {
        this.logger.info('Getting Minecraft profile');
        const response = await fetch(`${this.options.minecraftApiBase}/minecraft/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${minecraftToken}`,
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Profile request failed: ${response.statusText}`);
        }
        const data = await response.json();
        this.logger.info('Minecraft profile obtained', { uuid: data.id, username: data.name });
        return data;
    }

    async authenticate(accessToken = null) {
        this.logger.info('Starting Microsoft authentication');
        if (accessToken) {
            this.accessToken = accessToken;
            this.logger.info('Using provided access token');
        } else {
            const deviceFlow = await this.startDeviceFlow();
            this.logger.info('Please authenticate at:', {
                verificationUri: deviceFlow.verificationUriComplete,
                userCode: deviceFlow.userCode
            });
            let tokenData = null;
            const startTime = Date.now();
            const timeout = deviceFlow.expiresIn * 1000;
            while (!tokenData && (Date.now() - startTime) < timeout) {
                tokenData = await this.checkDeviceAuthorization(deviceFlow.deviceCode);
                if (!tokenData) {
                    await new Promise(resolve => setTimeout(resolve, deviceFlow.interval * 1000));
                }
            }
            if (!tokenData) {
                throw new Error('Device code expired before authorization');
            }
        }
        const xboxLiveToken = await this.getXboxLiveToken(this.accessToken);
        const userHash = xboxLiveToken.DisplayClaims.xui[0].uhs;
        const xstsToken = await this.getXboxServicesToken(xboxLiveToken);
        const minecraftTokenData = await this.getMinecraftToken(xstsToken, userHash);
        const minecraftProfile = await this.getMinecraftProfile(minecraftTokenData.access_token);
        const profile = {
            type: 'microsoft',
            username: minecraftProfile.name,
            uuid: minecraftProfile.id,
            displayName: minecraftProfile.name,
            createdAt: new Date().toISOString(),
            properties: minecraftProfile.properties || [],
            accessToken: minecraftTokenData.access_token,
            refreshToken: this.refreshToken,
            expiresAt: new Date(Date.now() + minecraftTokenData.expires_in * 1000),
            userHash,
            isLegacy: false,
            isPremium: true,
            microsoftTokens: {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                xboxTokens: {
                    xboxLiveToken: xboxLiveToken.Token,
                    xstsToken: xstsToken.Token
                }
            }
        };
        this.logger.info('Microsoft authentication completed successfully', {
            username: profile.username,
            uuid: profile.uuid
        });
        return profile;
    }

    async refreshAccessToken(refreshToken) {
        this.logger.info('Refreshing Microsoft access token');
        const response = await this._postForm(`${this.options.apiBase}/oauth2/v2.0/token`, {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.options.clientId
        });
        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }
        const tokenData = await response.json();
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        this.logger.info('Access token refreshed', { expiresIn: tokenData.expires_in });
        return tokenData;
    }

    async validateToken(accessToken) {
        this.logger.debug('Validating Microsoft access token');
        try {
            const response = await this._postForm(`${this.options.apiBase}/oauth2/v2.0/tokeninfo`, {
                token: accessToken
            });
            if (!response.ok) return false;
            const tokenInfo = await response.json();
            const isValid = tokenInfo.expires_in > 0;
            this.logger.debug('Token validation result', { isValid });
            return isValid;
        } catch (error) {
            this.logger.error('Token validation failed', error);
            return false;
        }
    }

    async logout() {
        this.logger.info('Logging out Microsoft account');
        this.accessToken = null;
        this.refreshToken = null;
        this.xboxTokens = null;
        this.minecraftToken = null;
        this.authState = null;
        this.deviceCode = null;
        this.logger.info('Logout completed');
    }
}
