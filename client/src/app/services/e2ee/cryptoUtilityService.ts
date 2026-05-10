import { Injectable } from '@angular/core';
import { E2EEError, E2EEErrorCode } from './e2eeError';

/**
 * Branded Type: Đại diện cho một chuỗi đã được mã hóa Base64.
 * - Giúp TypeScript phân biệt được chuỗi Base64 với chuỗi văn bản thông thường (string).
 * - Ngăn chặn lỗi truyền nhầm dữ liệu chưa mã hóa vào các hàm yêu cầu mật mã.
 * - Lưu ý: Nhãn `__brand` chỉ tồn tại trong lúc code (compile-time), không tồn tại khi chạy (runtime).
 */
export type Base64String = string & { readonly __brand: 'Base64String' };

@Injectable({
    providedIn: 'root',
})
export class CryptoUtilityService {
    constructor() {
        // test
        if (typeof window !== 'undefined') (window as any).TestCryptoUtilityService = this;
    }

    stringToArrayBuffer(str: string): ArrayBuffer {
        return new TextEncoder().encode(str).buffer;
    }

    arrayBufferToString(buf: ArrayBuffer) {
        return new TextDecoder().decode(buf);
    }

    arrayBufferToBase64(buf: ArrayBuffer): Base64String {
        const bytes = new Uint8Array(buf);
        const length = bytes.length;
        let binaryString = '';

        for (let i = 0; i < length; i++) {
            // map các số từ 0-255 sang bảng mã latin 1
            binaryString += String.fromCharCode(bytes[i]);
        }

        return window.btoa(binaryString) as Base64String;
    }

    base64ToArrayBuffer(base64: Base64String): ArrayBuffer {
        const binaryString = window.atob(base64);
        const length = binaryString.length;
        const bytes = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            // charCodeAt(i) lấy giá trị nhị phân của ký tự tại vị trí i
            bytes[i] = binaryString.charCodeAt(i);
        }

