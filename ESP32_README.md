# 🎃 Halloween ESP32 LED Controller

A spooky LED costume controller that lights up whenever someone sends a message to your SpookyGPT chatbot!

## 🚀 Quick Start

### 1. Flash Your ESP32-C3
```bash
./flash_esp32.sh
```

That's it! The script will:
- ✅ Check/install PlatformIO
- ✅ Install ESP32 platform and libraries  
- ✅ Build your project
- ✅ Auto-detect your ESP32 device
- ✅ Flash the firmware
- ✅ Open serial monitor

### 2. Configure Your Settings
Edit `src/main.cpp` and update:
```cpp
const char* WIFI_SSID = "YourPhoneHotspot";
const char* WIFI_PASSWORD = "YourPassword123";
const char* API_URL = "https://your-domain.netlify.app/api/status";
```

### 3. Hardware Setup
- **ESP32-C3** development board
- **WS2812B LED strip** connected to **GPIO pin 2**
- **5V power supply** for LED strip
- **Phone hotspot** for WiFi

## 🎯 How It Works

1. **ESP32 connects** to your phone's WiFi hotspot
2. **Polls API** every 8 seconds: `GET /api/status`
3. **Detects new messages** when `totalQueries` increases
4. **Lights up LEDs** with Halloween effects:
   - 🟠 Orange flash (1st second)
   - 🟣 Purple wave (2nd second)  
   - 🔴 Red pulsing (3rd second)

## 📱 API Endpoint

Your server now has a new endpoint:
```
GET /api/status
```

Returns:
```json
{
  "totalQueries": 12,
  "ledsEnabled": true
}
```

## 🛠️ Manual Commands

If you prefer manual control:

```bash
# Build only
pio run

# Flash only  
pio run --target upload

# Serial monitor
pio device monitor --baud 115200

# Clean build
pio run --target clean
```

## 🔧 Troubleshooting

### Device Not Found
```bash
# Specify device manually
./flash_esp32.sh /dev/tty.usbserial-0001
```

### Build Errors
- Make sure PlatformIO extension is installed in VS Code/Cursor
- Check that all libraries are installed: `pio lib list`

### Flash Errors
- Hold BOOT button while pressing RESET to enter bootloader mode
- Try different USB cable/port
- Install ESP32 drivers if needed

## 🎨 LED Effects

The ESP32 creates spooky Halloween effects:
- **Startup**: Rainbow wave sequence
- **New Message**: Multi-stage Halloween animation
- **Debug**: Serial output with emojis for easy monitoring

## 📊 Serial Output

Watch the magic happen:
```
🎃 Halloween LED Controller Starting...
📡 Connecting to WiFi: YourPhoneHotspot
✅ WiFi connected successfully!
🔍 Polling API: https://your-domain.netlify.app/api/status
📈 Total queries: 5
🎉 NEW QUERY DETECTED! Lighting up LEDs!
```

## 🎃 Happy Halloween!

Your costume will now light up every time someone chats with SpookyGPT! 

**Pro tip**: Test it by sending messages to your chatbot and watch the LEDs dance! ✨
