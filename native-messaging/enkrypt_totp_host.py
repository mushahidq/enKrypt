#!/usr/bin/env python3

import sys
import json
import struct
import logging
import os
import platform
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('enkrypt_totp_host.log'),
        logging.StreamHandler()  # This will also print to console
    ]
)

class BiometricAuth:
    def __init__(self):
        self.system = platform.system()
        self._init_platform_auth()

    def _init_platform_auth(self):
        """Initialize platform-specific biometric authentication"""
        if self.system == "Darwin":  # macOS
            try:
                from LocalAuthentication import (
                    LAContext,
                    LAPolicyDeviceOwnerAuthentication,
                    LAError
                )
                # Initialize context as per Apple's documentation
                self.context = LAContext.alloc().init()
                self.policy = LAPolicyDeviceOwnerAuthentication
                
                # Set up additional options
                self.context.setLocalizedFallbackTitle_("Use Password")  # Optional fallback title
                self.context.setLocalizedCancelTitle_("Cancel")
            except ImportError:
                logging.error("LocalAuthentication framework not available. Install pyobjc-framework-LocalAuthentication")
                sys.exit(1)
        
        elif self.system == "Windows":
            try:
                import ctypes
                from win32security import LogonUser
                self.win32security = ctypes.windll.secur32
            except ImportError:
                logging.error("Windows security modules not available")
                sys.exit(1)
        
        elif self.system == "Linux":
            try:
                import pam
                self.pam = pam.pam()
            except ImportError:
                logging.error("PAM module not available. Install python-pam")
                sys.exit(1)

    def authenticate(self, reason="Authenticate to access TOTP secrets") -> bool:
        """Perform biometric authentication based on platform"""
        try:
            if self.system == "Darwin":
                # Set up context with options
                self.context.setLocalizedCancelTitle_("Cancel")
                self.context.setLocalizedFallbackTitle_("Use Password")
                
                # Check if biometric auth is available
                can_evaluate, error = self.context.canEvaluatePolicy_error_(self.policy, None)
                if not can_evaluate:
                    logging.error(f"Biometric authentication not available: {error}")
                    return False
                
                # Try biometric authentication
                try:
                    # Print available methods for debugging
                    methods = [method for method in dir(self.context) if not method.startswith('_')]
                    logging.debug(f"Available methods: {methods}")
                    
                    import threading
                    auth_event = threading.Event()
                    auth_result = {"success": False, "error": None}

                    def auth_callback(success, error):
                        logging.debug(f"Auth callback - success: {success}, error: {error}")
                        auth_result["success"] = success
                        auth_result["error"] = error
                        auth_event.set()

                    # Use the method as specified in Apple's documentation with a callback
                    self.context.evaluatePolicy_localizedReason_reply_(
                        self.policy,
                        reason,
                        auth_callback
                    )

                    # Wait for the authentication to complete
                    auth_event.wait(timeout=60)  # Wait up to 60 seconds
                    
                    if auth_result["error"]:
                        logging.error(f"Authentication error: {auth_result['error']}")
                        return False
                        
                    logging.debug(f"Final authentication result: {auth_result['success']}")
                    return auth_result["success"]
                except Exception as e:
                    logging.error(f"Authentication failed: {str(e)}")
                    return False

            elif self.system == "Windows":
                try:
                    from win32security import LogonUser
                    # Use Windows Hello through Web Authentication API
                    result = self.win32security.WebAuthNAuthenticatorGetAssertion(
                        None,  # hwnd
                        "enkrypt-totp",  # rpId
                        None,  # clientDataHash
                        None,  # allowCredentialList
                        None,  # extensions
                        0,     # authenticatorAttachment
                        0      # dwFlags
                    )
                    return result == 0
                except Exception as e:
                    logging.error(f"Windows Hello authentication failed: {str(e)}")
                    return False

            elif self.system == "Linux":
                import pwd
                username = pwd.getpwuid(os.getuid())[0]
                return self.pam.authenticate(username, None, service='enkrypt-totp')

            return False

        except Exception as e:
            logging.error(f"Authentication error: {str(e)}")
            return False

