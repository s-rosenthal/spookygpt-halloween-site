#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// LED Configuration - Using simple digital pin control
#define LED_PIN 8  // Built-in LED pin for ESP32-C3 (same as blink test)

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
          
          Serial.println("🎃 Turning ON LEDs for " + String(duration) + "ms");
          
          // Turn on LED (LOW = ON for ESP32-C3 built-in LED)
          digitalWrite(LED_PIN, LOW);
          
          delay(duration);
          
          // Turn off LED
          digitalWrite(LED_PIN, HIGH);
          
          Serial.println("🔴 LEDs turned OFF");
          
        } else if (command == "LED_OFF") {
          Serial.println("🔴 Turning OFF LEDs");
          digitalWrite(LED_PIN, HIGH);
          
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
      Serial.println("🎃 ESP32-C3 SpookyGPT LED Controller");
  Serial.println("====================================");
  
  // Initialize LED pin
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // Start with LED off (HIGH = OFF for ESP32-C3)
  
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
  
  // Blink LED to show it's ready
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW);  // LED ON
    delay(200);
    digitalWrite(LED_PIN, HIGH); // LED OFF
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