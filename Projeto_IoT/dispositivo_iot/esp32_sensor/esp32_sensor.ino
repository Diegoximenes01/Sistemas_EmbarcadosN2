/**
 * 🛡️ Arcanjos - Código IoT para ESP32 (Wokwi)
 *
 * Funcionalidades:
 *   - Conexão WiFi + HTTP POST direto para a TagoIO e Servidor local
 *   - LCD I2C para exibição de status local
 *   - Controle local de atuadores (LEDs e Buzzer)
 *
 * Componentes no Wokwi/Circuito Físico:
 *   - Sensor de Gás/Fumaça (potenciômetro simulando MQ-2) → GPIO34
 *   - LED Verde  → GPIO2
 *   - LED Vermelho → GPIO4
 *   - Buzzer     → GPIO5
 *   - LCD I2C    → SDA (GPIO21) / SCL (GPIO22)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>

// ==========================================
// CONFIGURAÇÕES DE REDE E TAGOIO
// ==========================================
const char* ssid     = "Wokwi-GUEST";
const char* password = "";

const char* tagoToken      = "1590acd8-26a1-41b8-a5cb-da6f022c5872";
const char* serverEndpoint = "https://api.tago.io/data";

// ==========================================
// LCD I2C (16 colunas x 2 linhas)
// ==========================================
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ==========================================
// DEFINIÇÃO DOS PINOS
// ==========================================
const int sensorPin   = 34; // Sensor de fumaça (GPIO34 - ADC, equivalente ao A5)
const int ledVerde    = 2;  // LED verde  (GPIO2  - equivalente ao pino 7)
const int ledVermelho = 4;  // LED vermelho (GPIO4 - equivalente ao pino 6)
const int buzzer      = 5;  // Buzzer (GPIO5 - mesmo pino)

// ==========================================
// LIMITES DO SENSOR (com histerese)
// ==========================================
const int limiteAlerta = 55; // Valor para entrar em alerta
const int limiteNormal = 40; // Valor para sair do alerta

// ==========================================
// VARIÁVEIS DE CONTROLE
// ==========================================
int  smoke       = 0;     // Valor lido do sensor (0-100)
bool alertaAtivo = false; // Estado atual do sistema

unsigned long tempoAnterior = 0;
const unsigned long intervaloEnvio = 2000; // Envia para TagoIO a cada 2 segundos

// ==========================================
// SETUP
// ==========================================
void setup()
{
  pinMode(sensorPin,   INPUT);
  pinMode(ledVerde,    OUTPUT);
  pinMode(ledVermelho, OUTPUT);
  pinMode(buzzer,      OUTPUT);

  Serial.begin(9600);

  // Inicializa o LCD
  lcd.init();
  lcd.backlight();

  // Mensagem inicial
  lcd.setCursor(0, 0);
  lcd.print("SISTEMA LIGANDO");
  lcd.setCursor(0, 1);
  lcd.print("MONITORANDO...");
  delay(2000);

  // Conecta ao WiFi
  Serial.print("Conectando WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(ledVermelho, !digitalRead(ledVermelho)); // Pisca enquanto conecta
  }
  digitalWrite(ledVermelho, LOW);
  Serial.println(" Conectado!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  mostrarNormal(); // Estado inicial seguro
}

// ==========================================
// FUNÇÕES DE DISPLAY E SIRENE
// ==========================================

// Exibe estado seguro no LCD
void mostrarNormal()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("AMBIENTE SEGURO");
  lcd.setCursor(0, 1);
  lcd.print("SEM FUMACA");
}

// Exibe alerta no LCD
void mostrarAlerta()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("!!! ALERTA !!!");
  lcd.setCursor(0, 1);
  lcd.print("FUMACA DETECTADA.");
}

// Sirene alternando frequências
void sireneSuave()
{
  tone(buzzer, 500); // Som grave
  delay(100);
  tone(buzzer, 800); // Som agudo
  delay(100);
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================
void loop()
{
  // Lê o sensor e mapeia para escala 0–100 (resolução de 12 bits do ESP32)
  int rawValue = analogRead(sensorPin);
  smoke = map(rawValue, 0, 4095, 0, 100);

  // Log serial
  Serial.print("Valor do sensor: ");
  Serial.println(smoke);

  // --- Lógica de histerese ---

  // Ativa alerta
  if (!alertaAtivo && smoke >= limiteAlerta)
  {
    alertaAtivo = true;
    mostrarAlerta();
  }

  // Desativa alerta
  if (alertaAtivo && smoke <= limiteNormal)
  {
    alertaAtivo = false;
    noTone(buzzer);
    mostrarNormal();
  }

  // --- Atuadores ---
  if (alertaAtivo)
  {
    digitalWrite(ledVermelho, HIGH);
    digitalWrite(ledVerde,    LOW);
    sireneSuave();
  }
  else
  {
    digitalWrite(ledVermelho, LOW);
    digitalWrite(ledVerde,    HIGH);
    noTone(buzzer);
    delay(50);
  }

  // --- Envio para TagoIO (a cada 2 segundos) ---
  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnterior >= intervaloEnvio)
  {
    tempoAnterior = tempoAtual;
    if (WiFi.status() == WL_CONNECTED)
    {
      enviarDadosTagoIO(smoke, alertaAtivo);
    }
    else
    {
      Serial.println("WiFi desconectado. Tentando reconectar...");
      WiFi.begin(ssid, password);
    }
  }
}

// ==========================================
// ENVIO HTTP PARA TAGOIO
// ==========================================
void enviarDadosTagoIO(int valorFumaca, bool estadoAlerta)
{
  HTTPClient http;
  http.begin(serverEndpoint);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", tagoToken);

  // Padrão exigido pela TagoIO (variáveis em minúsculo)
  String jsonPayload = "[";
  jsonPayload += "{\"variable\":\"smoke\",\"value\":"        + String(valorFumaca) + "},";
  jsonPayload += "{\"variable\":\"alertaativo\",\"value\":" + String(estadoAlerta ? 1 : 0) + "}";
  jsonPayload += "]";

  int httpCode = http.POST(jsonPayload);

  if (httpCode > 0)
  {
    Serial.print("TagoIO OK (HTTP ");
    Serial.print(httpCode);
    Serial.println(")");
  }
  else
  {
    Serial.print("TagoIO Erro: ");
    Serial.println(httpCode);
  }

  http.end();
}
