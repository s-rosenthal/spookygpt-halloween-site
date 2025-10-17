//
//  SpookyGPTLEDApp.swift
//  SpookyGPT LED Controller
//
//  Created by AI Assistant
//  Copyright © 2025 SpookyGPT. All rights reserved.
//

import SwiftUI
import CoreBluetooth
import Foundation
import BackgroundTasks
import UserNotifications

// MARK: - Data Models
struct LEDStatus: Codable {
    let lastLedCommand: LEDCommand?
    let totalQueries: Int
}

struct LEDCommand: Codable {
    let action: String
    let timestamp: Int64
    let queryCount: Int?
}

struct LoginResponse: Codable {
    let token: String
    let success: Bool
}

// MARK: - BLE Manager
class BLEManager: NSObject, ObservableObject {
    private var centralManager: CBCentralManager!
    private var connectedPeripheral: CBPeripheral?
    private var targetCharacteristic: CBCharacteristic?
    
    @Published var isConnected = false
    @Published var isScanning = false
    @Published var statusMessage = "Ready to connect"
    
    // ESP32 Service and Characteristic UUIDs
    private let serviceUUID = CBUUID(string: "12345678-1234-1234-1234-123456789abc")
    private let characteristicUUID = CBUUID(string: "87654321-4321-4321-4321-cba987654321")
    private let deviceName = "SpookyGPT-LEDS"
    
    override init() {
        super.init()
        // Simple initialization - let iOS handle permissions automatically
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    func startScanning() {
        guard centralManager.state == .poweredOn else {
            statusMessage = "Bluetooth not available"
            return
        }
        
        isScanning = true
        statusMessage = "Scanning for \(deviceName)..."
        centralManager.scanForPeripherals(withServices: [serviceUUID], options: nil)
        
        // Stop scanning after 10 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            if self.isScanning {
                self.stopScanning()
                self.statusMessage = "Device not found. Make sure ESP32 is running."
            }
        }
    }
    
    func stopScanning() {
        isScanning = false
        centralManager.stopScan()
    }
    
    func disconnect() {
        if let peripheral = connectedPeripheral {
            centralManager.cancelPeripheralConnection(peripheral)
        }
    }
    
    func sendCommand(_ command: String) {
        guard let characteristic = targetCharacteristic,
              let data = command.data(using: .utf8) else {
            statusMessage = "Not connected to ESP32"
            return
        }
        
        connectedPeripheral?.writeValue(data, for: characteristic, type: .withResponse)
        statusMessage = "Sent: \(command)"
    }
}

// MARK: - BLE Manager Delegate
extension BLEManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            statusMessage = "Bluetooth ready"
        case .poweredOff:
            statusMessage = "Bluetooth is off"
            isConnected = false
        case .unauthorized:
            statusMessage = "Bluetooth permission denied"
        case .unsupported:
            statusMessage = "Bluetooth not supported"
        case .resetting:
            statusMessage = "Bluetooth resetting"
        case .unknown:
            statusMessage = "Bluetooth state unknown"
        @unknown default:
            statusMessage = "Unknown Bluetooth state"
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        if peripheral.name == deviceName {
            stopScanning()
            connectedPeripheral = peripheral
            peripheral.delegate = self
            centralManager.connect(peripheral, options: nil)
            statusMessage = "Connecting to \(deviceName)..."
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        isConnected = true
        statusMessage = "Connected to \(deviceName)"
        peripheral.discoverServices([serviceUUID])
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        isConnected = false
        statusMessage = "Disconnected from \(deviceName)"
        connectedPeripheral = nil
        targetCharacteristic = nil
    }
}

// MARK: - Peripheral Delegate
extension BLEManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        
        for service in services {
            if service.uuid == serviceUUID {
                peripheral.discoverCharacteristics([characteristicUUID], for: service)
            }
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }
        
        for characteristic in characteristics {
            if characteristic.uuid == characteristicUUID {
                targetCharacteristic = characteristic
                statusMessage = "✅ Ready to send commands"
            }
        }
    }
}

// MARK: - API Manager
class APIManager: ObservableObject {
    @Published var ledStatus: LEDStatus?
    @Published var lastError: String?
    @Published var isPolling = false
    @Published var isAuthenticated = false
    
    private var pollingTimer: Timer?
    private let baseURL: String
    private var authToken: String?
    private var lastProcessedCommandTimestamp: Int64 = 0
    weak var bleManager: BLEManager?
    
    // Background task management
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    private var backgroundTimer: Timer?
    
    init(baseURL: String) {
        self.baseURL = baseURL
    }
    
    func setBLEManager(_ bleManager: BLEManager) {
        self.bleManager = bleManager
    }
    
