#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FastLED.h>

// Configuration - Update these for your setup
#define WIFI_SSID "Simon"        // Change to your phone's hotspot name
#define WIFI_PASSWORD "Monkey123"        // Change to your hotspot password
#define API_URL "https://treasa-apterygial-magdalen.ngrok-free.dev/api/status"  // Change to your actual URL

// LED Configuration
#define LED_PIN 8                           // Built-in LED pin for ESP32-C3
#define LED_STRIP_PIN 2                     // Pin for external LED strip
#define NUM_LEDS 50                         // Number of LEDs in your strip
#define LED_TYPE WS2812B                    // LED strip type
#define COLOR_ORDER GRB                     // Color order for your strip

// Global variables
CRGB leds[NUM_LEDS];
bool wifiConnected = false;
int lastQueryCount = 0;
unsigned long lastApiCall = 0;
const unsigned long API_INTERVAL = 5000;    // Check every 5 seconds

// Function declarations
void connectToWiFi();
void scanWiFiNetworks();
void checkApiStatus();
void lightUpLEDs();
void setStatusLED(bool connected);

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  
  // Wait for serial port to connect (important for ESP32-C3)
  while (!Serial) {
    delay(10);
  }
  
  delay(1000); // Give extra time for serial to stabilize
  
  Serial.println();
  Serial.println("🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃");
  Serial.println("🎃                                                              🎃");
  Serial.println("🎃              HALLOWEEN COSTUME ESP32                          🎃");
  Serial.println("🎃                   LED Controller                              🎃");
  Serial.println("🎃                                                              🎃");
  Serial.println("🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃🎃");
  Serial.println();
  
  // Configure built-in LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Initialize LED strip
  FastLED.addLeds<LED_TYPE, LED_STRIP_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(50); // Start with lower brightness
  FastLED.clear();
  FastLED.show();
  
  Serial.println("🔧 Hardware initialized:");
  Serial.println("   ✅ Built-in LED (Status indicator)");
  Serial.println("   ✅ LED Strip (WS2812B)");
  Serial.println("   ✅ Serial communication");
  Serial.println();
  
  // Connect to WiFi
  Serial.println("📡 Starting WiFi connection...");
  connectToWiFi();
  
  if (wifiConnected) {
    Serial.println("🎉 Setup complete! Ready to monitor your website!");
    setStatusLED(true); // Solid LED when connected
  } else {
    Serial.println("⚠️  Setup complete but WiFi not connected. Will retry...");
    setStatusLED(false); // Blinking LED when not connected
  }
  
  Serial.println();
  Serial.println("🔄 Starting main loop...");
  Serial.println("═══════════════════════════════════════════════════════════════");
}

void loop() {
  static unsigned long lastWiFiRetry = 0;
  const unsigned long WIFI_RETRY_INTERVAL = 30000; // Retry WiFi every 30 seconds
  
  // Check WiFi connection status
  if (!wifiConnected || WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWiFiRetry > WIFI_RETRY_INTERVAL) {
      Serial.println();
      Serial.println("🔄 WiFi disconnected! Attempting to reconnect...");
      lastWiFiRetry = millis();
      connectToWiFi();
    }
    setStatusLED(false); // Keep blinking if not connected
    delay(1000);
    return;
  }
  
  // WiFi is connected, turn LED solid
  setStatusLED(true);
  
  // Check API status every 5 seconds
  if (millis() - lastApiCall > API_INTERVAL) {
    checkApiStatus();
    lastApiCall = millis();
  }
  
  delay(100);
}

