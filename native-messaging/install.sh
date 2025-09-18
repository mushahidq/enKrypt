#!/bin/bash

# Note: Do not require sudo by default. The Python installer performs user-scoped
# installs when appropriate and writes the Chrome manifest to the user location
# on macOS/Linux. If a system-wide install is desired on Linux, re-run this with sudo.

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Please install Python 3 and try again."
    exit 1
fi

# Get the extension ID from environment or prompt
if [ -z "$EXTENSION_ID" ]; then
    read -p "Enter your Chrome extension ID: " EXTENSION_ID
    if [ -z "$EXTENSION_ID" ]; then
        echo "Error: Chrome extension ID is required"
        exit 1
    fi
fi

# Make Python script executable
chmod +x "$(dirname "$0")/install.py"
chmod +x "$(dirname "$0")/enkrypt_totp_host.py"

# Run Python installation script with full path to ensure we're using the correct Python
"$(which python3)" "$(dirname "$0")/install.py" --extension-id "$EXTENSION_ID"

# Check if installation was successful
if [ $? -ne 0 ]; then
    echo "Installation failed. Please check the error messages above."
    exit 1
fi

echo "Installation completed successfully!"