    func login(password: String, completion: @escaping (Bool, String?) -> Void) {
        guard let url = URL(string: "\(baseURL)/api/admin/login") else {
            completion(false, "Invalid URL")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let loginData = ["password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: loginData)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(false, "Network error: \(error.localizedDescription)")
                    return
                }
                
                guard let data = data else {
                    completion(false, "No data received")
                    return
                }
                
                do {
                    let loginResponse = try JSONDecoder().decode(LoginResponse.self, from: data)
                    if loginResponse.success {
                        self.authToken = loginResponse.token
                        self.isAuthenticated = true
                        completion(true, nil)
                    } else {
                        completion(false, "Invalid password")
                    }
                } catch {
                    completion(false, "JSON error: \(error.localizedDescription)")
                }
            }
        }.resume()
    }
    
    func logout() {
        authToken = nil
        isAuthenticated = false
        stopPolling()
    }
    
    func startPolling(interval: TimeInterval = 3.0) {
        guard isAuthenticated else {
            lastError = "Not authenticated. Please login first."
            return
        }
        
        stopPolling()
        isPolling = true
        
        // Initial fetch
        fetchLEDStatus()
        
        // Set up timer with background execution support
        setupBackgroundPolling(interval: interval)
    }
    
    private func setupBackgroundPolling(interval: TimeInterval) {
        // Create timer that works in background
        pollingTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            self.fetchLEDStatus()
        }
        
        // Ensure timer continues in background
        RunLoop.current.add(pollingTimer!, forMode: .common)
        
        // Register for background task
        registerBackgroundTask()
    }
    
    private func registerBackgroundTask() {
        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "LEDPolling") {
            // This block is called when the background task is about to expire
            self.endBackgroundTask()
        }
    }
    
    private func endBackgroundTask() {
        if backgroundTaskID != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskID)
            backgroundTaskID = .invalid
        }
    }
    
    func stopPolling() {
        pollingTimer?.invalidate()
        pollingTimer = nil
        backgroundTimer?.invalidate()
        backgroundTimer = nil
        isPolling = false
        endBackgroundTask()
    }
    
    private func fetchLEDStatus() {
        guard let url = URL(string: "\(baseURL)/api/admin/led/status") else {
            lastError = "Invalid URL"
            return
        }
        
        guard let token = authToken else {
            lastError = "Not authenticated"
            return
        }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self.lastError = "Network error: \(error.localizedDescription)"
                    return
                }
                
                guard let data = data else {
                    self.lastError = "No data received"
                    return
                }
                
                do {
                    let status = try JSONDecoder().decode(LEDStatus.self, from: data)
                    self.ledStatus = status
                    self.lastError = nil
                    
                    if let command = status.lastLedCommand {
                        // Check for new LED commands to send to ESP32
                        if command.timestamp > self.lastProcessedCommandTimestamp {
                            self.lastProcessedCommandTimestamp = command.timestamp
                            
                            // Send command to ESP32 if connected
                            if let bleManager = self.bleManager, bleManager.isConnected {
                                bleManager.sendCommand(command.action)
                            }
                        }
                    }
                } catch {
                    self.lastError = "JSON error: \(error.localizedDescription)"
                }
            }
        }.resume()
    }
}

// MARK: - Main App
@main
struct HalloweenLEDApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
                    appState.handleBackgroundTransition()
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                    appState.handleForegroundTransition()
                }
        }
    }
}

// MARK: - App State Manager
class AppState: ObservableObject {
    @Published var isInBackground = false
    
    func handleBackgroundTransition() {
        isInBackground = true
        print("App entered background - continuing LED polling")
    }
    
    func handleForegroundTransition() {
        isInBackground = false
        print("App entered foreground")
    }
}

// MARK: - Content View
struct ContentView: View {
    @StateObject private var bleManager = BLEManager()
    @StateObject private var apiManager = APIManager(baseURL: "https://treasa-apterygial-magdalen.ngrok-free.dev")
    @EnvironmentObject var appState: AppState
    @State private var websiteURL = "https://treasa-apterygial-magdalen.ngrok-free.dev"
    @State private var showingSettings = false
    @State private var showingLogin = false
    @State private var adminPassword = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Header
                VStack(spacing: 8) {
                    Text("👻")
                        .font(.system(size: 60))
                    Text("SpookyGPT")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    Text("ESP32 LED Controller")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top)
                
                // Status Cards
                VStack(spacing: 15) {
                    // BLE Status
                    StatusCard(
                        title: "📱 ESP32 Connection",
                        status: bleManager.isConnected ? "Connected" : "Disconnected",
                        color: bleManager.isConnected ? .green : .red
                    )
                    
                    // API Status
                    StatusCard(
                        title: "🌐 Website Status",
                        status: apiManager.isPolling ? "Polling" : "Stopped",
                        color: apiManager.isPolling ? .green : .orange
                    )
                    
                    // Background Status
                    StatusCard(
                        title: "🔄 Background Mode",
                        status: appState.isInBackground ? "Running in Background" : "Foreground",
                        color: appState.isInBackground ? .blue : .gray
                    )
                }
                