void connectToWiFi() {
  Serial.print("📡 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  // Disconnect and clear any previous connection
  WiFi.disconnect(true);
  delay(1000);
  
  // Set WiFi mode to station
  WiFi.mode(WIFI_STA);
  
  // Try alternative connection method for iPhone hotspots
  Serial.println("   Trying alternative connection method...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Wait a bit and try again if first attempt fails
  delay(3000);
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("   First attempt failed, trying again...");
    WiFi.disconnect();
    delay(1000);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    Serial.print(".");
    attempts++;
    
    // Blink LED while connecting
    setStatusLED(false);
    
    // Print detailed status every 3 attempts
    if (attempts % 3 == 0) {
      Serial.println();
      Serial.print("   Attempt ");
      Serial.print(attempts);
      Serial.print("/30 - Status: ");
      wl_status_t status = WiFi.status();
      switch(status) {
        case WL_NO_SSID_AVAIL:
          Serial.println("NO_SSID_AVAIL (Network not found)");
          break;
        case WL_CONNECT_FAILED:
          Serial.println("CONNECT_FAILED (Wrong password?)");
          break;
        case WL_CONNECTION_LOST:
          Serial.println("CONNECTION_LOST");
          break;
        case WL_DISCONNECTED:
          Serial.println("DISCONNECTED");
          break;
        case WL_IDLE_STATUS:
          Serial.println("IDLE");
          break;
        case WL_SCAN_COMPLETED:
          Serial.println("SCAN_COMPLETED");
          break;
        default:
          Serial.print("CONNECTING (Status: ");
          Serial.print(status);
          Serial.println(")");
          break;
      }
      
      // Print MAC address for debugging
      Serial.print("   MAC: ");
      Serial.println(WiFi.macAddress());
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("✅ WiFi connected successfully!");
    Serial.print("📶 IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("🌐 Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.print("📡 Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.println("🎉 Ready to monitor your website!");
  } else {
    Serial.println();
    Serial.println("❌ Failed to connect to WiFi!");
    Serial.println("   Troubleshooting tips:");
    Serial.println("   1. Check iPhone hotspot is ON");
    Serial.println("   2. Verify WiFi password");
    Serial.println("   3. Try renaming hotspot (no spaces)");
    Serial.println("   4. Move ESP32 closer to phone");
    Serial.println("   5. Restart iPhone hotspot");
    
    // Scan for available networks
    scanWiFiNetworks();
  }
}

void scanWiFiNetworks() {
  Serial.println();
  Serial.println("🔍 Scanning for available WiFi networks...");
  int networksFound = WiFi.scanNetworks();
  
  if (networksFound == 0) {
    Serial.println("   No networks found!");
  } else {
    Serial.print("   Found ");
    Serial.print(networksFound);
    Serial.println(" networks:");
    
    for (int i = 0; i < networksFound; i++) {
      Serial.print("   ");
      Serial.print(i + 1);
      Serial.print(": ");
      Serial.print(WiFi.SSID(i));
      Serial.print(" (");
      Serial.print(WiFi.RSSI(i));
      Serial.print(" dBm) ");
      Serial.println(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "[OPEN]" : "[SECURED]");
    }
  }
}

void checkApiStatus() {
  if (!wifiConnected) return;
  
  Serial.print("🌐 Checking API status... ");
  
  HTTPClient http;
  http.begin(API_URL);
  http.setTimeout(10000); // 10 second timeout
  
  int httpCode = http.GET();
  
  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.println("✅ Success!");
      
      // Parse JSON response
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);
      
      if (error) {
        Serial.print("❌ JSON parsing failed: ");
        Serial.println(error.c_str());
        http.end();
        return;
      }
      
      int totalQueries = doc["totalQueries"];
      bool ledsEnabled = doc["ledsEnabled"];
      
      Serial.print("📊 Total queries: ");
      Serial.println(totalQueries);
      Serial.print("💡 LEDs enabled: ");
      Serial.println(ledsEnabled ? "YES" : "NO");
      
      // Check if we have a new query
      if (totalQueries > lastQueryCount && ledsEnabled) {
        Serial.println("🎉 NEW QUERY DETECTED! Lighting up LEDs!");
        lightUpLEDs();
        lastQueryCount = totalQueries;
      } else if (totalQueries > lastQueryCount && !ledsEnabled) {
        Serial.println("📝 New query detected but LEDs are disabled");
        lastQueryCount = totalQueries;
      } else {
        Serial.println("⏳ No new queries");
      }
      
    } else {
      Serial.print("❌ HTTP error: ");
      Serial.println(httpCode);
    }
  } else {
    Serial.print("❌ Connection failed: ");
    Serial.println(http.errorToString(httpCode));
  }
  
  http.end();
}

void lightUpLEDs() {
  Serial.println("🌈 Starting LED animation...");
  
  // Halloween colors
  CRGB colors[] = {CRGB::Orange, CRGB::Purple, CRGB::Red, CRGB::Green};
  
  // Animate LEDs for 3 seconds
  for (int cycle = 0; cycle < 6; cycle++) {
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i] = colors[cycle % 4];
    }
    FastLED.show();
    delay(500);
    
    // Clear LEDs
    FastLED.clear();
    FastLED.show();
    delay(500);
  }
  
  Serial.println("✨ LED animation complete!");
}

void setStatusLED(bool connected) {
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  
  if (connected) {
    // Solid LED when connected
    digitalWrite(LED_PIN, HIGH);
  } else {
    // Blinking LED when not connected
    if (millis() - lastBlink > 500) {
      lastBlink = millis();
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
    }
  }
}