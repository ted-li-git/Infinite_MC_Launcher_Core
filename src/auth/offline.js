import { generateOfflineUUID } from '../utils/uuid.js';
import { Logger } from '../utils/logger.js';

export class OfflineAuth {
    constructor() {
        this.logger = new Logger();
    }

    async authenticate(username) {
        this.logger.info(`Authenticating offline user: ${username}`);
        if (!this.validateUsername(username)) {
            throw new Error(`Invalid username: ${username}`);
        }
        const uuid = generateOfflineUUID(username);
        const profile = {
            type: 'offline',
            username,
            uuid,
            displayName: username,
            createdAt: new Date().toISOString(),
            properties: [],
            accessToken: null,
            clientToken: null,
            isLegacy: false,
            isPremium: false
        };
        this.logger.info('Offline authentication successful', { username, uuid });
        return profile;
    }

    validateUsername(username) {
        if (typeof username !== 'string') return false;
        if (username.length < 3 || username.length > 16) return false;
        if (/^\d/.test(username)) return false;
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return false;
        const reservedNames = ['steve', 'alex', 'player', 'minecraft'];
        return !reservedNames.includes(username.toLowerCase());
    }

    async checkUsernameAvailability(username) {
        if (!this.validateUsername(username)) return false;
        this.logger.info(`Username availability check: ${username} -> available`);
        return true;
    }

    generateSkinConfig(options = {}) {
        return {
            skin: {
                type: 'steve', // steve或alex模型
                skinURL: options.skinURL || null,
                capeURL: options.capeURL || null,
                custom: options.custom || false,
                slimArms: options.slimArms || false
            },
            timestamp: new Date().toISOString()
        };
    }

    async createFullProfile(username, options = {}) {
        const profile = await this.authenticate(username);
        profile.skin = this.generateSkinConfig(options);
        profile.gameSettings = {
            language: options.language || 'zh_cn',
            renderDistance: options.renderDistance || 8,
            guiScale: options.guiScale || 0,
            fov: options.fov || 70,
            gamma: options.gamma || 1.0,
            difficulty: options.difficulty || 'normal',
            gameMode: options.gameMode || 'survival'
        };
        profile.permissions = {
            canJoinMultiplayer: options.canJoinMultiplayer !== false,
            canJoinRealms: false, // 离线用户不能加入Realms
            canUseMods: options.canUseMods || false,
            canUseCommands: options.canUseCommands || false
        };
        this.logger.info('Full profile created', { username });
        return profile;
    }

    async loadProfile(profileData) {
        this.logger.info('Loading existing profile', profileData);
        if (profileData.type !== 'offline') {
            throw new Error('Profile is not an offline profile');
        }
        if (!profileData.uuid || typeof profileData.uuid !== 'string') {
            throw new Error('Invalid UUID in profile');
        }
        if (!this.validateUsername(profileData.username)) {
            throw new Error('Invalid username in profile');
        }
        const expectedUUID = generateOfflineUUID(profileData.username);
        if (profileData.uuid !== expectedUUID) {
            this.logger.warn('UUID mismatch, regenerating', {
                provided: profileData.uuid,
                expected: expectedUUID
            });
            profileData.uuid = expectedUUID;
        }
        profileData.lastLoaded = new Date().toISOString();
        this.logger.info('Profile loaded successfully', {
            username: profileData.username,
            uuid: profileData.uuid
        });
        return profileData;
    }

    async batchCreateProfiles(usernames) {
        this.logger.info(`Creating ${usernames.length} offline profiles`);
        const profiles = [];
        for (const username of usernames) {
            try {
                profiles.push(await this.authenticate(username));
            } catch (error) {
                this.logger.warn(`Failed to create profile for ${username}`, error);
            }
        }
        this.logger.info(`Created ${profiles.length} profiles successfully`);
        return profiles;
    }
}