                // LED Status
                if let status = apiManager.ledStatus {
                    LEDStatusView(status: status)
                }
                
                // Error Message
                if let error = apiManager.lastError {
                    Text("❌ \(error)")
                        .foregroundColor(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                }
                
                Spacer()
                
                // Control Buttons
                VStack(spacing: 15) {
                    if !bleManager.isConnected {
                        Button("📱 Connect to ESP32") {
                            bleManager.startScanning()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    } else {
                        Button("❌ Disconnect ESP32") {
                            bleManager.disconnect()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        
                        if !apiManager.isAuthenticated {
                            Button("🔐 Admin Login") {
                                showingLogin = true
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        } else {
                            if !apiManager.isPolling {
                                Button("🚀 Start Auto-Control") {
                                    apiManager.startPolling()
                                }
                                .buttonStyle(PrimaryButtonStyle())
                            } else {
                                Button("⏹️ Stop Auto-Control") {
                                    apiManager.stopPolling()
                                }
                                .buttonStyle(SecondaryButtonStyle())
                            }
                            
                            Button("🚪 Logout") {
                                apiManager.logout()
                            }
                            .buttonStyle(SecondaryButtonStyle())
                            
                            // Manual LED Control
                            Button("👻 LED ON") {
                                bleManager.sendCommand("LED_ON:3000")
                            }
                            .buttonStyle(ActionButtonStyle(color: Color(red: 0.2, green: 0.8, blue: 0.2))) // Spooky green
                        }
                    }
                }
                
                // Status Message
                Text(bleManager.statusMessage)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("⚙️") {
                        showingSettings = true
                    }
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(websiteURL: $websiteURL, apiManager: apiManager)
        }
        .sheet(isPresented: $showingLogin) {
            LoginView(adminPassword: $adminPassword, apiManager: apiManager, isPresented: $showingLogin)
        }
        .onAppear {
            // Set BLE manager reference in API manager
            apiManager.setBLEManager(bleManager)
            
            // Auto-connect to ESP32
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                bleManager.startScanning()
            }
        }
    }
}

// MARK: - Status Card
struct StatusCard: View {
    let title: String
    let status: String
    let color: Color
    
    var body: some View {
        HStack {
            Text(title)
                .font(.headline)
            Spacer()
            Text(status)
                .font(.subheadline)
                .foregroundColor(color)
                .fontWeight(.semibold)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - LED Status View
struct LEDStatusView: View {
    let status: LEDStatus
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("💡 LED Status")
                .font(.headline)
            
            HStack {
                Text("Queries:")
                Spacer()
                Text("\(status.totalQueries)")
            }
            
            if let command = status.lastLedCommand {
                HStack {
                    Text("Last Command:")
                    Spacer()
                    Text(command.action)
                        .foregroundColor(.blue)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Login View
struct LoginView: View {
    @Binding var adminPassword: String
    @ObservedObject var apiManager: APIManager
    @Binding var isPresented: Bool
    @State private var isLoading = false
    @State private var errorMessage = ""
    @Environment(\.presentationMode) var presentationMode
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("🔐")
                    .font(.system(size: 60))
                
                Text("Admin Login")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Enter admin password to control LEDs")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                
                VStack(spacing: 15) {
                    SecureField("Admin Password", text: $adminPassword)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                    
                    if !errorMessage.isEmpty {
                        Text("❌ \(errorMessage)")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    
                    Button("Login") {
                        performLogin()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isLoading || adminPassword.isEmpty)
                }
                .padding()
                
                Spacer()
            }
            .padding()
            .navigationTitle("Login")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
        }
    }
    
    private func performLogin() {
        isLoading = true
        errorMessage = ""
        
        apiManager.login(password: adminPassword) { success, error in
            isLoading = false
            
            if success {
                presentationMode.wrappedValue.dismiss()
            } else {
                errorMessage = error ?? "Login failed"
            }
        }
    }
}

// MARK: - Settings View
struct SettingsView: View {
    @Binding var websiteURL: String
    @ObservedObject var apiManager: APIManager
    @Environment(\.presentationMode) var presentationMode
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Website Configuration")) {
                    TextField("Website URL", text: $websiteURL)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }
                
                Section(header: Text("About")) {
                    Text("Halloween LED Controller")
                    Text("Version 1.0")
                    Text("Made with ❤️ for Halloween")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Button Styles
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding()
            .background(LinearGradient(gradient: Gradient(colors: [Color.orange, Color.red]), startPoint: .leading, endPoint: .trailing))
            .cornerRadius(12)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding()
            .background(Color(.systemGray2))
            .cornerRadius(12)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

struct ActionButtonStyle: ButtonStyle {
    let color: Color
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding()
            .background(LinearGradient(gradient: Gradient(colors: [color, color.opacity(0.8)]), startPoint: .top, endPoint: .bottom))
            .cornerRadius(12)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

// MARK: - Preview
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
