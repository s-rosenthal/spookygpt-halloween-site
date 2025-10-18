#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <FastLED.h>

// WS2812E LED Strip Configuration
#define LED_PIN 4        // Data pin for WS2812E strip
#define NUM_LEDS 60      // Number of LEDs in your strip (adjust as needed)
#define LED_TYPE WS2812B // LED strip type (compatible with WS2812E)
#define COLOR_ORDER GRB   // Color order for WS2812E

CRGB leds[NUM_LEDS];     // LED array

// BLE Configuration
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Custom UUIDs for Halloween LED Controller
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-cba987654321"

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("📱 Device connected!");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("📱 Device disconnected!");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();
      
      if (rxValue.length() > 0) {
        Serial.println("📨 Received command: " + String(rxValue.c_str()));
        
        String command = String(rxValue.c_str());
        
        if (command.startsWith("LED_COLOR:")) {
          // Extract RGB values and optional duration (e.g., "LED_COLOR:255,128,64:5000" = RGB color for 5 seconds)
          String colorData = command.substring(10);
          Serial.println("🔍 Parsing color data: '" + colorData + "'");
          
          // Check if there's a duration (look for last colon)
          int durationSep = colorData.lastIndexOf(':');
          int duration = 0; // 0 means permanent (no duration)
          
          if (durationSep > 0) {
            // Has duration - extract it
            duration = colorData.substring(durationSep + 1).toInt();
            colorData = colorData.substring(0, durationSep); // Remove duration part
            Serial.println("🔍 Duration: " + String(duration) + "ms");
          }
          
          int firstComma = colorData.indexOf(',');
          int secondComma = colorData.indexOf(',', firstComma + 1);
          
          if (firstComma >= 0 && secondComma > firstComma) {
            int red = colorData.substring(0, firstComma).toInt();
            int green = colorData.substring(firstComma + 1, secondComma).toInt();
            int blue = colorData.substring(secondComma + 1).toInt();
            
            // Clamp values to 0-255 range
            red = constrain(red, 0, 255);
            green = constrain(green, 0, 255);
            blue = constrain(blue, 0, 255);
            
            if (duration > 0) {
              Serial.println("⚡ Setting LED color RGB(" + String(red) + "," + String(green) + "," + String(blue) + ") for " + String(duration) + "ms");
              
              // Flash the specified color for duration
              fill_solid(leds, NUM_LEDS, CRGB(red, green, blue));
              FastLED.show();
              
              delay(duration);
              
              // Turn off all LEDs
              fill_solid(leds, NUM_LEDS, CRGB::Black);
              FastLED.show();
              
              Serial.println("🔴 Flash completed");
            } else {
              Serial.println("🎨 Setting LED color to RGB(" + String(red) + "," + String(green) + "," + String(blue) + ") permanently");
              
              // Set all LEDs to the specified color permanently
              fill_solid(leds, NUM_LEDS, CRGB(red, green, blue));
              FastLED.show();
              
              // Send confirmation back
              String confirmMsg = "COLOR_SET:" + String(red) + "," + String(green) + "," + String(blue);
              pCharacteristic->setValue(confirmMsg.c_str());
              pCharacteristic->notify();
            }
          } else {
            Serial.println("❌ Invalid color format. Use: LED_COLOR:red,green,blue or LED_COLOR:red,green,blue:duration");
          }
          
        } else if (command.startsWith("LED_ANIMATE:")) {
          // Extract RGB values for animation (e.g., "LED_ANIMATE:255,128,64")
          String colorData = command.substring(12);
          Serial.println("🎬 Parsing animation color data: '" + colorData + "'");
          
          int firstComma = colorData.indexOf(',');
          int secondComma = colorData.indexOf(',', firstComma + 1);
          
          if (firstComma >= 0 && secondComma > firstComma) {
            int red = colorData.substring(0, firstComma).toInt();
            int green = colorData.substring(firstComma + 1, secondComma).toInt();
            int blue = colorData.substring(secondComma + 1).toInt();
            
            // Clamp values to 0-255 range
            red = constrain(red, 0, 255);
            green = constrain(green, 0, 255);
            blue = constrain(blue, 0, 255);
            
            Serial.println("🎬 Starting LED animation with RGB(" + String(red) + "," + String(green) + "," + String(blue) + ")");
            
            // Clear all LEDs first
            fill_solid(leds, NUM_LEDS, CRGB::Black);
            FastLED.show();
            delay(100);
            
            // Circular chasing animation - 3 cycles with group of 3 LEDs
            for (int cycle = 0; cycle < 3; cycle++) {
              Serial.println("🔄 Animation cycle " + String(cycle + 1) + "/3");
              
              // Create chasing effect: group of 3 LEDs travels around the circle
              for (int startPos = 0; startPos < NUM_LEDS; startPos++) {
                // Turn off all LEDs
                fill_solid(leds, NUM_LEDS, CRGB::Black);
                
                // Turn on group of 3 LEDs starting at current position
                for (int i = 0; i < 3; i++) {
                  int ledIndex = (startPos + i) % NUM_LEDS;
                  leds[ledIndex] = CRGB(red, green, blue);
                }
                
                FastLED.show();
                delay(30); // Speed of the chasing animation
              }
            }
            
            // Final two blinks with selected color
            Serial.println("✨ Final blinks");
            for (int blink = 0; blink < 2; blink++) {
              fill_solid(leds, NUM_LEDS, CRGB(red, green, blue));
              FastLED.show();
              delay(200);
              
              fill_solid(leds, NUM_LEDS, CRGB::Black);
              FastLED.show();
              delay(200);
            }
            
            Serial.println("🎬 Animation completed");
            
            // Send confirmation back
            String confirmMsg = "ANIMATION_COMPLETE:" + String(red) + "," + String(green) + "," + String(blue);
            pCharacteristic->setValue(confirmMsg.c_str());
            pCharacteristic->notify();
            
          } else {
            Serial.println("❌ Invalid animation color format. Use: LED_ANIMATE:red,green,blue");
          }
          
        } else if (command == "LED_OFF") {
          Serial.println("🔴 Turning OFF LED strip");
          fill_solid(leds, NUM_LEDS, CRGB::Black);
          FastLED.show();
          
        } else if (command == "PING") {
          Serial.println("🏓 PING received - responding with PONG");
          pCharacteristic->setValue("PONG");
          pCharacteristic->notify();
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  
  Serial.println();
  Serial.println("🎃 ESP32-C3 SpookyGPT WS2812E LED Controller");
  Serial.println("===========================================");
  
  // Initialize FastLED
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(150); // Set brightness (0-255) - increased for better visibility
  
  // Clear all LEDs (turn off)
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
  
  // Initialize BLE
  BLEDevice::init("SpookyGPT-LEDS");
  
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_WRITE |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->setCallbacks(new MyCallbacks());
  pCharacteristic->setValue("Halloween LED Controller Ready");
  
  BLE2902 *p2902Descriptor = new BLE2902();
  p2902Descriptor->setNotifications(true);
  pCharacteristic->addDescriptor(p2902Descriptor);

  pService->start();
  
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
  
  Serial.println("🔵 BLE Server started - waiting for connections...");
      Serial.println("📱 Device name: SpookyGPT-LEDS");
  Serial.println("🔗 Ready to receive LED commands!");
  
  // Blink LED strip to show it's ready
  for (int i = 0; i < 3; i++) {
    fill_solid(leds, NUM_LEDS, CRGB::Orange); // LED strip ON
    FastLED.show();
    delay(200);
    fill_solid(leds, NUM_LEDS, CRGB::Black);  // LED strip OFF
    FastLED.show();
    delay(200);
  }
}

void loop() {
  // Handle BLE disconnection
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // Give the bluetooth stack the chance to get things ready
    pServer->startAdvertising(); // Restart advertising
    Serial.println("🔄 Restarting BLE advertising");
    oldDeviceConnected = deviceConnected;
  }
  
  // Handle BLE connection
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
  
  delay(100);
}