class SecureKeyStorage:
    def __init__(self):
        self.data_dir = os.path.expanduser('~/.enkrypt/totp')
        self.key_file = os.path.join(self.data_dir, '.key')
        self._ensure_data_dir()

    def _ensure_data_dir(self):
        """Ensure the data directory exists with proper permissions"""
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        os.chmod(self.data_dir, 0o700)  # Secure directory permissions

    def get_encryption_key(self, auth_token: str) -> bytes:
        """Generate encryption key from authentication token using PBKDF2"""
        salt = os.urandom(16) if not os.path.exists(self.key_file) else self._get_salt()
        
        if not os.path.exists(self.key_file):
            self._save_salt(salt)

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=480000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(auth_token.encode()))
        return key

    def _save_salt(self, salt: bytes):
        """Save salt to file"""
        with open(self.key_file, 'wb') as f:
            f.write(salt)
        os.chmod(self.key_file, 0o600)

    def _get_salt(self) -> bytes:
        """Retrieve salt from file"""
        with open(self.key_file, 'rb') as f:
            return f.read()

class TOTPSecretManager:
    def __init__(self):
        self.data_dir = os.path.expanduser('~/.enkrypt/totp')
        self.secrets_file = os.path.join(self.data_dir, 'secrets.enc')
        self.biometric_auth = BiometricAuth()
        self.key_storage = SecureKeyStorage()
        self._ensure_data_dir()

    def _ensure_data_dir(self):
        """Ensure the data directory exists"""
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        
    def _get_encryption_key(self) -> bytes:
        """Get encryption key after biometric authentication"""
        if not self.biometric_auth.authenticate("Access TOTP secrets"):
            raise Exception("Biometric authentication failed")
        
        # Use device-specific identifier as auth token
        if platform.system() == "Darwin":
            try:
                # Try using system_profiler for hardware UUID
                import subprocess
                result = subprocess.run(['system_profiler', 'SPHardwareDataType'], capture_output=True, text=True)
                for line in result.stdout.split('\n'):
                    if 'Hardware UUID' in line:
                        device_id = line.split(':')[1].strip()
                        break
                else:
                    # Fallback to using a combination of system info
                    import hashlib
                    import socket
                    system_info = (
                        platform.node() +  # Computer name
                        platform.platform() +  # OS details
                        socket.gethostname()  # Host name
                    )
                    device_id = hashlib.sha256(system_info.encode()).hexdigest()
            except Exception as e:
                logging.error(f"Error getting device ID: {e}")
                # Use a fallback device ID
                device_id = "default-device-id"
        elif platform.system() == "Windows":
            import wmi
            c = wmi.WMI()
            device_id = c.Win32_ComputerSystemProduct()[0].UUID
        else:  # Linux
            try:
                with open('/etc/machine-id', 'r') as f:
                    device_id = f.read().strip()
            except:
                # Fallback to using dbus-uuidgen if available
                try:
                    import subprocess
                    device_id = subprocess.check_output(['dbus-uuidgen', '--get']).decode().strip()
                except:
                    # Last resort fallback
                    import hashlib
                    system_info = platform.node() + platform.platform()
                    device_id = hashlib.sha256(system_info.encode()).hexdigest()

        return self.key_storage.get_encryption_key(device_id)

    def save_secret(self, secret: str, wallet_name: str) -> bool:
        """Save encrypted TOTP secret"""
        try:
            logging.info(f"Attempting to save secret for wallet: {wallet_name}")
            
            # First verify we can get the encryption key (requires biometric auth)
            try:
                key = self._get_encryption_key()
            except Exception as e:
                logging.error(f"Failed to get encryption key: {str(e)}")
                return False
                
            # Create Fernet cipher
            fernet = Fernet(key)
            
            # Prepare and encrypt data
            data = {'secret': secret, 'wallet_name': wallet_name}
            encrypted = fernet.encrypt(json.dumps(data).encode())
            
            # Save to file with proper permissions
            try:
                with open(self.secrets_file, 'wb') as f:
                    f.write(encrypted)
                os.chmod(self.secrets_file, 0o600)  # User read/write only
                logging.info("Successfully saved encrypted secret")
                return True
            except IOError as e:
                logging.error(f"Failed to write secret file: {str(e)}")
                return False
                
        except Exception as e:
            logging.error(f"Error saving secret: {str(e)}")
            logging.debug("Stack trace:", exc_info=True)
            return False

    def get_secret(self) -> dict:
        """Retrieve decrypted TOTP secret"""
        try:
            if not os.path.exists(self.secrets_file):
                return {'secret': '', 'wallet_name': ''}
            
            key = self._get_encryption_key()
            fernet = Fernet(key)
            
            with open(self.secrets_file, 'rb') as f:
                encrypted = f.read()
            decrypted = fernet.decrypt(encrypted)
            return json.loads(decrypted)
        except Exception as e:
            logging.error(f"Error reading secret: {str(e)}")
            return {'secret': '', 'wallet_name': ''}

    def delete_secret(self) -> bool:
        """Delete stored TOTP secret"""
        try:
            # Require biometric auth even for deletion
            if not self.biometric_auth.authenticate("Delete TOTP secrets"):
                return False
                
            if os.path.exists(self.secrets_file):
                os.remove(self.secrets_file)
            return True
        except Exception as e:
            logging.error(f"Error deleting secret: {str(e)}")
            return False

