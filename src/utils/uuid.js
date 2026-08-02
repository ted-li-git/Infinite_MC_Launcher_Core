import { createHash, randomBytes } from 'crypto';

// 设置版本位与 RFC 4122 变体位
function setVersionVariant(bytes, version) {
    bytes[6] = (bytes[6] & 0x0f) | (version << 4);
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
}

export function generateOfflineUUID(username) {
    const hash = createHash('md5').update('OfflinePlayer:' + username).digest();
    // 与 Java UUID.nameUUIDFromBytes 一致：版本位=3，变体位=RFC 4122
    setVersionVariant(hash, 3);
    return formatUUID(hash.toString('hex'));
}

export function generateVersion4UUID() {
    const bytes = randomBytes(16);
    setVersionVariant(bytes, 4);
    return formatUUID(bytes.toString('hex'));
}

function nameBasedUUID(namespace, name, algorithm, version) {
    const hash = createHash(algorithm);
    hash.update(namespaceToBytes(namespace));
    hash.update(name);
    const hex = hash.digest('hex');
    return formatUUID(hex.substring(0, 12) + version + hex.substring(13, 16));
}

export function generateVersion3UUID(namespace, name) {
    return nameBasedUUID(namespace, name, 'md5', '3');
}

export function generateVersion5UUID(namespace, name) {
    return nameBasedUUID(namespace, name, 'sha1', '5');
}

export function generateDeterministicUUID(input) {
    const hex = createHash('sha256').update(input).digest('hex').substring(0, 32);
    // 版本位=5
    const v5 = hex.substring(0, 12) + '5' + hex.substring(13, 16);
    // 变体位
    const variant = v5.substring(0, 16) + '8' + v5.substring(17, 20);
    return formatUUID(variant);
}

export function formatUUID(hex) {
    if (hex.length !== 32) {
        throw new Error(`Invalid hex length: expected 32, got ${hex.length}`);
    }
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}

function namespaceToBytes(namespace) {
    const hex = namespace.replace(/-/g, '');
    if (hex.length !== 32) {
        throw new Error(`Invalid namespace UUID: ${namespace}`);
    }
    const bytes = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(uuid) {
    return typeof uuid === 'string' && UUID_PATTERN.test(uuid);
}

export function isValidMinecraftUUID(uuid) {
    if (!isValidUUID(uuid)) return false;
    return /^[0-9a-f]{32}$/i.test(uuid.replace(/-/g, ''));
}

export function toUndashedUUID(uuid) {
    return uuid.replace(/-/g, '').toLowerCase();
}

export function toDashedUUID(undashedUUID) {
    if (undashedUUID.length !== 32) {
        throw new Error(`Invalid undashed UUID length: ${undashedUUID.length}`);
    }
    return formatUUID(undashedUUID.toLowerCase());
}

export function generateMinecraftUUID(username) {
    return generateOfflineUUID(username);
}

export class UUID {
    static offline(username) { return generateOfflineUUID(username); }
    static random() { return generateVersion4UUID(); }
    static validate(uuid) { return isValidUUID(uuid); }
    static toUndashed(uuid) { return toUndashedUUID(uuid); }
    static toDashed(undashedUUID) { return toDashedUUID(undashedUUID); }
}

export const NAMESPACES = {
    DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
    OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
    X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8'
};

export default {
    generateOfflineUUID,
    generateVersion3UUID,
    generateVersion4UUID,
    generateVersion5UUID,
    generateMinecraftUUID,
    generateDeterministicUUID,
    formatUUID,
    isValidUUID,
    isValidMinecraftUUID,
    toUndashedUUID,
    toDashedUUID,
    UUID,
    NAMESPACES
};
