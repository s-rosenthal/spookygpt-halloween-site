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

// MARK: - Color Utilities
extension Color {
    func toRGB() -> (red: Int, green: Int, blue: Int) {
        let uiColor = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        
        uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        
        return (
            red: Int(red * 255),
            green: Int(green * 255),
            blue: Int(blue * 255)
        )
    }
}

// MARK: - Data Models
struct LEDStatus: Codable {
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
    private var lastProcessedQueryCount: Int = 0
    weak var bleManager: BLEManager?
    var selectedColor: Color = .orange
    
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
        
        // Set up timer
        pollingTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            self.fetchLEDStatus()
        }
    }
    
    
    func stopPolling() {
        pollingTimer?.invalidate()
        pollingTimer = nil
        isPolling = false
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
                    
                    // Check if query count increased (new query received)
                    if status.totalQueries > self.lastProcessedQueryCount {
                        self.lastProcessedQueryCount = status.totalQueries
                        
                        // Send LED command to ESP32 if connected
                        if let bleManager = self.bleManager, bleManager.isConnected {
                            self.sendQueryLEDCommand(bleManager: bleManager)
                        }
                    }
                } catch {
                    self.lastError = "JSON error: \(error.localizedDescription)"
                }
            }
        }.resume()
    }
    
    private func sendQueryLEDCommand(bleManager: BLEManager) {
        // Send selected color flash for 3 seconds
        let rgb = selectedColor.toRGB()
        bleManager.sendCommand("LED_COLOR:\(rgb.red),\(rgb.green),\(rgb.blue):3000")
    }
}

// MARK: - Main App
@main
struct HalloweenLEDApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

// MARK: - Content View
struct ContentView: View {
    @StateObject private var bleManager = BLEManager()
    @StateObject private var apiManager = APIManager(baseURL: "https://treasa-apterygial-magdalen.ngrok-free.dev")
    @State private var websiteURL = "https://treasa-apterygial-magdalen.ngrok-free.dev"
    @State private var showingSettings = false
    @State private var showingLogin = false
    @State private var adminPassword = ""
    @State private var selectedColor = Color.orange
    
    var body: some View {
        NavigationView {
            ScrollView {
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
                            VStack(spacing: 10) {
                                // Simple Color Picker
                                SimpleColorPicker(bleManager: bleManager, selectedColor: $selectedColor)
                                
                                HStack(spacing: 10) {
                                    Button("👻 LED ON") {
                                        sendLEDOnCommand(bleManager: bleManager, color: selectedColor)
                                    }
                                    .buttonStyle(ActionButtonStyle(color: selectedColor))
                                    .animation(.easeInOut(duration: 0.3), value: selectedColor)
                                    
                                    Button("🔴 LED OFF") {
                                        bleManager.sendCommand("LED_OFF")
                                    }
                                    .buttonStyle(SecondaryButtonStyle())
                                }
                            }
                        }
                    }
                }
                
                // Status Message
                Text(bleManager.statusMessage)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                }
                .padding()
            }
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
        .onChange(of: selectedColor) { newColor in
            // Update API manager with the selected color
            apiManager.selectedColor = newColor
        }
    }
    
    private func sendLEDOnCommand(bleManager: BLEManager, color: Color) {
        // Send selected color flash for 3 seconds
        let rgb = color.toRGB()
        bleManager.sendCommand("LED_COLOR:\(rgb.red),\(rgb.green),\(rgb.blue):3000")
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
                Text("Total Queries:")
                Spacer()
                Text("\(status.totalQueries)")
                    .fontWeight(.semibold)
                    .foregroundColor(.blue)
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
            .fontWeight(.semibold)
            .padding()
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [color, color.opacity(0.7)]), 
                    startPoint: .top, 
                    endPoint: .bottom
                )
            )
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.3), lineWidth: 2)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .shadow(color: color.opacity(0.3), radius: 4, x: 0, y: 2)
    }
}

// MARK: - Simple Color Picker
struct SimpleColorPicker: View {
    @ObservedObject var bleManager: BLEManager
    @Binding var selectedColor: Color
    
    var body: some View {
        HStack {
            Text("🎨 LED Color:")
                .font(.subheadline)
            
            Spacer()
            
            // Color Preview Circle
            Circle()
                .fill(selectedColor)
                .frame(width: 30, height: 30)
                .overlay(
                    Circle()
                        .stroke(Color.gray, lineWidth: 1)
                )
            
            // Color Picker
            ColorPicker("", selection: $selectedColor)
                .onChange(of: selectedColor) { newColor in
                    // Automatically send RGB command when color changes (permanent color)
                    let rgb = newColor.toRGB()
                    bleManager.sendCommand("LED_COLOR:\(rgb.red),\(rgb.green),\(rgb.blue)")
                }
                .labelsHidden()
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .onDisappear {
            // Send LED_OFF when exiting color picker
            bleManager.sendCommand("LED_OFF")
        }
    }
}

// MARK: - Preview
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
