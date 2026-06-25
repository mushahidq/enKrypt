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

def verify_python_version():
    """Verify Python version is 3.7 or later"""
    if sys.version_info < (3, 7):
        raise Exception("Python 3.7 or later is required")

def run_pip_install(package, use_sudo=False):
    """Run pip install with proper command and error handling"""
    cmd = []
    if use_sudo:
        cmd.extend(["sudo", "-H"])  # -H flag sets HOME properly for sudo
    
    # Try pip3 first, then fall back to pip if needed
    for pip_cmd in ["pip3", "pip"]:
        try:
            full_cmd = cmd + [pip_cmd, "install", "--user", package] if not use_sudo else cmd + [pip_cmd, "install", package]
            subprocess.check_call(full_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return True
        except subprocess.CalledProcessError:
            continue
    return False

def install_package(package):
    """Install a single Python package"""
    print(f"Installing {package}...")
    
    # Try without sudo first
    if run_pip_install(package):
        return True
        
    print("Trying with sudo (you may be prompted for password)...")
    if run_pip_install(package, use_sudo=True):
        return True
        
    raise Exception(f"Failed to install {package}")

def install_dependencies():
    """Install required Python dependencies"""
    system = platform.system()
    
    # Base requirements
    base_requirements = [
        "cryptography>=35.0.0",
    ]
    
    # Platform-specific requirements
    platform_requirements = {
        "Darwin": [
            "pyobjc-framework-LocalAuthentication>=9.0.1",
            "pyobjc-framework-Cocoa>=9.0.1",  # Required for IOKit
            "pyobjc-core>=9.0.1"  # Base requirement for all pyobjc packages
        ],
        "Windows": [
            "pywin32>=305",
            "wmi>=1.5.1"
        ],
        "Linux": [
            "python-pam>=2.0.2"
        ]
    }
    
    # Get requirements for current platform
    requirements = base_requirements + platform_requirements.get(system, [])
    
    print(f"\nInstalling dependencies for {system}...")
    for requirement in requirements:
        try:
            install_package(requirement)
            print(f"✓ Successfully installed {requirement}")
        except Exception as e:
            print(f"✗ Failed to install {requirement}: {e}")
            sys.exit(1)
    
    # Verify installations
    print("\nVerifying installations...")
    if system == "Darwin":
        try:
            import LocalAuthentication
            from Foundation import NSBundle
            print("✓ Successfully verified macOS dependencies")
        except ImportError as e:
            print(f"✗ Failed to verify macOS dependencies: {e}")
            sys.exit(1)
    elif system == "Windows":
        try:
            import win32security
            import wmi
            print("✓ Successfully verified Windows dependencies")
        except ImportError as e:
            print(f"✗ Failed to verify Windows dependencies: {e}")
            sys.exit(1)
    elif system == "Linux":
        try:
            import pam
            print("✓ Successfully verified Linux dependencies")
        except ImportError as e:
            print(f"✗ Failed to verify Linux dependencies: {e}")
            sys.exit(1)

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
        print(f"✓ Registry key added: HKEY_CURRENT_USER\\{registry_key}")
    except Exception as e:
        print(f"✗ Error adding registry key: {e}")
        sys.exit(1)

def install_manifest_unix(manifest_content, manifest_path):
    """Install the native messaging host manifest on Unix-like systems"""
    try:
        os.makedirs(manifest_path, exist_ok=True)
        manifest_file = os.path.join(manifest_path, "com.enkrypt.totp.json")
        
        with open(manifest_file, 'w') as f:
            json.dump(manifest_content, f, indent=2)
        
        print(f"✓ Manifest installed at: {manifest_file}")
    except Exception as e:
        print(f"✗ Error installing manifest: {e}")
        sys.exit(1)

def set_permissions():
    """Set appropriate permissions for the host script"""
    script_path = get_script_path()
    
    if platform.system() != "Windows":
        try:
            # Make script executable
            os.chmod(script_path, 0o755)
            print(f"✓ Set executable permissions for: {script_path}")
        except Exception as e:
            print(f"✗ Error setting permissions: {e}")
            sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="Install enKrypt TOTP native messaging host",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --extension-id abcdef1234567890
  sudo %(prog)s --extension-id abcdef1234567890  # for system-wide installation
        """
    )
    parser.add_argument(
        "--extension-id",
        required=True,
        help="Chrome extension ID"
    )
    args = parser.parse_args()

    try:
        print("\n=== enKrypt TOTP Native Messaging Host Installation ===\n")
        
        # Verify Python version
        verify_python_version()
        print("✓ Python version verified")
        
        # Install Python dependencies
        install_dependencies()
        
        # Create manifest
        manifest_content = create_manifest(args.extension_id)
        print("✓ Manifest created")
        
        # Install manifest based on platform
        system = platform.system()
        if system == "Windows":
            install_manifest_windows(manifest_content, args.extension_id)
        else:
            manifest_path = get_chrome_manifest_path()
            install_manifest_unix(manifest_content, manifest_path)
        
        # Set permissions
        set_permissions()
        
        print("\n✅ Installation completed successfully!")
        print("\nNOTE: If you're using a different Chromium-based browser,")
        print("you may need to copy the manifest file to the appropriate location.")
        
    except Exception as e:
        print(f"\n❌ Error during installation: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()