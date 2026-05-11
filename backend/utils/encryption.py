import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return kdf.derive(passphrase.encode())


class Encryptor:
    def __init__(self, key: str):
        # Key should be 32 bytes (base64 encoded) or a passphrase
        try:
            self.key = base64.b64decode(key)
            if len(self.key) != 32:
                raise ValueError("Key must be 32 bytes")
        except Exception:
            # If not base64 32 bytes, treat as passphrase and derive
            self.key = derive_key(key, b"static_salt_for_now") # In prod, use unique salt per field if possible

        self.aesgcm = AESGCM(self.key)

    def encrypt(self, data: str) -> str:
        if not data:
            return ""
        nonce = os.urandom(12)
        ciphertext = self.aesgcm.encrypt(nonce, data.encode(), None)
        return base64.b64encode(nonce + ciphertext).decode()

    def decrypt(self, encrypted_data: str) -> str:
        if not encrypted_data:
            return ""
        try:
            raw = base64.b64decode(encrypted_data)
            nonce = raw[:12]
            ciphertext = raw[12:]
            return self.aesgcm.decrypt(nonce, ciphertext, None).decode()
        except Exception:
            return encrypted_data # Return as is if decryption fails (might be unencrypted)
