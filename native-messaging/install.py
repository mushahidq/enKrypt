#!/usr/bin/env python3

import os
import sys
import json
import shutil
import platform
import subprocess
import argparse
from pathlib import Path

def get_chrome_manifest_path():
    """Get the appropriate Chrome manifest path based on the OS"""
    system = platform.system()
    
    if system == "Darwin":  # macOS
        return os.path.expanduser(
            "~/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        )
    elif system == "Linux":
        # Try user-specific first, then system-wide if we have permissions
        user_path = os.path.expanduser("~/.config/google-chrome/NativeMessagingHosts")
        system_path = "/etc/opt/chrome/native-messaging-hosts"
        return user_path if os.access(os.path.dirname(user_path), os.W_OK) else system_path
    elif system == "Windows":
        return None  # Windows uses registry
    else:
        raise Exception(f"Unsupported operating system: {system}")

def get_script_path():
    """Get the absolute path of the native messaging host script"""
    return os.path.abspath(os.path.join(
        os.path.dirname(__file__),
        "enkrypt_totp_host.py"
    ))

def install_dependencies():
    """Install required Python dependencies"""
    system = platform.system()
    
    def run_command(cmd, error_msg=None):
        try:
            subprocess.check_call(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=isinstance(cmd, str))
            return True
        except subprocess.CalledProcessError as e:
            if error_msg:
                print(error_msg)
                if hasattr(e, 'output') and e.output:
                    print(e.output.decode('utf-8'))
            return False

    # Install Homebrew if not present (macOS)
    if system == "Darwin" and not shutil.which('brew'):
        print("Installing Homebrew (package manager for macOS)...")
        brew_cmd = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        if not run_command(brew_cmd, "Failed to install Homebrew"):
            print("Please install Homebrew manually from https://brew.sh and try again.")
            sys.exit(1)

    # Install Rust if not present (required for cryptography)
    if not shutil.which('cargo'):
        print("Installing Rust...")
        rust_cmd = 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y'
        if not run_command(rust_cmd, "Failed to install Rust"):
            print("Please install Rust manually from https://rustup.rs and try again.")
            sys.exit(1)
        # Add Cargo to PATH
        os.environ['PATH'] = f"{os.path.expanduser('~/.cargo/bin')}:{os.environ.get('PATH', '')}"

    # Install OpenSSL on macOS
    if system == "Darwin":
        print("Checking OpenSSL installation...")
        # First try to get openssl prefix without installing
        try:
            openssl_prefix = subprocess.check_output('brew --prefix openssl', shell=True, stderr=subprocess.PIPE).decode('utf-8').strip()
            print(f"OpenSSL found at: {openssl_prefix}")
        except subprocess.CalledProcessError:
            print("OpenSSL not found. Installing via Homebrew...")
            if not run_command('xcode-select --install', "Failed to install Xcode command line tools"):
                print("Please install Xcode command line tools manually and try again.")
                sys.exit(1)
                
            if not run_command('brew update', "Failed to update Homebrew"):
                print("Please check your Homebrew installation.")
                sys.exit(1)
                
            if not run_command('brew install openssl', "Failed to install OpenSSL"):
                print("Please install OpenSSL manually with 'brew install openssl' and try again.")
                sys.exit(1)
                
            openssl_prefix = subprocess.check_output('brew --prefix openssl', shell=True).decode('utf-8').strip()
        
        # Set environment variables for OpenSSL
        os.environ['LDFLAGS'] = f"-L{openssl_prefix}/lib"
        os.environ['CFLAGS'] = f"-I{openssl_prefix}/include"
        os.environ['CPPFLAGS'] = f"-I{openssl_prefix}/include"
        print(f"OpenSSL environment variables set for {openssl_prefix}")

    # Install Python dependencies
    requirements = [
        "cryptography>=3.4.0",
    ]
    
    # Add platform-specific dependencies
    if system == "Darwin":
        requirements.extend([
            "pyobjc-framework-LocalAuthentication>=9.0.0",
            "pyobjc-framework-IOKit>=9.0.0"
        ])
    elif system == "Windows":
        requirements.extend([
            "pywin32>=300; sys_platform == 'win32'",
            "wmi>=1.5.1"
        ])
    elif system == "Linux":
        requirements.extend([
            "python-pam>=2.0.2"
        ])
    
    print("Installing Python dependencies...")
    
    # First upgrade pip and setuptools
    pip_install_cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "pip",
        "setuptools",
        "wheel"
    ]
    
    if not run_command(pip_install_cmd, "Failed to upgrade pip and setuptools"):
        print("Failed to upgrade pip and setuptools. Please check your Python installation.")
        sys.exit(1)
    
    # Try to install cryptography with pre-built wheels first
    print("Installing cryptography with pre-built wheels...")
    crypto_cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--only-binary",
        ":all:",
        "cryptography>=3.4.0"
    ]
    
    if not run_command(crypto_cmd):
        print("Falling back to building cryptography from source...")
        # If pre-built wheels fail, try building from source
        crypto_cmd.remove("--only-binary")
        crypto_cmd.remove(":all:")
        if not run_command(crypto_cmd, "Failed to install cryptography"):
            print("Failed to install cryptography. Please check the error messages above.")
            sys.exit(1)
    
    # Install remaining requirements
    if requirements[1:]:  # If there are requirements other than cryptography
        print("Installing remaining dependencies...")
        pip_install_cmd = [
            sys.executable,
            "-m",
            "pip",
            "install"
        ] + requirements[1:]
        
        if not run_command(pip_install_cmd, "Failed to install remaining dependencies"):
            print("Some dependencies failed to install. The application might not work correctly.")

