#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <FastLED.h>

// WS2812E LED Strip Configuration
#define LED_PIN 4        // Data pin for WS2812E strip
#define NUM_LEDS 50      // Number of LEDs in your strip (adjust as needed)
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
        
        if (command.startsWith("LED_ON:")) {
          // Extract duration (e.g., "LED_ON:5000" = 5 seconds)
          int duration = command.substring(7).toInt();
          if (duration == 0) duration = 3000; // Default 3 seconds
          
          Serial.println("🎃 Turning ON LED strip for " + String(duration) + "ms");
          
          // Turn on all LEDs with orange color (Halloween theme)
          fill_solid(leds, NUM_LEDS, CRGB::Orange);
          FastLED.show();
          
          delay(duration);
          
          // Turn off all LEDs
          fill_solid(leds, NUM_LEDS, CRGB::Black);
          FastLED.show();
          
          Serial.println("🔴 LED strip turned OFF");
          
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