# enKrypt TOTP Native Messaging Host

This native messaging host provides secure storage for TOTP secrets using system biometric authentication.

## Requirements

- Python 3.7 or later
- Chrome/Chromium browser
- System requirements:
  - macOS: TouchID or FaceID capable device
  - Windows: Windows Hello capable device
  - Linux: PAM authentication

## Installation

### macOS and Linux

1. Open terminal in this directory
2. Run the installation script:
   ```bash
   sudo ./install.sh
   ```
3. When prompted, enter your Chrome extension ID

### Windows

1. Open Command Prompt as Administrator
2. Navigate to this directory
3. Run the installation script:
   ```batch
   install.bat
   ```
4. When prompted, enter your Chrome extension ID

## Manual Installation

If you prefer to install manually or the automatic installation fails:

1. Install Python dependencies:
   ```bash
   # macOS
   pip install cryptography pyobjc-framework-LocalAuthentication pyobjc-framework-IOKit

   # Windows
   pip install cryptography pywin32 wmi

   # Linux
   pip install cryptography python-pam
   ```

2. Make the host script executable (Unix-like systems):
   ```bash
   chmod +x enkrypt_totp_host.py
   ```

3. Install the manifest:
   - Windows: Add registry key
   - macOS: Copy to ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
   - Linux: Copy to ~/.config/google-chrome/NativeMessagingHosts/

## Troubleshooting

1. Check the log file at `enkrypt_totp_host.log` for error messages
2. Ensure biometric authentication is enabled on your system
3. Verify Python and required dependencies are installed
4. Check manifest file permissions and location
5. On Windows, verify registry key is correctly set

## Security

- All secrets are encrypted using device-specific keys
- Biometric authentication required for all operations
- Secure storage location with proper permissions
- No plaintext secrets stored on disk
