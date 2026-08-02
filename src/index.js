import { MCLauncher } from './core/launcher.js';
import { OfflineAuth } from './auth/offline.js';
import { MicrosoftAuth } from './auth/microsoft.js';
import { MojangAuth } from './auth/mojang.js';
import { VersionManager } from './game/version.js';
import { AssetManager } from './game/assets.js';

export {
    MCLauncher,
    OfflineAuth,
    MicrosoftAuth,
    MojangAuth,
    VersionManager,
    AssetManager
};

export * from './utils/uuid.js';
export * from './utils/config.js';
export * from './utils/logger.js';
export * from './utils/java.js';

export default MCLauncher;
