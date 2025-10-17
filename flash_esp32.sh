#!/bin/bash

# 🎃 ESP32 Halloween LED Controller - Easy Flash Script
# This script makes flashing your ESP32 super easy!

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ASCII Art
echo -e "${PURPLE}"
echo "👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻"
echo "👻                                                              👻"
echo "👻              SPOOKYGPT ESP32 LED CONTROLLER                  👻"
echo "👻                    Easy Flash Script                         👻"
echo "👻                                                              👻"
echo "👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻👻"
echo -e "${NC}"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if PlatformIO is installed
check_platformio() {
    print_status "Checking PlatformIO installation..."
    
    if command -v pio &> /dev/null; then
        print_success "PlatformIO is already installed!"
        return 0
    else
        print_error "PlatformIO is not installed!"
        print_status "Installing PlatformIO..."
        
        # Install PlatformIO via pip
        if command -v pip3 &> /dev/null; then
            pip3 install platformio
        elif command -v pip &> /dev/null; then
            pip install platformio
        else
            print_error "pip not found! Please install Python and pip first."
            print_status "Visit: https://docs.platformio.org/en/latest/core/installation.html"
            exit 1
        fi
        
        print_success "PlatformIO installed successfully!"
    fi
}

# Check ESP32 platform
check_esp32_platform() {
    print_status "Checking ESP32 platform..."
    
    if pio platform show espressif32 &> /dev/null; then
        print_success "ESP32 platform is ready!"
    else
        print_status "Installing ESP32 platform..."
        pio platform install espressif32
        print_success "ESP32 platform installed!"
    fi
}

# Check required libraries
check_libraries() {
    print_status "Checking required libraries..."
    
    # Check if lib_deps are installed
    if [ -d ".pio/libdeps" ]; then
        print_success "Libraries are already installed!"
    else
        print_status "Installing required libraries..."
        pio lib install
        print_success "Libraries installed!"
    fi
}

# Find ESP32 device
find_esp32_device() {
    print_status "Looking for ESP32 device..."
    
    # Common ESP32 device paths on macOS
    for path in /dev/tty.usbserial-* /dev/tty.usbmodem* /dev/ttyUSB* /dev/cu.usbserial-* /dev/cu.usbmodem*; do
        if [ -e "$path" ]; then
            DEVICE="$path"
            break
        fi
    done
    
    if [ -z "$DEVICE" ]; then
        print_error "No ESP32 device found!"
        print_status "Make sure your ESP32 is connected via USB"
        print_status "Try:"
        print_status "  - Unplugging and reconnecting the ESP32"
        print_status "  - Using a different USB cable"
        print_status "  - Checking if drivers are installed"
        return 1
    fi
    
    print_success "Found ESP32 device: $DEVICE"
    return 0
}

# Build the project
build_project() {
    print_status "Building ESP32 project..."
    
    if pio run; then
        print_success "Build completed successfully!"
        return 0
    else
        print_error "Build failed!"
        print_status "Check the error messages above for details"
        return 1
    fi
}

# Flash ESP32
flash_esp32() {
    print_status "Flashing ESP32..."
    
    # Update upload port in platformio.ini if device was found
    if [ ! -z "$DEVICE" ]; then
        print_status "Updating upload port to: $DEVICE"
        sed -i.bak "s|upload_port = .*|upload_port = $DEVICE|" platformio.ini
    fi
    
    # COMPLETE WIPE AND REBUILD - Nuclear option!
    print_status "🧹 COMPLETE DEVICE WIPE - Erasing all flash memory..."
    pio run --target erase --environment esp32-c3-devkitm-1 --upload-port "$DEVICE"
    
    print_status "🧹 COMPLETE BUILD CLEANUP - Removing all build artifacts..."
    pio run --target clean
    
    print_status "🗑️ Removing build directory completely..."
    rm -rf .pio/build/
    
    print_status "🔨 COMPLETE REBUILD FROM SCRATCH..."
    if pio run --target upload --environment esp32-c3-devkitm-1 --upload-port "$DEVICE"; then
        print_success "ESP32 flashed successfully! 👻✨"
        print_success "Device should now advertise as 'SpookyGPT-LEDs'"
        print_status "Ready to connect with your iOS SpookyGPT app!"
        return 0
    else
        print_error "Failed to flash ESP32."
        print_status "Troubleshooting tips:"
        print_status "  - Make sure ESP32 is connected"
        print_status "  - Try pressing the BOOT button while flashing"
        print_status "  - Check USB cable (use data cable, not just charging)"
        print_status "  - Try different USB port"
        print_status "  - Unplug and replug ESP32, then try again"
        return 1
    fi
}

# Open serial monitor
open_monitor() {
    print_status "Opening serial monitor..."
    print_status "Press Ctrl+C to exit monitor"
    echo ""
    
    # Restore original platformio.ini
    if [ -f "platformio.ini.bak" ]; then
        mv platformio.ini.bak platformio.ini
    fi
    
    pio device monitor --baud 115200
}

# Main function
main() {
    # Check if device path was provided as argument
    if [ $# -eq 1 ]; then
        DEVICE="$1"
        print_status "Using specified device: $DEVICE"
        
        # Verify device exists
        if [ ! -e "$DEVICE" ]; then
            print_error "Device $DEVICE does not exist!"
            exit 1
        fi
    else
        # Auto-detect device
        if ! find_esp32_device; then
            exit 1
        fi
    fi
    
    # Check requirements
    check_platformio
    check_esp32_platform
    check_libraries
    
    # Build project
    if build_project; then
        echo ""
        read -p "Do you want to flash the ESP32 now? (y/n): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if flash_esp32; then
                echo ""
                read -p "Do you want to open the serial monitor? (y/n): " -n 1 -r
                echo ""
                
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    open_monitor
                else
                    print_success "Flash complete! Connect to serial monitor to see debug output."
                fi
            fi
        else
            print_status "Build complete! Run '$0' again to flash when ready."
        fi
    else
        print_error "Build failed. Please fix the errors and try again."
        exit 1
    fi
}

# Run main function
main "$@"