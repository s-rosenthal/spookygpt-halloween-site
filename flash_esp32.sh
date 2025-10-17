#!/bin/bash

# 🎃 Halloween ESP32 LED Controller - Easy Flash Script
# This script automates building and flashing your ESP32-C3

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
echo "🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃"
echo "🎃                                                              🎃"
echo "🎃           HALLOWEEN ESP32 LED CONTROLLER                     🎃"
echo "🎃                    Easy Flash Script                         🎃"
echo "🎃                                                              🎃"
echo "🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃"
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
    if ! command -v pio &> /dev/null; then
        print_error "PlatformIO is not installed!"
        print_status "Installing PlatformIO via Homebrew..."
        brew install platformio
        print_success "PlatformIO installed successfully!"
    else
        print_success "PlatformIO is already installed!"
    fi
}

# Check if ESP32 platform is installed
check_esp32_platform() {
    print_status "Checking ESP32 platform..."
    if ! pio platform show espressif32 &> /dev/null; then
        print_status "Installing ESP32 platform..."
        pio platform install espressif32
        print_success "ESP32 platform installed!"
    else
        print_success "ESP32 platform is ready!"
    fi
}

# Check if required libraries are installed
check_libraries() {
    print_status "Checking required libraries..."
    
    # Check if libraries are already installed
    if [ -d ".pio/libdeps" ]; then
        print_success "Libraries are already installed!"
        return
    fi
    
    print_status "Installing required libraries..."
    pio lib install "fastled/FastLED@^3.6.0" "bblanchon/ArduinoJson@^6.21.3"
    print_success "Libraries installed successfully!"
}

# Build the project
build_project() {
    print_status "Building ESP32 project..."
    echo ""
    
    if pio run; then
        print_success "Build completed successfully!"
        echo ""
        return 0
    else
        print_error "Build failed!"
        return 1
    fi
}

# Flash the ESP32
flash_esp32() {
    print_status "Looking for ESP32-C3 device..."
    
    # Try to find the ESP32 device
    DEVICE=""
    
    # Common ESP32 device paths on macOS
    for path in /dev/tty.usbserial-* /dev/tty.usbmodem* /dev/ttyUSB* /dev/cu.usbserial-* /dev/cu.usbmodem*; do
        if [ -e "$path" ]; then
            DEVICE="$path"
            break
        fi
    done
    
    if [ -z "$DEVICE" ]; then
        print_warning "No ESP32 device found automatically."
        print_status "Please connect your ESP32-C3 via USB and try again."
        print_status "Or specify the device path manually:"
        echo ""
        echo "Usage: $0 [device_path]"
        echo "Example: $0 /dev/tty.usbserial-0001"
        echo ""
        return 1
    fi
    
    print_success "Found ESP32 device: $DEVICE"
    
    # Update platformio.ini with the detected device
    print_status "Updating device configuration..."
    sed -i.bak "s|upload_port = .*|upload_port = $DEVICE|" platformio.ini
    
    print_status "Flashing ESP32-C3..."
    echo ""
    
    if pio run --target upload; then
        print_success "ESP32 flashed successfully! 🎃✨"
        echo ""
        print_status "Your Halloween LED controller is ready!"
        print_status "Connect your LED strip to GPIO pin 2"
        print_status "Update WiFi credentials in src/main.cpp"
        echo ""
        return 0
    else
        print_error "Flash failed!"
        print_status "Make sure:"
        print_status "  - ESP32-C3 is connected via USB"
        print_status "  - Device is in bootloader mode (hold BOOT button while pressing RESET)"
        print_status "  - Correct drivers are installed"
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
    
    # Use our custom monitor script
    ./monitor_serial.sh "$DEVICE"
}

# Main function
main() {
    # Check if device path was provided as argument
    if [ $# -eq 1 ]; then
        DEVICE="$1"
        print_status "Using specified device: $DEVICE"
        # Update platformio.ini with the specified device
        sed -i.bak "s|upload_port = .*|upload_port = $DEVICE|" platformio.ini
    fi
    
    # Run all checks and build
    check_platformio
    check_esp32_platform
    check_libraries
    
    if build_project; then
        echo ""
        print_status "Build successful! Ready to flash."
        echo ""
        
        # Ask user if they want to flash
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
                    print_success "Flash complete! Run './monitor_serial.sh' to see debug output."
                fi
            fi
        else
            print_status "Build complete! Run '$0' again to flash when ready."
        fi
    else
        print_error "Build failed. Please check the errors above."
        exit 1
    fi
}

# Show help if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "🎃 Halloween ESP32 LED Controller - Easy Flash Script"
    echo ""
    echo "Usage:"
    echo "  $0                    # Auto-detect device and flash"
    echo "  $0 [device_path]      # Specify device path manually"
    echo "  $0 -h, --help        # Show this help"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 /dev/tty.usbserial-0001"
    echo "  $0 /dev/cu.usbmodem1234567890"
    echo ""
    echo "Before flashing:"
    echo "  1. Connect ESP32-C3 via USB"
    echo "  2. Update WiFi credentials in src/main.cpp"
    echo "  3. Connect LED strip to GPIO pin 2"
    echo ""
    exit 0
fi

# Run main function
main "$@"