        return bytes.buffer;
    }

    async generateRandomSalt() {
        return window.crypto.getRandomValues(new Uint8Array(16));
    }

    async generateRandomIV() {
        return window.crypto.getRandomValues(new Uint8Array(12));
    }

    async generateIdentityKeyPair() {
        try {
            const algorithms: RsaHashedKeyGenParams = {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]), // [1,0,1] hệ 256 = 65537 hệ 10
                hash: 'SHA-256',
            };

            const { publicKey, privateKey } = await window.crypto.subtle.generateKey(
                algorithms, // algorithms
                true, // extractable
                ['wrapKey', 'unwrapKey'], // key usages
            );

            const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', publicKey);
            const publicKeyBase64 = this.arrayBufferToBase64(publicKeyBuffer);

            return {
                publicKeyBase64,
                privateKeyObj: privateKey,
            };
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.SETUP_FAILED, undefined, error);
        }
    }

    async importPublicKey(publickeyBase64: Base64String) {
        try {
            const publicKeyBuffer = this.base64ToArrayBuffer(publickeyBase64);
            let algorithm: RsaHashedImportParams = {
                name: 'RSA-OAEP',
                hash: 'SHA-256',
            };

            return await window.crypto.subtle.importKey('spki', publicKeyBuffer, algorithm, true, [
                'wrapKey',
            ]);
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.INVALID_KEY, undefined, error);
        }
    }

    async generateSharedKey(): Promise<CryptoKey> {
        try {
            const algorithms: AesKeyGenParams = {
                name: 'AES-GCM',
                length: 256,
            };
            return await window.crypto.subtle.generateKey(algorithms, true, ['encrypt', 'decrypt']);
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.SETUP_FAILED, undefined, error);
        }
    }

    async deriveKEKFromPIN(pin: string, saltBuffer: ArrayBuffer): Promise<CryptoKey> {
        try {
            const pinBuffer = this.stringToArrayBuffer(pin);

            const algorithms: Pbkdf2Params = {
                name: 'PBKDF2',
                iterations: 100000,
                hash: 'SHA-256',
                salt: saltBuffer,
            };

            const baseKey: CryptoKey = await window.crypto.subtle.importKey(
                'raw',
                pinBuffer,
                { name: 'PBKDF2' },
                false,
                ['deriveKey'],
            );

            const derivedKeyType: AesDerivedKeyParams = {
                name: 'AES-GCM',
                length: 256,
            };

            return await window.crypto.subtle.deriveKey(
                algorithms,
                baseKey,
                derivedKeyType,
                false, // extractable
                ['wrapKey', 'unwrapKey'],
            );
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.SETUP_FAILED, undefined, error);
        }
    }

    async encryptData(
        plaintext: string,
        key: CryptoKey,
    ): Promise<{
        ciphertext: Base64String;
        iv: Base64String;
    }> {
        try {
            const ivBuffer = window.crypto.getRandomValues(new Uint8Array(12)).buffer;
            const data = this.stringToArrayBuffer(plaintext);

            const algorithms: AesGcmParams = {
                name: 'AES-GCM',
                iv: ivBuffer,
            };

            const ciphertext = await window.crypto.subtle.encrypt(algorithms, key, data);

            return {
                ciphertext: this.arrayBufferToBase64(ciphertext),
                iv: this.arrayBufferToBase64(ivBuffer),
            };
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.ENCRYPTION_FAILED, undefined, error);
        }
    }

    async decryptData(ciphertext: Base64String, iv: Base64String, key: CryptoKey): Promise<string> {
        try {
            const ivBuffer = this.base64ToArrayBuffer(iv);
            const algorithms: AesGcmParams = { name: 'AES-GCM', iv: ivBuffer };
            const ciphertextBuffer = this.base64ToArrayBuffer(ciphertext);

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                algorithms,
                key,
                ciphertextBuffer,
            );

            return this.arrayBufferToString(decryptedBuffer);
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.DECRYPTION_FAILED, undefined, error);
        }
    }

    async wrapKey(
        key: CryptoKey,
        wrappingKey: CryptoKey,
    ): Promise<{
        wrappedKey: Base64String;
        iv: Base64String | undefined;
    }> {
        try {
            const algoName = wrappingKey.algorithm.name;
            let wrapAlgorithm: AesGcmParams | RsaOaepParams;
            let ivBuffer: ArrayBuffer | undefined;

            if (algoName === 'AES-GCM') {
                ivBuffer = window.crypto.getRandomValues(new Uint8Array(12)).buffer;
                wrapAlgorithm = { name: 'AES-GCM', iv: ivBuffer };
            } else wrapAlgorithm = { name: 'RSA-OAEP' };

            const wrappedKeyBuffer = await window.crypto.subtle.wrapKey(
                'jwk',
                key,
                wrappingKey,
                wrapAlgorithm,
            );

            return {
                wrappedKey: this.arrayBufferToBase64(wrappedKeyBuffer),
                iv: ivBuffer ? this.arrayBufferToBase64(ivBuffer) : undefined,
            };
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.ENCRYPTION_FAILED, undefined, error);
        }
    }

    async unwrapKey(
        wrappedKey: Base64String,
        unwrappingKey: CryptoKey,
        iv?: Base64String,
    ): Promise<CryptoKey> {
        try {
            const wrappedKeyBuffer = this.base64ToArrayBuffer(wrappedKey);
            const algoName = unwrappingKey.algorithm.name;

            let unwrapAlgorithm: RsaOaepParams | AesGcmParams; // thuật toán để unwrap
            let usages: KeyUsage[];
            let unwrappedKeyAlgorithm: RsaHashedImportParams | AesKeyAlgorithm; // cấu hình của key sẽ được unwrap
            if (algoName === 'AES-GCM' && iv) {
                // TH1: unwrap private key
                unwrapAlgorithm = {
                    name: algoName,
                    iv: this.base64ToArrayBuffer(iv),
                };
                unwrappedKeyAlgorithm = {
                    name: 'RSA-OAEP',
                    hash: 'SHA-256',
                };
                usages = ['unwrapKey'];
            } else {
                // TH2: unwrap shared key
                unwrapAlgorithm = {
                    name: algoName,
                };
                unwrappedKeyAlgorithm = {
                    name: 'AES-GCM',
                    length: 256,
                };
                usages = ['encrypt', 'decrypt'];
            }

            return await window.crypto.subtle.unwrapKey(
                'jwk',
                wrappedKeyBuffer,
                unwrappingKey,
                unwrapAlgorithm,
                unwrappedKeyAlgorithm,
                true, // extractable
                usages,
            );
        } catch (error) {
            throw new E2EEError(E2EEErrorCode.DECRYPTION_FAILED, undefined, error);
        }
    }

    async hashString(str: string) {
        const buffer = this.stringToArrayBuffer(str);
        const hashBuffer = await window.crypto.subtle.digest({ name: 'SHA-256' }, buffer);
        return this.arrayBufferToBase64(hashBuffer);
    }
}

/** Test console trình duyệt
const {publicKey, privateKey} = await TestCryptoUtilityService.generateIdentityKeyPair()
const pin = 180205
const saltBuffer = crypto.getRandomValues(new Uint8Array(16)).buffer
const kek = await TestCryptoUtilityService.deriveKEKFromPIN(pin, saltBuffer)
const sharedKey = await TestCryptoUtilityService.generateSharedKey()
let wrappedObject = await TestCryptoUtilityService.wrapKey(sharedKey, publicKey)
const wrappedSharedKey = wrappedObject.wrappedKey
wrappedObject = await TestCryptoUtilityService.wrapKey(privateKey, kek)
const wrappedPrivateKey = wrappedObject.wrappedKey
const kekIV = wrappedObject.iv
const unwrappedPrivateKey = await TestCryptoUtilityService.unwrapKey(wrappedPrivateKey, kek, kekIV)
unwrappedPrivateKey
privateKey
const unwrappedSharedKey = await TestCryptoUtilityService.unwrapKey(wrappedSharedKey, unwrappedPrivateKey)
unwrappedSharedKey
sharedKey
 */
