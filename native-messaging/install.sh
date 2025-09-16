#!/bin/bash

# Ensure script is run with sudo on Unix-like systems
if [[ "$OSTYPE" != "win"* ]]; then
    if [ "$EUID" -ne 0 ]; then
        echo "Please run with sudo for system-wide installation"
        exit 1
    fi
fi

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
