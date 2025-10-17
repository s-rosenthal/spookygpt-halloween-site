#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <FastLED.h>

// ============================================================================
// CONFIGURATION - Modify these values for your setup
// ============================================================================

// WiFi credentials (your phone's hotspot)
const char* WIFI_SSID = "Simon";
const char* WIFI_PASSWORD = "Monkey123";

// API endpoint URL (replace with your actual domain)
const char* API_URL = "https://treasa-apterygial-magdalen.ngrok-free.dev/api/status";

// LED strip configuration
#define LED_PIN 2           // GPIO pin connected to LED strip data line
#define NUM_LEDS 50         // Number of LEDs in your strip
#define LED_TYPE WS2812B    // LED strip type
#define COLOR_ORDER GRB     // Color order for your LEDs

// Timing configuration
const unsigned long POLL_INTERVAL = 8000;  // Poll API every 8 seconds
const unsigned long LED_DURATION = 3000;   // Keep LEDs on for 3 seconds

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void connectToWiFi();
void scanWiFiNetworks();
void pollAPI();
void parseAPIResponse(String jsonString);
void startupLEDSequence();
void activateLEDs();
void handleLEDEffects();
void turnOffLEDs();
void printStatus();

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

CRGB leds[NUM_LEDS];
unsigned long lastPollTime = 0;
unsigned long ledStartTime = 0;
int lastQueryCount = 0;
bool ledsActive = false;
bool wifiConnected = false;

// ============================================================================
// SETUP FUNCTION
// ============================================================================

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  Serial.println();
  Serial.println("🎃 Halloween LED Controller Starting...");
  Serial.println("=====================================");
  
  // Initialize LED strip
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(100); // Start with moderate brightness
  
  // Show startup sequence
  startupLEDSequence();
  
  // Connect to WiFi
  connectToWiFi();
  
  // If WiFi failed, scan for available networks
  if (!wifiConnected) {
    scanWiFiNetworks();
  }
  
  Serial.println("✅ Setup complete! Starting main loop...");
  Serial.println();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi disconnected! Attempting to reconnect...");
    wifiConnected = false;
    connectToWiFi();
    return;
  }
  
  // Poll API at regular intervals
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    pollAPI();
    lastPollTime = millis();
  }
  
  // Handle LED effects
  if (ledsActive) {
    handleLEDEffects();
    
    // Turn off LEDs after duration
    if (millis() - ledStartTime >= LED_DURATION) {
      turnOffLEDs();
      ledsActive = false;
      Serial.println("💡 LEDs turned off");
    }
  }
  
  // Small delay to prevent overwhelming the system
  delay(100);
}

// ============================================================================
// WIFI FUNCTIONS
// ============================================================================