class NativeMessagingHost:
    def __init__(self):
        self.secret_manager = TOTPSecretManager()

    def _get_message_size(self) -> int:
        """Read the message size from stdin"""
        try:
            logging.debug("Waiting for message size from stdin...")
            size_data = sys.stdin.buffer.read(4)
            logging.debug(f"Received size data: {size_data!r}")
            if not size_data:
                logging.error("No size data received (EOF)")
                raise EOFError("No data received from stdin")
            size = struct.unpack('I', size_data)[0]
            logging.debug(f"Unpacked message size: {size}")
            return size
        except Exception as e:
            logging.error(f"Error reading message size: {str(e)}")
            raise

    def _read_message(self) -> dict:
        """Read the message from stdin"""
        size = self._get_message_size()
        logging.info(f"Message size: {size}")
        message = sys.stdin.buffer.read(size).decode('utf-8')
        logging.info(f"Received message: {message}")
        return json.loads(message)

    def _send_message(self, message: dict):
        """Send a message to stdout"""
        encoded = json.dumps(message).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('I', len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()

    def _handle_message(self, message: dict) -> dict:
        """Handle incoming messages"""
        method = message.get('method', '')
        params = message.get('params', {})
        
        try:
            if method == 'saveSecret':
                success = self.secret_manager.save_secret(
                    params.get('secret', ''),
                    params.get('walletName', '')
                )
                return {'success': success}
            
            elif method == 'getSecret':
                data = self.secret_manager.get_secret()
                return {'success': True, 'data': data}
            
            elif method == 'deleteSecret':
                success = self.secret_manager.delete_secret()
                return {'success': success}
            
            else:
                logging.warning(f"Unknown method: {method}")
                return {'success': False, 'error': 'Unknown method'}
                
        except Exception as e:
            logging.error(f"Error handling message: {str(e)}")
            return {'success': False, 'error': str(e)}

    def run(self):
        """Main loop to handle native messaging"""
        while True:
            try:
                message = self._read_message()
                logging.info(f"Received message: {message}")
                
                response = self._handle_message(message)
                logging.info(f"Sending response: {response}")
                
                self._send_message(response)
                
            except Exception as e:
                logging.error(f"Error in native messaging host: {str(e)}")
                self._send_message({'success': False, 'error': str(e)})
                if isinstance(e, EOFError):  # Connection closed
                    break

if __name__ == '__main__':
    try:
        logging.info("Starting native messaging host")
        logging.info(f"Python version: {sys.version}")
        logging.info(f"Current working directory: {os.getcwd()}")
        logging.info(f"Script path: {os.path.abspath(__file__)}")
        logging.info(f"Environment: {os.environ}")
        
        host = NativeMessagingHost()
        logging.info("Native messaging host initialized")
        host.run()
    except Exception as e:
        logging.error(f"Fatal error: {str(e)}")
        logging.exception("Detailed error traceback:")
        sys.exit(1)