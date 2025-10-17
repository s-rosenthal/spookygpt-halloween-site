#!/bin/bash

# 🔍 ESP32 Serial Monitor Script
# This script monitors the ESP32 serial output with proper formatting

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
echo -e "${CYAN}"
echo "🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍"
echo "🔍                                                              🔍"
echo "🔍              ESP32 SERIAL MONITOR                            🔍"
echo "🔍                   Debug Console                              🔍"
echo "🔍                                                              🔍"
echo "🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍"
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

# Function to find ESP32 device
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
        return 1
    fi
    
    print_success "Found ESP32 device: $DEVICE"
    return 0
}

# Function to setup serial port
setup_serial() {
    print_status "Setting up serial port..."
    
    # Set baud rate and configure port
    if stty -f "$DEVICE" 115200 raw -echo 2>/dev/null; then
        print_success "Serial port configured (115200 baud)"
    else
        print_warning "Could not configure serial port, trying anyway..."
    fi
}

# Function to monitor serial output
monitor_serial() {
    print_status "Starting serial monitor..."
    print_status "Press Ctrl+C to exit"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Use cat to read from serial port
    cat "$DEVICE" 2>/dev/null || {
        print_error "Failed to read from serial port!"
        print_status "Make sure:"
        print_status "  - ESP32 is connected"
        print_status "  - No other programs are using the port"
        print_status "  - ESP32 is powered on"
        return 1
    }
}

# Function to show help
show_help() {
    echo "🔍 ESP32 Serial Monitor Script"
    echo ""
    echo "Usage:"
    echo "  $0                    # Auto-detect device and monitor"
    echo "  $0 [device_path]      # Specify device path manually"
    echo "  $0 -h, --help        # Show this help"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 /dev/tty.usbmodem1101"
    echo "  $0 /dev/cu.usbserial-0001"
    echo ""
    echo "What you'll see:"
    echo "  🎃 Halloween LED Controller messages"
    echo "  📡 WiFi connection attempts"
    echo "  🔍 Network scanning results"
    echo "  📊 API polling status"
    echo "  💡 LED activation messages"
    echo ""
    echo "Troubleshooting:"
    echo "  - If no output: ESP32 not connected or not powered"
    echo "  - If garbled text: Wrong baud rate (should be 115200)"
    echo "  - If permission denied: Run with sudo or check USB permissions"
    echo ""
}

# Main function
main() {
    # Check if help was requested
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi
    
    # Check if device path was provided
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
    
    # Setup serial port
    setup_serial
    
    # Start monitoring
    monitor_serial
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n\n${YELLOW}[INFO]${NC} Serial monitor stopped by user"; exit 0' INT

# Run main function
main "$@"