def create_manifest(extension_id):
    """Create the native messaging host manifest"""
    manifest = {
        "name": "com.enkrypt.totp",
        "description": "enKrypt TOTP Secret Storage",
        "path": get_script_path(),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{extension_id}/"
        ]
    }
    
    return manifest

def install_manifest_windows(manifest_content, extension_id):
    """Install the native messaging host manifest on Windows"""
    import winreg
    
    # Save manifest file
    manifest_path = os.path.join(
        os.path.dirname(get_script_path()),
        "com.enkrypt.totp.json"
    )
    
    with open(manifest_path, 'w') as f:
        json.dump(manifest_content, f, indent=2)
    
    # Add registry key
    registry_key = "Software\\Google\\Chrome\\NativeMessagingHosts\\com.enkrypt.totp"
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, registry_key) as key:
            winreg.SetValue(key, "", winreg.REG_SZ, manifest_path)
        print(f"Registry key added: HKEY_CURRENT_USER\\{registry_key}")
    except Exception as e:
        print(f"Error adding registry key: {e}")
        sys.exit(1)

def install_manifest_unix(manifest_content, manifest_path):
    """Install the native messaging host manifest on Unix-like systems"""
    os.makedirs(manifest_path, exist_ok=True)
    manifest_file = os.path.join(manifest_path, "com.enkrypt.totp.json")
    
    with open(manifest_file, 'w') as f:
        json.dump(manifest_content, f, indent=2)
    
    print(f"Manifest installed at: {manifest_file}")

def set_permissions():
    """Set appropriate permissions for the host script"""
    script_path = get_script_path()
    
    if platform.system() != "Windows":
        # Make script executable
        os.chmod(script_path, 0o755)
        print(f"Set executable permissions for: {script_path}")

def main():
    parser = argparse.ArgumentParser(description="Install enKrypt TOTP native messaging host")
    parser.add_argument(
        "--extension-id",
        required=True,
        help="Chrome extension ID"
    )
    args = parser.parse_args()

    try:
        print("Starting installation of enKrypt TOTP native messaging host...")
        
        # Install Python dependencies
        install_dependencies()
        
        # Create manifest
        manifest_content = create_manifest(args.extension_id)
        
        # Install manifest based on platform
        system = platform.system()
        if system == "Windows":
            install_manifest_windows(manifest_content, args.extension_id)
        else:
            manifest_path = get_chrome_manifest_path()
            install_manifest_unix(manifest_content, manifest_path)
        
        # Set permissions
        set_permissions()
        
        print("\nInstallation completed successfully!")
        print("\nNOTE: If you're using a different Chromium-based browser,")
        print("you may need to copy the manifest file to the appropriate location.")
        
    except Exception as e:
        print(f"\nError during installation: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
