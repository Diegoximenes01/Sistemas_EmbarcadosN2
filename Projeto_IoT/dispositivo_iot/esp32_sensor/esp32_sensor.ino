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
const int sensorPin   = 34; // Sensor de fumaça (GPIO34 - ADC)
const int ledVerde    = 23; // LED verde (GPIO23)
const int ledVermelho = 2;  // LED vermelho (GPIO2)
const int buzzer      = 18; // Buzzer pino de sinal (GPIO18)
const int buzzerGnd   = 19; // Buzzer pino de terra virtual (GPIO19)

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
const unsigned long intervaloEnvio = 10000; // Envia para TagoIO a cada 10 segundos
// ==========================================
// SETUP
// ==========================================
void setup()
{
  pinMode(sensorPin,   INPUT);
  pinMode(ledVerde,    OUTPUT);
  pinMode(ledVermelho, OUTPUT);
  pinMode(buzzer,      OUTPUT);
  pinMode(buzzerGnd,   OUTPUT);
  digitalWrite(buzzerGnd, LOW); // Define terra virtual para o Buzzer

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
    digitalWrite(ledVermelho, !digitalRead(ledVermelho)); // Pisca LED vermelho enquanto conecta
  }
  digitalWrite(ledVermelho, LOW);
  Serial.println(" Conectado!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  lcd.clear();
}

// ==========================================
// FUNÇÕES DE DISPLAY E SIRENE
// ==========================================

// Exibe estado seguro no LCD com valor dinâmico
void mostrarNormal(int valor)
{
  lcd.setCursor(0, 0);
  lcd.print("AMBIENTE SEGURO ");
  lcd.setCursor(0, 1);
  lcd.print("GAS: ");
  lcd.print(valor);
  lcd.print("       ");
}

// Exibe alerta no LCD com valor dinâmico
void mostrarAlerta(int valor)
{
  lcd.setCursor(0, 0);
  lcd.print("!!! ALERTA !!!  ");
  lcd.setCursor(0, 1);
  lcd.print("GAS: ");
  lcd.print(valor);
  lcd.print("       ");
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
    lcd.clear(); // Limpa na transição de estado
  }

  // Desativa alerta
  if (alertaAtivo && smoke <= limiteNormal)
  {
    alertaAtivo = false;
    noTone(buzzer);
    lcd.clear(); // Limpa na transição de estado
  }

  // --- Atuadores ---
  if (alertaAtivo)
  {
    digitalWrite(ledVermelho, HIGH);
    digitalWrite(ledVerde,    LOW);
    mostrarAlerta(smoke);
    sireneSuave();
  }
  else
  {
    digitalWrite(ledVermelho, LOW);
    digitalWrite(ledVerde,    HIGH);
    noTone(buzzer);
    mostrarNormal(smoke);
    delay(300);
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