void connectToWiFi() {
  Serial.print("📡 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  // Disconnect and clear any previous connection
  WiFi.disconnect(true);
  delay(1000);
  
  // Set WiFi mode to station
  WiFi.mode(WIFI_STA);
  
  // Begin connection
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    Serial.print(".");
    attempts++;
    
    // Print status every 5 attempts
    if (attempts % 5 == 0) {
      Serial.println();
      Serial.print("   Attempt ");
      Serial.print(attempts);
      Serial.print("/30 - Status: ");
      switch(WiFi.status()) {
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
        default:
          Serial.println("CONNECTING...");
          break;
      }
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
  } else {
    Serial.println();
    Serial.println("❌ Failed to connect to WiFi!");
    Serial.println("   Troubleshooting tips:");
    Serial.println("   1. Check iPhone hotspot is ON");
    Serial.println("   2. Verify WiFi password");
    Serial.println("   3. Try renaming hotspot (no spaces)");
    Serial.println("   4. Move ESP32 closer to phone");
    Serial.println("   5. Restart iPhone hotspot");
  }
}

void scanWiFiNetworks() {
  Serial.println("🔍 Scanning for available WiFi networks...");
  
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("   No networks found");
  } else {
    Serial.print("   Found ");
    Serial.print(n);
    Serial.println(" networks:");
    
    for (int i = 0; i < n; ++i) {
      Serial.print("   ");
      Serial.print(i + 1);
      Serial.print(": ");
      Serial.print(WiFi.SSID(i));
      Serial.print(" (");
      Serial.print(WiFi.RSSI(i));
      Serial.print(" dBm) ");
      Serial.println((WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "Open" : "Encrypted");
    }
  }
  Serial.println();
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

void pollAPI() {
  if (!wifiConnected) {
    Serial.println("⚠️  Skipping API poll - WiFi not connected");
    return;
  }
  
  Serial.print("🔍 Polling API: ");
  Serial.println(API_URL);
  
  HTTPClient http;
  WiFiClientSecure client;
  
  // Configure HTTPS client (skip certificate verification for simplicity)
  client.setInsecure();
  
  http.begin(client, API_URL);
  http.setTimeout(10000); // 10 second timeout
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("📊 API Response (");
    Serial.print(httpResponseCode);
    Serial.print("): ");
    Serial.println(response);
    
    // Parse JSON response
    parseAPIResponse(response);
    
  } else {
    Serial.print("❌ API request failed with code: ");
    Serial.println(httpResponseCode);
    Serial.print("   Error: ");
    Serial.println(http.errorToString(httpResponseCode));
  }
  
  http.end();
}

void parseAPIResponse(String jsonString) {
  // Parse JSON using ArduinoJson
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, jsonString);
  
  if (error) {
    Serial.print("❌ JSON parsing failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  int currentQueryCount = doc["totalQueries"];
  bool ledsEnabled = doc["ledsEnabled"];
  
  Serial.print("📈 Total queries: ");
  Serial.println(currentQueryCount);
  Serial.print("💡 LEDs enabled: ");
  Serial.println(ledsEnabled ? "YES" : "NO");
  
  // Check if we have a new query and LEDs are enabled
  if (currentQueryCount > lastQueryCount && ledsEnabled) {
    Serial.println("🎉 NEW QUERY DETECTED! Lighting up LEDs!");
    activateLEDs();
    lastQueryCount = currentQueryCount;
  } else if (currentQueryCount > lastQueryCount && !ledsEnabled) {
    Serial.println("📝 New query detected, but LEDs are disabled");
    lastQueryCount = currentQueryCount;
  } else {
    Serial.println("😴 No new queries");
  }
}

// ============================================================================
// LED FUNCTIONS
// ============================================================================

void startupLEDSequence() {
  Serial.println("💡 Running startup LED sequence...");
  
  // Rainbow wave effect
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CHSV(i * 255 / NUM_LEDS, 255, 255);
    FastLED.show();
    delay(50);
  }
  
  // Flash white
  fill_solid(leds, NUM_LEDS, CRGB::White);
  FastLED.show();
  delay(200);
  
  // Turn off
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
  
  Serial.println("✅ Startup sequence complete");
}

void activateLEDs() {
  ledsActive = true;
  ledStartTime = millis();
  Serial.println("🎃 Activating Halloween LED effects!");
}

void handleLEDEffects() {
  unsigned long elapsed = millis() - ledStartTime;
  
  // Different effects based on elapsed time
  if (elapsed < 1000) {
    // First second: Orange flash
    fill_solid(leds, NUM_LEDS, CRGB::Orange);
    FastLED.show();
  } else if (elapsed < 2000) {
    // Second second: Purple wave
    for (int i = 0; i < NUM_LEDS; i++) {
      int hue = (i * 255 / NUM_LEDS + millis() / 10) % 255;
      leds[i] = CHSV(hue, 255, 200);
    }
    FastLED.show();
  } else {
    // Third second: Red pulsing
    int brightness = 128 + 127 * sin(millis() / 100.0);
    fill_solid(leds, NUM_LEDS, CRGB(brightness, 0, 0));
    FastLED.show();
  }
}

void turnOffLEDs() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

void printStatus() {
  Serial.println();
  Serial.println("📊 Current Status:");
  Serial.print("   WiFi: ");
  Serial.println(wifiConnected ? "Connected" : "Disconnected");
  Serial.print("   Last query count: ");
  Serial.println(lastQueryCount);
  Serial.print("   LEDs active: ");
  Serial.println(ledsActive ? "YES" : "NO");
  Serial.print("   Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" seconds");
  Serial.println();
}